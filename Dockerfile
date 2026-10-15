# ==========================================
# Estágio 1: Builder (Frontend + Backend)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copia arquivos de definição de dependências
COPY package*.json ./

# Instala todas as dependências (necessárias para build e tipagem)
RUN npm ci

# Copia todo o código-fonte da aplicação
COPY . .

# Executa checagem de tipos (tsc) e compilação do Vite + server (esbuild)
RUN npm run build

# ==========================================
# Estágio 2: Runner (Imagem final de produção)
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copia os manifestos para instalar somente dependências de produção
COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

# Copia a pasta dist compilada contendo o frontend e o server.js
COPY --from=builder /app/dist ./dist

# Utiliza usuário não-root nativo do Node Alpine para maior segurança
USER node

# Porta padrão exposta (Coolify mapeia automaticamente)
EXPOSE 3000

# Healthcheck nativo usando o próprio fetch do Node.js
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Comando para iniciar o servidor Express unificado (API + SPA)
CMD ["node", "dist/server.js"]
