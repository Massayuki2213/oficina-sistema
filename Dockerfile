# syntax=docker/dockerfile:1.7
# ==========================================================
# Hermes — imagem de produção: a API servindo a tela.
#
#   docker build -t hermes:1.0.0 .
#
# Estágios: base (SO) → deps (tudo, para compilar) → build (tela +
# API) → prod-deps (só o que roda) → final. A imagem final não leva
# código-fonte, ferramentas de build nem dependências de desenvolvimento.
# ==========================================================

FROM node:24-bookworm-slim AS base
# openssl: o Prisma detecta a versão para escolher o motor certo.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Dependências completas (para compilar) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/desktop/package.json apps/desktop/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund

# ---- Build: tela (Vite) e API (tsup) ----
FROM deps AS build
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @hermes/desktop \
 && npm run build -w @hermes/api

# ---- Só as dependências que rodam em produção ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/desktop/package.json apps/desktop/
COPY packages/shared/package.json packages/shared/
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
RUN npm ci --omit=dev --no-audit --no-fund -w @hermes/api \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 # O contrato compartilhado já está dentro do dist/server.js (tsup noExternal).
 && rm -rf node_modules/@hermes

# ---- Final ----
FROM base AS final
# pg_dump 16 (o mesmo major do banco) para o backup automático e o manual.
# O Debian traz o 15, que se recusa a copiar um servidor 16 — vem do repositório oficial.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && apt-get purge -y curl gnupg && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=America/Sao_Paulo \
    API_PORT=3333 \
    WEB_DIR=/app/web \
    BACKUP_DIR=/app/backups

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/desktop/dist ./web
COPY apps/api/package.json ./package.json
COPY docker/entrypoint.sh /usr/local/bin/hermes-entrypoint
# Script salvo no Windows pode chegar com CRLF — o sh não perdoa.
RUN sed -i 's/\r$//' /usr/local/bin/hermes-entrypoint \
 && chmod +x /usr/local/bin/hermes-entrypoint \
 && mkdir -p /app/backups && chown node:node /app/backups

USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3333)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["hermes-entrypoint"]
