# Credenciais de Acesso ao Sistema e Painel Master

Abaixo estão listadas as credenciais de acesso ao sistema, incluindo a conta de **Administrador Master** e os colaboradores da disciplina.

Todos os usuários pertencem à equipe **"Arquitetura de Computadores"** e possuem acesso integral ao cronograma do projeto.

---

## 🛡️ Usuário Administrador Master (Produção)

O sistema conta com um usuário **Master** com privilégios administrativos globais para gerenciar contas, alterar senhas e acessar o ambiente de qualquer colaborador para prestar suporte:

| Papel | Nome | E-mail de Acesso | Senha Padrão | Privilégio |
|---|---|---|---|---|
| **Administrador Master** | Administrador Master | `admin@ufma.br` | `12345678` | Acesso total e Painel Master |

> **Nota:** Em produção, você pode definir uma senha personalizada para o master definindo a variável de ambiente `MASTER_PASSWORD` no container do app (ex: `MASTER_PASSWORD=MinhaSenhaForte2026`). Se não for definida, a senha padrão é `12345678`.

---

## 👥 Colaboradores Cadastrados

| Nome Completo | E-mail de Acesso | Senha Padrão | Equipe |
|---|---|---|---|
| **Caio Ferreira Sousa** | `caio@ufma.br` | `12345678` | Arquitetura de Computadores |
| **Danilo Nava Soares Lima** | `danilo@ufma.br` | `12345678` | Arquitetura de Computadores |
| **Raynara Ribeiro Alves** | `raynara@ufma.br` | `12345678` | Arquitetura de Computadores |
| **Rhuã Yuri Nascimento Sardinha** | `rhuan@ufma.br` | `12345678` | Arquitetura de Computadores |
| **Yuri Aguiar Gonçalves** | `yuri@ufma.br` | `12345678` | Arquitetura de Computadores |

---

## ⚡ Recursos do Usuário Master

Ao efetuar login com `admin@ufma.br`, o Administrador Master ganha acesso ao botão **"🛡️ Painel Master"** no topo da tela e no menu do usuário:

1. **Alteração de Senhas**:
   - No painel master, clique no botão **"🔑 Senha"** ao lado de qualquer usuário.
   - Digite a nova senha desejada (mínimo de 6 caracteres) e clique em **"Salvar Nova Senha"**. A senha é atualizada imediatamente no banco com criptografia scrypt e o usuário já poderá logar com ela.

2. **Acesso Direto à Conta (Impersonação / Suporte)**:
   - Ao lado de qualquer usuário no painel master, clique em **"👤 Acessar Conta"**.
   - O sistema comuta a sessão e você passará a visualizar e operar no sistema **exatamente como aquele usuário** (suas equipes, suas permissões e tarefas).
   - Uma barra de aviso no topo da tela ficará visível:  
     `⚠️ SUPORTE MASTER: Você está acessando a conta de [Nome] ([email]) [🛡️ Voltar para Administrador Master]`
   - Clique em **"Voltar para Administrador Master"** a qualquer momento para retornar instantaneamente à conta Master.

3. **Edição de Dados Cadastrais**:
   - O Master pode alterar nome e e-mail de qualquer usuário através do botão **"✏️ Editar"**. O sistema valida rigorosamente a unicidade do e-mail.

---

## 🚀 Como Aplicar em Produção

A migração é 100% idempotente (pode ser executada múltiplas vezes sem apagar dados nem duplicar tarefas).

### Opção 1: Via Container Docker da Aplicação (Recomendado)
```bash
docker compose exec app npm run db:migrate
```

### Opção 2: Via Script SQL diretamente no PostgreSQL
```bash
docker compose exec -T db psql -U gantt -d gantt < server/migrate.sql
```

Ambas as opções:
- Criam a coluna `is_master` em `users`.
- Criam ou atualizam o usuário `admin@ufma.br` como master.
- Criam ou preservam as tarefas existentes e as vinculam à equipe padrão `"Arquitetura de Computadores"`.
