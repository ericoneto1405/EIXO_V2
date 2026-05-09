#!/bin/bash
# ─── EIXO — Deploy sem downtime ───────────────────────────────────────────────
# Uso: ./deploy.sh
# Pré-requisito: PM2 instalado (npm install -g pm2)
#                .env.production configurado em server/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

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
git pull origin main

# ── 3. Instala dependências ───────────────────────────────────────────────────
echo ""
echo "▶ 3/6 Instalando dependências..."
npm install --production=false

# ── 4. Aplica migrações do banco ──────────────────────────────────────────────
echo ""
echo "▶ 4/6 Aplicando migrações do banco..."
export $(grep -v '^#' server/.env.production | xargs)
npx prisma migrate deploy --schema server/prisma/schema.prisma
npx prisma generate --schema server/prisma/schema.prisma

# ── 5. Build do frontend ──────────────────────────────────────────────────────
echo ""
echo "▶ 5/6 Build do frontend..."
cd frontend && npm install && npm run build && cd ..

# ── 6. Reinicia o servidor via PM2 ────────────────────────────────────────────
echo ""
echo "▶ 6/6 Reiniciando servidor..."
if pm2 list | grep -q "eixo-server"; then
    pm2 reload eixo-server --update-env
else
    pm2 start server/index.js --name eixo-server --env production
    pm2 save
fi

echo ""
echo "======================================================"
echo "  Deploy concluído com sucesso! ✓"
echo "  Status: pm2 status"
echo "  Logs:   pm2 logs eixo-server"
echo "======================================================"
