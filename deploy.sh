#!/bin/bash
# ─── EIXO — Deploy sem downtime ───────────────────────────────────────────────
# Uso: ./deploy.sh
# Pré-requisito: PM2 instalado (npm install -g pm2)
#                .env.production configurado em server/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
ENV_FILE="server/.env.production"

if [ ! -f "$ENV_FILE" ]; then
    echo "Erro: arquivo $ENV_FILE não encontrado."
    exit 1
fi

# Carrega variáveis de ambiente de forma segura (sem quebrar com comentários)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
    echo "Erro: DATABASE_URL não definido em $ENV_FILE."
    exit 1
fi

PM2_CMD=("pm2")
if ! command -v pm2 >/dev/null 2>&1; then
    PM2_CMD=("npx" "pm2")
fi

echo "======================================================"
echo "  EIXO Deploy — $(date)"
echo "======================================================"

# ── 1. Backup antes de qualquer coisa ─────────────────────────────────────────
echo ""
echo "▶ 1/6 Backup do banco..."
bash server/backup.sh

# ── 2. Atualiza o código ──────────────────────────────────────────────────────
echo ""
echo "▶ 2/6 Atualizando código (git pull)..."
git pull --ff-only origin main

# ── 3. Instala dependências ───────────────────────────────────────────────────
echo ""
echo "▶ 3/6 Instalando dependências..."
if [ -f package-lock.json ]; then
    npm ci --include=dev
else
    npm install --include=dev
fi

# ── 4. Aplica migrações do banco ──────────────────────────────────────────────
echo ""
echo "▶ 4/6 Aplicando migrações do banco..."
npx prisma migrate deploy --schema server/prisma/schema.prisma
npx prisma generate --schema server/prisma/schema.prisma

# ── 5. Build do frontend ──────────────────────────────────────────────────────
echo ""
echo "▶ 5/6 Build do frontend..."
pushd frontend >/dev/null
if [ -f package-lock.json ]; then
    npm ci --include=dev
else
    npm install --include=dev
fi
npm run build
popd >/dev/null

# ── 6. Reinicia o servidor via PM2 ────────────────────────────────────────────
echo ""
echo "▶ 6/6 Reiniciando servidor..."
if "${PM2_CMD[@]}" describe eixo-server >/dev/null 2>&1; then
    "${PM2_CMD[@]}" reload eixo-server --update-env
else
    "${PM2_CMD[@]}" start server/index.js --name eixo-server
fi
"${PM2_CMD[@]}" save --force

echo ""
echo "======================================================"
echo "  Deploy concluído com sucesso! ✓"
echo "  Status: pm2 status"
echo "  Logs:   pm2 logs eixo-server"
echo "======================================================"
