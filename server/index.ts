import express from 'express'
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Task, TaskStatus, User, Team, AdminUser } from '../src/types'
import { SEED_TASKS, SEED_USERS } from './seed'
import { authMiddleware, masterMiddleware, hashPassword, signToken, verifyPassword, verifyToken, type AuthenticatedRequest } from './auth'
import { migrate, DEFAULT_TEAM_ID, DEFAULT_TEAM_NAME, DEFAULT_PASSWORD } from './migrate'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://gantt:gantt@localhost:5433/gantt',
})

async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const r = await fn(c)
    await c.query('COMMIT')
    return r
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  } finally {
    c.release()
  }
}

async function getUserTeams(userId: string): Promise<Team[]> {
  const res = await pool.query(
    `SELECT t.id, t.name, tm.role,
            (SELECT count(*)::int FROM team_members WHERE team_id = t.id) AS "memberCount",
            t.created_at AS "createdAt"
     FROM teams t
     JOIN team_members tm ON t.id = tm.team_id
     WHERE tm.user_id = $1
     ORDER BY t.name`,
    [userId],
  )
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role as 'owner' | 'member',
    memberCount: r.memberCount,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
  }))
}

async function isTeamMember(teamId: string, userId: string): Promise<boolean> {
  const res = await pool.query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  )
  return (res.rowCount ?? 0) > 0
}

async function insertTask(c: pg.PoolClient, t: Task, teamId: string) {
  await c.query(
    `INSERT INTO tasks (id, team_id, title, description, start_date, end_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET title=$3, description=$4, start_date=$5, end_date=$6, status=$7, team_id=$2`,
    [t.id, teamId, t.title, t.description, t.start, t.end, t.status],
  )
}

async function setRelations(c: pg.PoolClient, t: Task) {
  await c.query('DELETE FROM task_assignees WHERE task_id=$1', [t.id])
  await c.query('DELETE FROM task_dependencies WHERE task_id=$1', [t.id])
  for (const u of t.assigneeIds) {
    await c.query('INSERT INTO task_assignees (task_id, user_id) VALUES ($1,$2)', [t.id, u])
  }
  for (const p of t.predecessors) {
    await c.query('INSERT INTO task_dependencies (task_id, predecessor_id, type) VALUES ($1,$2,$3)', [t.id, p.taskId, p.type])
  }
}

async function readTeamState(teamId: string): Promise<{ team: Team | null; users: User[]; tasks: Task[] }> {
  const teamRes = await pool.query('SELECT id, name FROM teams WHERE id = $1', [teamId])
  const team = teamRes.rows[0] ? { id: teamRes.rows[0].id, name: teamRes.rows[0].name } : null

  const users = await pool.query(
    `SELECT u.id, u.name, u.email, u.color, u.avatar_url
     FROM users u
     JOIN team_members tm ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY u.name`,
    [teamId],
  )
  const tasks = await pool.query(
    `SELECT id, team_id, title, description, to_char(start_date,'YYYY-MM-DD') AS start,
            to_char(end_date,'YYYY-MM-DD') AS "end", status
     FROM tasks
     WHERE team_id = $1
     ORDER BY position`,
    [teamId],
  )
  const assignees = await pool.query(
    `SELECT ta.task_id, ta.user_id
     FROM task_assignees ta
     JOIN tasks t ON ta.task_id = t.id
     WHERE t.team_id = $1`,
    [teamId],
  )
  const deps = await pool.query(
    `SELECT td.task_id, td.predecessor_id, td.type
     FROM task_dependencies td
     JOIN tasks t ON td.task_id = t.id
     WHERE t.team_id = $1`,
    [teamId],
  )
  return {
    team,
    users: users.rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email ?? '',
      color: u.color,
      ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
    })),
    tasks: tasks.rows.map((r) => ({
      id: r.id,
      teamId: r.team_id,
      title: r.title,
      description: r.description,
      start: r.start,
      end: r.end,
      status: r.status as TaskStatus,
      assigneeIds: assignees.rows.filter((a) => a.task_id === r.id).map((a) => a.user_id),
      predecessors: deps.rows.filter((d) => d.task_id === r.id).map((d) => ({ taskId: d.predecessor_id, type: d.type })),
    })),
  }
}

function validTask(b: unknown): b is Task {
  const t = b as Task
  return (
    !!t &&
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.end) &&
    t.end >= t.start &&
    ['pending', 'in_progress', 'done'].includes(t.status) &&
    Array.isArray(t.assigneeIds) &&
    Array.isArray(t.predecessors)
  )
}

const PALETTE = ['#2f6fe0', '#7b4fd6', '#e8772e', '#14919b', '#c2417a', '#10b981', '#f59e0b', '#6366f1']

async function resetDefaultTeam(c: pg.PoolClient) {
  // Limpar apenas tarefas da equipe "Arquitetura de Computadores"
  const taskIdsRes = await c.query("SELECT id FROM tasks WHERE team_id = 'team-arq-comp'")
  const taskIds = taskIdsRes.rows.map((r) => r.id)
  if (taskIds.length > 0) {
    await c.query('DELETE FROM tasks WHERE team_id = $1', ['team-arq-comp'])
  }
  // Garantir que a equipe exista
  await c.query(
    `INSERT INTO teams (id, name) VALUES ('team-arq-comp', 'Arquitetura de Computadores')
     ON CONFLICT (id) DO NOTHING`,
  )
  // Garantir que os usuários semente existam e façam parte da equipe
  const defaultHash = hashPassword(DEFAULT_PASSWORD)
  for (const u of SEED_USERS) {
    await c.query(
      `INSERT INTO users (id, name, email, color, avatar_url, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, email = EXCLUDED.email, color = EXCLUDED.color`,
      [u.id, u.name, u.email, u.color, u.avatarUrl ?? null, defaultHash],
    )
    await c.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ('team-arq-comp', $1, 'member')
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [u.id],
    )
  }
  // Inserir tarefas e relações
  for (const t of SEED_TASKS) await insertTask(c, t, 'team-arq-comp')
  for (const t of SEED_TASKS) await setRelations(c, t)
}

async function main() {
  // Aguarda o banco ficar disponível (útil logo após docker compose up)
  for (let i = 0; ; i++) {
    try {
      await pool.query('SELECT 1')
      break
    } catch (e) {
      if (i >= 30) throw e
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  // Executa migração idempotente (cria tabelas, colunas, equipes e migra dados sem perda)
  await migrate(pool)

  const app = express()
  app.use(express.json())

  const wrap =
    (fn: express.RequestHandler): express.RequestHandler =>
    (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next)

  // -------------------------------------------------------------
  // ROTAS DE AUTENTICAÇÃO
  // -------------------------------------------------------------

  app.post('/api/auth/register', wrap(async (req, res) => {
    const { name, email, password, color } = req.body ?? {}
    if (!name || typeof name !== 'string' || !name.trim()) {
      return void res.status(400).json({ error: 'O nome é obrigatório.' })
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return void res.status(400).json({ error: 'Um e-mail válido é obrigatório.' })
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return void res.status(400).json({ error: 'A senha deve conter pelo menos 6 caracteres.' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanName = name.trim()

    // Validação de unicidade de e-mail
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail])
    if ((existing.rowCount ?? 0) > 0) {
      return void res.status(409).json({ error: 'Este e-mail já está em uso por outro usuário.' })
    }

    const userId = `u_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`
    const userColor = color && typeof color === 'string' ? color : PALETTE[Math.floor(Math.random() * PALETTE.length)]
    const passwordHash = hashPassword(password)

    await tx(async (c) => {
      await c.query(
        `INSERT INTO users (id, name, email, color, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, cleanName, cleanEmail, userColor, passwordHash],
      )

      // Criar uma equipe pessoal para o novo usuário
      const teamId = `team_${userId}`
      const teamName = `Equipe de ${cleanName.split(' ')[0]}`
      await c.query(
        `INSERT INTO teams (id, name) VALUES ($1, $2)`,
        [teamId, teamName],
      )
      await c.query(
        `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [teamId, userId],
      )
      // Também adiciona o novo usuário como membro na equipe padrão "Arquitetura de Computadores" para facilitar colaboração
      await c.query(
        `INSERT INTO team_members (team_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (team_id, user_id) DO NOTHING`,
        [DEFAULT_TEAM_ID, userId],
      )
    })

    const token = signToken({ userId })
    const user: User = { id: userId, name: cleanName, email: cleanEmail, color: userColor }
    const teams = await getUserTeams(userId)
    const activeTeamId = teams.find((t) => t.id === DEFAULT_TEAM_ID)?.id ?? teams[0]?.id ?? null

    res.status(201).json({ token, user, teams, activeTeamId })
  }))

  app.post('/api/auth/login', wrap(async (req, res) => {
    const { email, password } = req.body ?? {}
    if (!email || !password) {
      return void res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const { rows } = await pool.query(
      `SELECT id, name, email, color, avatar_url, password_hash, is_master
       FROM users
       WHERE LOWER(email) = $1`,
      [cleanEmail],
    )

    if (rows.length === 0) {
      return void res.status(401).json({ error: 'Credenciais inválidas: e-mail não encontrado.' })
    }

    const u = rows[0]
    if (!u.password_hash || !verifyPassword(password, u.password_hash)) {
      return void res.status(401).json({ error: 'Credenciais inválidas: senha incorreta.' })
    }

    const token = signToken({ userId: u.id, isMaster: u.is_master ?? false })
    const user: User = {
      id: u.id,
      name: u.name,
      email: u.email,
      color: u.color,
      isMaster: u.is_master ?? false,
      ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
    }

    const teams = await getUserTeams(u.id)
    // Dá preferência para a equipe 'team-arq-comp' se for membro, caso contrário a primeira
    const activeTeamId = teams.find((t) => t.id === DEFAULT_TEAM_ID)?.id ?? teams[0]?.id ?? null

    res.json({ token, user, teams, activeTeamId })
  }))

  app.get('/api/auth/me', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId!
    const { rows } = await pool.query(
      'SELECT id, name, email, color, avatar_url, is_master FROM users WHERE id = $1',
      [userId],
    )
    if (rows.length === 0) return void res.status(404).json({ error: 'Usuário não encontrado.' })

    const u = rows[0]
    const user: User = {
      id: u.id,
      name: u.name,
      email: u.email ?? '',
      color: u.color,
      isMaster: u.is_master ?? false,
      ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
    }
    const teams = await getUserTeams(userId)
    const activeTeamId = teams.find((t) => t.id === DEFAULT_TEAM_ID)?.id ?? teams[0]?.id ?? null

    res.json({ user, teams, activeTeamId })
  }))

  // Edição do perfil (inclusive e-mail com garantia de unicidade estrita)
  app.put('/api/auth/profile', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId!
    const { name, email, color, password } = req.body ?? {}

    const currentUserRes = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId])
    if (currentUserRes.rowCount === 0) return void res.status(404).json({ error: 'Usuário não encontrado.' })

    if (email && typeof email === 'string') {
      const cleanEmail = email.trim().toLowerCase()
      if (!cleanEmail.includes('@')) {
        return void res.status(400).json({ error: 'Formato de e-mail inválido.' })
      }
      // Validação de e-mail único
      const conflict = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2',
        [cleanEmail, userId],
      )
      if ((conflict.rowCount ?? 0) > 0) {
        return void res.status(400).json({ error: 'Este e-mail já está em uso por outro usuário. O e-mail precisa ser único.' })
      }
    }

    const updates: string[] = []
    const values: unknown[] = []
    let pIndex = 1

    if (name && typeof name === 'string' && name.trim()) {
      updates.push(`name = $${pIndex++}`)
      values.push(name.trim())
    }
    if (email && typeof email === 'string' && email.trim()) {
      updates.push(`email = $${pIndex++}`)
      values.push(email.trim().toLowerCase())
    }
    if (color && typeof color === 'string' && color.trim()) {
      updates.push(`color = $${pIndex++}`)
      values.push(color.trim())
    }
    if (password && typeof password === 'string' && password.length >= 6) {
      updates.push(`password_hash = $${pIndex++}`)
      values.push(hashPassword(password))
    }

    if (updates.length > 0) {
      values.push(userId)
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${pIndex}`, values)
    }

    const updatedRes = await pool.query('SELECT id, name, email, color, avatar_url, is_master FROM users WHERE id = $1', [userId])
    const u = updatedRes.rows[0]
    res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email ?? '',
        color: u.color,
        isMaster: u.is_master ?? false,
        ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
      },
    })
  }))

  // -------------------------------------------------------------
  // ROTAS ADMINISTRATIVAS (EXCLUSIVAS DO USUÁRIO MASTER)
  // -------------------------------------------------------------

  // Listar todos os usuários do sistema com equipes e estatísticas
  app.get('/api/admin/users', authMiddleware, masterMiddleware, wrap(async (_req: AuthenticatedRequest, res) => {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.color, u.avatar_url, u.is_master AS "isMaster",
             to_char(u.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
             (SELECT count(*)::int FROM team_members WHERE user_id = u.id) AS "teamCount",
             COALESCE(
               (
                 SELECT json_agg(
                   json_build_object('id', t.id, 'name', t.name, 'role', tm.role)
                 )
                 FROM team_members tm
                 JOIN teams t ON tm.team_id = t.id
                 WHERE tm.user_id = u.id
               ),
               '[]'::json
             ) AS teams
      FROM users u
      ORDER BY u.is_master DESC, u.name ASC
    `)

    const users: AdminUser[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email ?? '',
      color: r.color,
      isMaster: r.isMaster ?? false,
      createdAt: r.createdAt,
      teamCount: r.teamCount ?? 0,
      teams: r.teams ?? [],
      ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
    }))

    res.json(users)
  }))

  // Alterar senha de qualquer usuário diretamente (pelo Administrador Master)
  app.put('/api/admin/users/:userId/password', authMiddleware, masterMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const targetUserId = String(req.params.userId)
    const { newPassword } = req.body ?? {}

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return void res.status(400).json({ error: 'A nova senha deve conter pelo menos 6 caracteres.' })
    }

    const check = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [targetUserId])
    if (check.rowCount === 0) {
      return void res.status(404).json({ error: 'Usuário não encontrado.' })
    }

    const newHash = hashPassword(newPassword)
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, targetUserId])

    res.json({
      message: `Senha do usuário ${check.rows[0].name} (${check.rows[0].email}) alterada com sucesso!`,
    })
  }))

  // Atualizar dados cadastrais de um usuário pelo Administrador Master
  app.put('/api/admin/users/:userId', authMiddleware, masterMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const targetUserId = String(req.params.userId)
    const { name, email, color, isMaster } = req.body ?? {}

    const check = await pool.query('SELECT id, email, is_master FROM users WHERE id = $1', [targetUserId])
    if (check.rowCount === 0) {
      return void res.status(404).json({ error: 'Usuário não encontrado.' })
    }

    if (email && typeof email === 'string') {
      const cleanEmail = email.trim().toLowerCase()
      if (!cleanEmail.includes('@')) {
        return void res.status(400).json({ error: 'Formato de e-mail inválido.' })
      }
      const conflict = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2',
        [cleanEmail, targetUserId],
      )
      if ((conflict.rowCount ?? 0) > 0) {
        return void res.status(400).json({ error: 'Este e-mail já está em uso por outro usuário.' })
      }
    }

    const updates: string[] = []
    const values: unknown[] = []
    let pIndex = 1

    if (name && typeof name === 'string' && name.trim()) {
      updates.push(`name = $${pIndex++}`)
      values.push(name.trim())
    }
    if (email && typeof email === 'string' && email.trim()) {
      updates.push(`email = $${pIndex++}`)
      values.push(email.trim().toLowerCase())
    }
    if (color && typeof color === 'string' && color.trim()) {
      updates.push(`color = $${pIndex++}`)
      values.push(color.trim())
    }
    if (typeof isMaster === 'boolean') {
      updates.push(`is_master = $${pIndex++}`)
      values.push(isMaster)
    }

    if (updates.length > 0) {
      values.push(targetUserId)
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${pIndex}`, values)
    }

    const updated = await pool.query(
      'SELECT id, name, email, color, avatar_url, is_master AS "isMaster" FROM users WHERE id = $1',
      [targetUserId],
    )
    const u = updated.rows[0]
    res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email ?? '',
        color: u.color,
        isMaster: u.isMaster ?? false,
        ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
      },
    })
  }))

  // Acessar a conta de qualquer usuário (Impersonation / Suporte Master)
  app.post('/api/admin/impersonate/:userId', authMiddleware, masterMiddleware, wrap(async (_req: AuthenticatedRequest, res) => {
    const targetUserId = String(_req.params.userId)

    const userRes = await pool.query(
      'SELECT id, name, email, color, avatar_url, is_master FROM users WHERE id = $1',
      [targetUserId],
    )
    if (userRes.rowCount === 0) {
      return void res.status(404).json({ error: 'Usuário de destino não encontrado.' })
    }

    const u = userRes.rows[0]
    const token = signToken({ userId: u.id, isMaster: u.is_master ?? false })
    const user: User = {
      id: u.id,
      name: u.name,
      email: u.email ?? '',
      color: u.color,
      isMaster: u.is_master ?? false,
      ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
    }

    const teams = await getUserTeams(u.id)
    const activeTeamId = teams.find((t) => t.id === DEFAULT_TEAM_ID)?.id ?? teams[0]?.id ?? null

    res.json({ token, user, teams, activeTeamId })
  }))

  // -------------------------------------------------------------
  // ROTAS DE EQUIPES
  // -------------------------------------------------------------

  app.get('/api/teams', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    res.json(await getUserTeams(req.userId!))
  }))

  app.post('/api/teams', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const userId = req.userId!
    const { name } = req.body ?? {}
    if (!name || typeof name !== 'string' || !name.trim()) {
      return void res.status(400).json({ error: 'O nome da equipe é obrigatório.' })
    }

    const teamId = `team_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`
    const teamName = name.trim()

    await tx(async (c) => {
      await c.query('INSERT INTO teams (id, name) VALUES ($1, $2)', [teamId, teamName])
      await c.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)', [teamId, userId, 'owner'])
    })

    const teams = await getUserTeams(userId)
    const createdTeam = teams.find((t) => t.id === teamId)
    res.status(201).json(createdTeam)
  }))

  app.get('/api/teams/:teamId/members', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const teamId = String(req.params.teamId)
    const userId = req.userId!
    if (!(await isTeamMember(teamId, userId))) {
      return void res.status(403).json({ error: 'Você não tem acesso a esta equipe.' })
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.color, u.avatar_url, tm.role, tm.joined_at AS "joinedAt"
       FROM users u
       JOIN team_members tm ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY u.name`,
      [teamId],
    )
    res.json(rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email ?? '',
      color: u.color,
      role: u.role,
      joinedAt: u.joinedAt,
      ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
    })))
  }))

  // Adicionar membro na equipe simplesmente inserindo o e-mail dele se já estiver na base (sem pedido)
  app.post('/api/teams/:teamId/members', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const teamId = String(req.params.teamId)
    const requesterId = req.userId!
    const { email } = req.body ?? {}

    if (!(await isTeamMember(teamId, requesterId))) {
      return void res.status(403).json({ error: 'Você não pertence a esta equipe.' })
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return void res.status(400).json({ error: 'Informe o e-mail do usuário a ser adicionado.' })
    }

    const cleanEmail = email.trim().toLowerCase()

    // 1. Verificar se o usuário com este e-mail existe na base de dados
    const userRes = await pool.query(
      'SELECT id, name, email, color, avatar_url FROM users WHERE LOWER(email) = $1',
      [cleanEmail],
    )

    if (userRes.rowCount === 0) {
      return void res.status(404).json({
        error: `Nenhum usuário com o e-mail "${cleanEmail}" foi encontrado na base de dados.`,
      })
    }

    const targetUser = userRes.rows[0]

    // 2. Verificar se já é membro da equipe
    const alreadyMember = await isTeamMember(teamId, targetUser.id)
    if (alreadyMember) {
      return void res.status(400).json({
        error: `O usuário ${targetUser.name} (${cleanEmail}) já faz parte desta equipe.`,
      })
    }

    // 3. Adicionar diretamente à equipe
    await pool.query(
      'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)',
      [teamId, targetUser.id, 'member'],
    )

    // Retorna a lista atualizada de membros da equipe
    const membersRes = await pool.query(
      `SELECT u.id, u.name, u.email, u.color, u.avatar_url, tm.role, tm.joined_at AS "joinedAt"
       FROM users u
       JOIN team_members tm ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY u.name`,
      [teamId],
    )

    res.status(201).json({
      message: `${targetUser.name} foi adicionado(a) à equipe com sucesso!`,
      addedUser: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        color: targetUser.color,
        ...(targetUser.avatar_url ? { avatarUrl: targetUser.avatar_url } : {}),
      },
      members: membersRes.rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email ?? '',
        color: u.color,
        role: u.role,
        joinedAt: u.joinedAt,
        ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
      })),
    })
  }))

  // Remover membro da equipe
  app.delete('/api/teams/:teamId/members/:userId', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const teamId = String(req.params.teamId)
    const userId = String(req.params.userId)
    const requesterId = req.userId!

    if (!(await isTeamMember(teamId, requesterId))) {
      return void res.status(403).json({ error: 'Você não tem permissão para remover membros desta equipe.' })
    }

    // Não permitir remover a si mesmo se for o único membro
    const memberCountRes = await pool.query('SELECT count(*)::int AS n FROM team_members WHERE team_id = $1', [teamId])
    if (memberCountRes.rows[0].n <= 1) {
      return void res.status(400).json({ error: 'A equipe precisa ter pelo menos um membro.' })
    }

    await pool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId])
    res.status(204).end()
  }))

  // -------------------------------------------------------------
  // ROTAS DE TAREFAS E ESTADO (ISOLADAS POR EQUIPE)
  // -------------------------------------------------------------

  app.get('/api/teams/:teamId/state', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const teamId = String(req.params.teamId)
    const userId = req.userId!

    if (!(await isTeamMember(teamId, userId))) {
      return void res.status(403).json({ error: 'Acesso negado: você não pertence a esta equipe.' })
    }

    const state = await readTeamState(teamId)
    res.json(state)
  }))

  // Rota de compatibilidade retroativa para /api/state
  app.get('/api/state', wrap(async (req, res) => {
    const authHeader = req.headers.authorization
    let teamId = req.query.teamId as string | undefined

    if (authHeader?.startsWith('Bearer ')) {
      const payload = verifyToken(authHeader.slice(7).trim())
      if (payload) {
        if (!teamId) {
          const teams = await getUserTeams(payload.userId)
          teamId = teams.find((t) => t.id === DEFAULT_TEAM_ID)?.id ?? teams[0]?.id
        }
      }
    }

    if (!teamId) {
      teamId = DEFAULT_TEAM_ID
    }

    const state = await readTeamState(teamId)
    res.json(state)
  }))

  app.put('/api/tasks/:id', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const taskId = String(req.params.id)
    const task = { ...req.body, id: taskId }
    if (!validTask(task)) return void res.status(400).json({ error: 'Tarefa inválida' })

    const teamId = (req.body.teamId as string) || (req.query.teamId as string) || DEFAULT_TEAM_ID
    const userId = req.userId!

    if (!(await isTeamMember(teamId, userId))) {
      return void res.status(403).json({ error: 'Você não tem permissão para editar tarefas desta equipe.' })
    }

    await tx(async (c) => {
      await insertTask(c, task, teamId)
      await setRelations(c, task)
    })
    res.json({ ...task, teamId })
  }))

  app.delete('/api/tasks/:id', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const taskId = String(req.params.id)
    const taskRes = await pool.query('SELECT team_id FROM tasks WHERE id = $1', [taskId])
    if (taskRes.rowCount === 0) return void res.status(204).end()

    const taskTeamId = taskRes.rows[0].team_id
    if (!(await isTeamMember(taskTeamId, req.userId!))) {
      return void res.status(403).json({ error: 'Você não tem permissão para excluir tarefas desta equipe.' })
    }

    await pool.query('DELETE FROM tasks WHERE id=$1', [taskId])
    res.status(204).end()
  }))

  app.post('/api/teams/:teamId/reset', authMiddleware, wrap(async (req: AuthenticatedRequest, res) => {
    const teamId = String(req.params.teamId)
    if (teamId !== DEFAULT_TEAM_ID) {
      return void res.status(400).json({ error: 'Apenas a equipe Arquitetura de Computadores possui dados padrões de restauração.' })
    }
    await tx(resetDefaultTeam)
    res.json(await readTeamState(teamId))
  }))

  // Compatibilidade com /api/reset legado
  app.post('/api/reset', wrap(async (_req, res) => {
    await tx(resetDefaultTeam)
    res.json(await readTeamState(DEFAULT_TEAM_ID))
  }))

  app.get('/api/health', wrap(async (_req, res) => void res.json({ status: 'ok' })))

  // -------------------------------------------------------------
  // SERVIR FRONTEND ESTÁTICO (PRODUÇÃO)
  // -------------------------------------------------------------
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const candidateDistPaths = [
    path.resolve(__dirname, '../dist'),
    path.resolve(__dirname, 'dist'),
    path.resolve(__dirname, '.'),
  ]
  const distPath = candidateDistPaths.find((p) => fs.existsSync(path.join(p, 'index.html')))

  if (distPath) {
    app.use(express.static(distPath))
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(distPath, 'index.html'))
      }
      next()
    })
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    res.status(500).json({ error: err.message })
  })

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000)
  const host = process.env.HOST ?? '0.0.0.0'
  app.listen(port, host, () => {
    console.log(`Servidor rodando em http://${host}:${port}`)
    if (distPath) {
      console.log(`Frontend estático servido a partir de: ${distPath}`)
    }
  })
}

main().catch((e) => {
  console.error('Falha ao iniciar a API:', e)
  process.exit(1)
})
