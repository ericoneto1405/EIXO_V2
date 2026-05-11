#!/bin/bash
# ─── EIXO — Deploy do Mac para Produção ───────────────────────────────────────
# Uso: ./deploy-local.sh "mensagem do commit"

set -euo pipefail

VPS="root@51.255.199.78"
VPS_DIR="/var/www/eixo"
VITE_CONFIG="frontend/vite.config.ts"
MSG="${1:-deploy}"

echo "======================================================"
echo "  EIXO Deploy — $(date)"
echo "======================================================"

# 1. Reverte vite.config.ts para produção
echo ""
echo "▶ 1/4 Revertendo vite.config.ts para produção..."
sed -i '' "s|http://localhost:5173/api|http://localhost:3001|g" "$VITE_CONFIG"
sed -i '' "s|https://eixo.agr.br|http://localhost:3001|g" "$VITE_CONFIG"

# 2. Commit e push
echo ""
echo "▶ 2/4 Commit e push..."
git add -A
git commit -m "$MSG" || echo "Nada novo para commitar."
git push origin main

# 3. Build e reload na VPS
echo ""
echo "▶ 3/4 Build na VPS..."
ssh "$VPS" "cd $VPS_DIR && git pull origin main && cd frontend && npm run build && cd .. && pm2 reload eixo-server --update-env"

# 4. Volta vite.config.ts para desenvolvimento
echo ""
echo "▶ 4/4 Restaurando vite.config.ts para desenvolvimento..."
sed -i '' "s|http://localhost:3001|https://eixo.agr.br|g" "$VITE_CONFIG"

echo ""
echo "======================================================"
echo "  Deploy concluído! ✓"
echo "  Produção: https://eixo.agr.br"
echo "======================================================"
