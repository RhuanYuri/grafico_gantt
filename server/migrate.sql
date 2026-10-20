-- ====================================================================
-- Script de Migração: Sistema de Autenticação e Equipes
-- Projeto: Gráfico de Gantt - Arquitetura de Computadores
-- ====================================================================

BEGIN;

-- 1. Criação da tabela de equipes
CREATE TABLE IF NOT EXISTS teams (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- 2. Criação da tabela de membros das equipes
CREATE TABLE IF NOT EXISTS team_members (
  team_id   text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- 3. Atualização da tabela de usuários para suportar autenticação
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW();

-- 4. Atualização da tabela de tarefas para pertencer a uma equipe
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id text REFERENCES teams(id) ON DELETE CASCADE;

-- 5. Inserir a equipe padrão "Arquitetura de Computadores"
INSERT INTO teams (id, name)
VALUES ('team-arq-comp', 'Arquitetura de Computadores')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 6. Configurar e-mails e senhas padrão (12345678) para usuários pré-existentes
-- Hash scrypt gerado para a senha '12345678'
-- cf -> caio@ufma.br
UPDATE users
SET email = 'caio@ufma.br',
    password_hash = COALESCE(password_hash, '512d1189cc7374aa10c25779533140b6:39cb68d0464ef94de82b624a598d28045257bfbd8762a8d0a2fd1e85b731ad87e93b19a8eb601ee7bda350cb24108ab813d3a55e608c963e695444995f1606c2')
WHERE id = 'cf' AND (email IS NULL OR email = '');

-- dl -> danilo@ufma.br
UPDATE users
SET email = 'danilo@ufma.br',
    password_hash = COALESCE(password_hash, '512d1189cc7374aa10c25779533140b6:39cb68d0464ef94de82b624a598d28045257bfbd8762a8d0a2fd1e85b731ad87e93b19a8eb601ee7bda350cb24108ab813d3a55e608c963e695444995f1606c2')
WHERE id = 'dl' AND (email IS NULL OR email = '');

-- ra -> raynara@ufma.br
UPDATE users
SET email = 'raynara@ufma.br',
    password_hash = COALESCE(password_hash, '512d1189cc7374aa10c25779533140b6:39cb68d0464ef94de82b624a598d28045257bfbd8762a8d0a2fd1e85b731ad87e93b19a8eb601ee7bda350cb24108ab813d3a55e608c963e695444995f1606c2')
WHERE id = 'ra' AND (email IS NULL OR email = '');

-- rs -> rhuan@ufma.br
UPDATE users
SET email = 'rhuan@ufma.br',
    password_hash = COALESCE(password_hash, '512d1189cc7374aa10c25779533140b6:39cb68d0464ef94de82b624a598d28045257bfbd8762a8d0a2fd1e85b731ad87e93b19a8eb601ee7bda350cb24108ab813d3a55e608c963e695444995f1606c2')
WHERE id = 'rs' AND (email IS NULL OR email = '');

-- yg -> yuri@ufma.br
UPDATE users
SET email = 'yuri@ufma.br',
    password_hash = COALESCE(password_hash, '512d1189cc7374aa10c25779533140b6:39cb68d0464ef94de82b624a598d28045257bfbd8762a8d0a2fd1e85b731ad87e93b19a8eb601ee7bda350cb24108ab813d3a55e608c963e695444995f1606c2')
WHERE id = 'yg' AND (email IS NULL OR email = '');

-- Caso existam outros usuários sem e-mail ou senha, preencher automaticamente
UPDATE users
SET email = id || '@ufma.br'
WHERE email IS NULL OR email = '';

UPDATE users
SET password_hash = '512d1189cc7374aa10c25779533140b6:39cb68d0464ef94de82b624a598d28045257bfbd8762a8d0a2fd1e85b731ad87e93b19a8eb601ee7bda350cb24108ab813d3a55e608c963e695444995f1606c2'
WHERE password_hash IS NULL OR password_hash = '';

-- Garantir que email seja único (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(LOWER(email));

-- 7. Associar todos os usuários existentes como membros da equipe "Arquitetura de Computadores"
INSERT INTO team_members (team_id, user_id, role)
SELECT 'team-arq-comp', id, 'member'
FROM users
ON CONFLICT (team_id, user_id) DO NOTHING;

-- 8. Associar todas as tarefas existentes à equipe "Arquitetura de Computadores"
UPDATE tasks
SET team_id = 'team-arq-comp'
WHERE team_id IS NULL;

-- Criar índice de performance para busca de tarefas por equipe
CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON tasks(team_id);

COMMIT;
