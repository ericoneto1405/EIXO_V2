#!/bin/bash
# ─── EIXO — Deploy manual de contingência ────────────────────────────────────
# Uso na VPS: ./deploy-manual.sh
# Pré-requisito: PM2 instalado (npm install -g pm2)
#                .env.production configurado em server/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
ENV_FILE="server/.env.production"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

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

# ── Pré-checagens de segurança ────────────────────────────────────────────────
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [ -z "$CURRENT_BRANCH" ]; then
    echo "Erro: não foi possível identificar a branch atual."
    exit 1
fi

if [ "$CURRENT_BRANCH" != "$DEPLOY_BRANCH" ]; then
    echo "Erro: branch atual é '$CURRENT_BRANCH', esperado '$DEPLOY_BRANCH'."
    echo "Defina DEPLOY_BRANCH se quiser usar outra branch."
    exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
    echo "Erro: árvore git não está limpa. Faça commit/stash antes do deploy."
    git status --short
    exit 1
fi

PM2_CMD=("pm2")
if ! command -v pm2 >/dev/null 2>&1; then
    PM2_CMD=("npx" "pm2")
fi

echo "======================================================"
echo "  EIXO Deploy Manual — $(date)"
echo "======================================================"

# ── 1. Backup antes de qualquer coisa ─────────────────────────────────────────
echo ""
echo "▶ 1/6 Backup do banco..."
bash server/backup.sh

# ── 2. Atualiza o código ──────────────────────────────────────────────────────
echo ""
echo "▶ 2/6 Atualizando código (git pull)..."
git pull --ff-only origin "$DEPLOY_BRANCH"

# ── 3. Instala dependências de forma reproduzível ─────────────────────────────
echo ""
echo "▶ 3/6 Instalando dependências..."
if [ ! -f package-lock.json ]; then
    echo "Erro: package-lock.json não encontrado."
    exit 1
fi
npm ci --include=dev

# ── 4. Aplica migrações do banco ──────────────────────────────────────────────
echo ""
echo "▶ 4/6 Aplicando migrações do banco..."
npx prisma migrate deploy --schema server/prisma/schema.prisma
npx prisma generate --schema server/prisma/schema.prisma

# ── 5. Build do frontend ──────────────────────────────────────────────────────
echo ""
echo "▶ 5/6 Build do frontend..."
npm run build

# ── 6. Reinicia o servidor via PM2 ────────────────────────────────────────────
echo ""
echo "▶ 6/6 Reiniciando servidor..."
if [ ! -f ecosystem.config.js ]; then
    echo "Erro: ecosystem.config.js não encontrado."
    exit 1
fi

if "${PM2_CMD[@]}" describe eixo-server >/dev/null 2>&1; then
    "${PM2_CMD[@]}" reload ecosystem.config.js --update-env
else
    "${PM2_CMD[@]}" start ecosystem.config.js
fi
"${PM2_CMD[@]}" save --force

# ── Pós-checagem rápida de saúde ──────────────────────────────────────────────
echo ""
echo "▶ Health check rápido..."
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:${PORT:-3000}/health}"
if ! curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null; then
    echo "Erro: health check falhou em $HEALTH_URL"
    echo "Verifique logs: pm2 logs eixo-server --lines 100"
    exit 1
fi
echo "Health OK: $HEALTH_URL"

PUBLIC_URL="${DEPLOY_PUBLIC_URL:-https://eixo.agr.br}"
if ! curl -fsSL --max-time 15 "$PUBLIC_URL" >/dev/null; then
    echo "Erro: site indisponível em $PUBLIC_URL"
    exit 1
fi
echo "Site no ar: $PUBLIC_URL"

echo ""
echo "======================================================"
echo "  Deploy concluído com sucesso! ✓"
echo "  Status: pm2 status"
echo "  Logs:   pm2 logs eixo-server"
echo "======================================================"
