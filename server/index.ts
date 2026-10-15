import express from 'express'
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Task, TaskStatus, User } from '../src/types'
import { SEED_TASKS, SEED_USERS } from './seed'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://gantt:gantt@localhost:5433/gantt',
})

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  color      text NOT NULL,
  avatar_url text
);
CREATE TABLE IF NOT EXISTS tasks (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  status      text NOT NULL CHECK (status IN ('pending','in_progress','done')),
  position    serial,
  CHECK (end_date >= start_date)
);
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id        text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  predecessor_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type           text NOT NULL DEFAULT 'FS',
  PRIMARY KEY (task_id, predecessor_id),
  CHECK (task_id <> predecessor_id)
);
`

async function insertTask(c: pg.PoolClient, t: Task) {
  await c.query(
    `INSERT INTO tasks (id, title, description, start_date, end_date, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET title=$2, description=$3, start_date=$4, end_date=$5, status=$6`,
    [t.id, t.title, t.description, t.start, t.end, t.status],
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

async function seed(c: pg.PoolClient) {
  await c.query('TRUNCATE task_dependencies, task_assignees, tasks, users RESTART IDENTITY CASCADE')
  for (const u of SEED_USERS) {
    await c.query('INSERT INTO users (id,name,color,avatar_url) VALUES ($1,$2,$3,$4)', [u.id, u.name, u.color, u.avatarUrl ?? null])
  }
  // tarefas primeiro, relações depois (as FKs exigem que todas existam)
  for (const t of SEED_TASKS) await insertTask(c, t)
  for (const t of SEED_TASKS) await setRelations(c, t)
}

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

async function readState(): Promise<{ users: User[]; tasks: Task[] }> {
  const users = await pool.query('SELECT id, name, color, avatar_url FROM users ORDER BY name')
  const tasks = await pool.query(
    `SELECT id, title, description, to_char(start_date,'YYYY-MM-DD') AS start,
            to_char(end_date,'YYYY-MM-DD') AS "end", status
     FROM tasks ORDER BY position`,
  )
  const assignees = await pool.query('SELECT task_id, user_id FROM task_assignees')
  const deps = await pool.query('SELECT task_id, predecessor_id, type FROM task_dependencies')
  return {
    users: users.rows.map((u) => ({ id: u.id, name: u.name, color: u.color, ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}) })),
    tasks: tasks.rows.map((r) => ({
      id: r.id,
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

async function main() {
  // Aguarda o banco ficar disponível (útil logo após `docker compose up`)
  for (let i = 0; ; i++) {
    try {
      await pool.query('SELECT 1')
      break
    } catch (e) {
      if (i >= 30) throw e
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  await pool.query(SCHEMA)
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM tasks')
  if (rows[0].n === 0) await tx(seed)

  const app = express()
  app.use(express.json())

  const wrap =
    (fn: express.RequestHandler): express.RequestHandler =>
    (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next)

  app.get('/api/state', wrap(async (_req, res) => void res.json(await readState())))

  app.put('/api/tasks/:id', wrap(async (req, res) => {
    const task = { ...req.body, id: req.params.id }
    if (!validTask(task)) return void res.status(400).json({ error: 'Tarefa inválida' })
    await tx(async (c) => {
      await insertTask(c, task)
      await setRelations(c, task)
    })
    res.json(task)
  }))

  app.delete('/api/tasks/:id', wrap(async (req, res) => {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id])
    res.status(204).end()
  }))

  app.get('/api/health', wrap(async (_req, res) => void res.json({ status: 'ok' })))

  app.post('/api/reset', wrap(async (_req, res) => {
    await tx(seed)
    res.json(await readState())
  }))

  // Servir frontend compilado (produção)
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
