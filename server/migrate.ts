import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword } from './auth'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const DEFAULT_PASSWORD = '12345678'
export const DEFAULT_TEAM_ID = 'team-arq-comp'
export const DEFAULT_TEAM_NAME = 'Arquitetura de Computadores'

export const MASTER_USER = {
  id: 'master',
  name: 'Administrador Master',
  email: 'admin@ufma.br',
  color: '#0f172a',
}

export const DEFAULT_USER_EMAILS: Record<string, string> = {
  cf: 'caio@ufma.br',
  dl: 'danilo@ufma.br',
  ra: 'raynara@ufma.br',
  rs: 'rhuan@ufma.br',
  yg: 'yuri@ufma.br',
}

export async function migrate(pool: pg.Pool): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Criação das tabelas base caso não existam
    await client.query(`
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
      CREATE TABLE IF NOT EXISTS teams (
        id         text PRIMARY KEY,
        name       text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS team_members (
        team_id   text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role      text NOT NULL DEFAULT 'member',
        joined_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (team_id, user_id)
      );
    `)

    // 2. Colunas de autenticação e papel master em users
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW();
    `)

    // 3. Coluna team_id em tasks
    await client.query(`
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id text REFERENCES teams(id) ON DELETE CASCADE;
    `)

    // 4. Inserção da equipe padrão "Arquitetura de Computadores"
    await client.query(
      `INSERT INTO teams (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [DEFAULT_TEAM_ID, DEFAULT_TEAM_NAME],
    )

    // 5. Configurar senhas e e-mails para usuários existentes
    const defaultHash = hashPassword(DEFAULT_PASSWORD)

    for (const [id, email] of Object.entries(DEFAULT_USER_EMAILS)) {
      await client.query(
        `UPDATE users
         SET email = COALESCE(NULLIF(email, ''), $1),
             password_hash = COALESCE(password_hash, $2)
         WHERE id = $3`,
        [email, defaultHash, id],
      )
    }

    // 6. Criar ou atualizar usuário master com privilégios administrativos
    const masterPassword = process.env.MASTER_PASSWORD || DEFAULT_PASSWORD
    const masterHash = hashPassword(masterPassword)
    await client.query(
      `INSERT INTO users (id, name, email, color, password_hash, is_master)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (id) DO UPDATE
       SET is_master = true,
           password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
           email = COALESCE(users.email, EXCLUDED.email)`,
      [MASTER_USER.id, MASTER_USER.name, MASTER_USER.email, MASTER_USER.color, masterHash],
    )

    // Qualquer outro usuário que não tenha e-mail ou senha ganha fallback seguro
    await client.query(
      `UPDATE users
       SET email = id || '@ufma.br'
       WHERE email IS NULL OR email = ''`,
    )
    await client.query(
      `UPDATE users
       SET password_hash = $1
       WHERE password_hash IS NULL OR password_hash = ''`,
      [defaultHash],
    )

    // 7. Criar índice único para o e-mail (garantindo que seja único no sistema)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(LOWER(email));
    `)

    // 8. Associar todos os usuários existentes à equipe "Arquitetura de Computadores"
    await client.query(`
      INSERT INTO team_members (team_id, user_id, role)
      SELECT $1, id, 'member'
      FROM users
      ON CONFLICT (team_id, user_id) DO NOTHING;
    `, [DEFAULT_TEAM_ID])

    // Garantir que o master tenha papel owner na equipe padrão
    await client.query(`
      UPDATE team_members SET role = 'owner' WHERE team_id = $1 AND user_id = $2;
    `, [DEFAULT_TEAM_ID, MASTER_USER.id])

    // 9. Associar todas as tarefas legadas que estejam sem equipe para "Arquitetura de Computadores"
    await client.query(
      `UPDATE tasks
       SET team_id = $1
       WHERE team_id IS NULL`,
      [DEFAULT_TEAM_ID],
    )

    // Índice para performance das consultas por equipe
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON tasks(team_id);
    `)

    await client.query('COMMIT')
    console.log('✓ Migração concluída com sucesso: Dados, tarefas e usuário master configurados.')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Execução standalone via CLI: tsx server/migrate.ts
if (process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1])) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://gantt:gantt@localhost:5433/gantt',
  })
  migrate(pool)
    .then(async () => {
      await pool.end()
      process.exit(0)
    })
    .catch(async (e) => {
      console.error('Erro ao executar migração:', e)
      await pool.end()
      process.exit(1)
    })
}
