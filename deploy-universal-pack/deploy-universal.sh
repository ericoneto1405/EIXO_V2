#!/usr/bin/env bash
# deploy-universal.sh
# Uso:
#   ./deploy-universal.sh eixo "fix: mensagem do commit"
#   ./deploy-universal.sh gerped "fix: mensagem do commit"
#
# Objetivo:
#   Deploy sem perguntas no terminal.
#   Sem digitar "S".
#   Sem senha repetida, desde que SSH e Git estejam configurados com chave.

set -euo pipefail

PROJECT="${1:-}"
MSG="${2:-deploy}"

if [[ -z "$PROJECT" ]]; then
  echo "Uso: ./deploy-universal.sh <projeto> \"mensagem do commit\""
  echo "Exemplo: ./deploy-universal.sh eixo \"fix: ajuste no login\""
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/deploy.${PROJECT}.env"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Arquivo de configuração não encontrado: $CONFIG_FILE"
  echo "Crie um arquivo como: deploy.eixo.env ou deploy.gerped.env"
  exit 1
fi

# Carrega as variáveis do projeto
# shellcheck disable=SC1090
source "$CONFIG_FILE"

# Valores padrão
LOCAL_BRANCH="${LOCAL_BRANCH:-main}"
REMOTE_BRANCH="${REMOTE_BRANCH:-main}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
FRONTEND_DIR="${FRONTEND_DIR:-frontend}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-0}"
RUN_INSTALL="${RUN_INSTALL:-0}"
SSH_USER_HOST="${SSH_USER}@${SSH_HOST}"

SSH_OPTS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
)

need_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Variável obrigatória ausente no config: $name"
    exit 1
  fi
}

replace_in_file() {
  local file="$1"
  local from="$2"
  local to="$3"

  if [[ -z "$file" || -z "$from" || -z "$to" ]]; then
    return 0
  fi

  python3 - "$file" "$from" "$to" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
old = sys.argv[2]
new = sys.argv[3]

if not path.exists():
    raise SystemExit(f"Arquivo não encontrado: {path}")

text = path.read_text()
if old in text:
    path.write_text(text.replace(old, new))
PY
}

restore_local_config() {
  if [[ "${RESTORE_LOCAL_CONFIG:-0}" == "1" && -n "${VITE_CONFIG:-}" && -n "${PROD_API_TARGET:-}" && -n "${DEV_API_TARGET:-}" ]]; then
    echo ""
    echo "Restaurando configuração local..."
    replace_in_file "$VITE_CONFIG" "$PROD_API_TARGET" "$DEV_API_TARGET"
  fi
}

trap restore_local_config EXIT

need_var PROJECT_NAME
need_var SSH_USER
need_var SSH_HOST
need_var REMOTE_DIR
need_var PM2_PROCESS

echo "======================================================"
echo "Deploy — ${PROJECT_NAME}"
echo "Data: $(date)"
echo "======================================================"

echo ""
echo "1/8 Validando branch local..."
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "$LOCAL_BRANCH" ]]; then
  echo "Branch atual: $CURRENT_BRANCH"
  echo "Branch esperada: $LOCAL_BRANCH"
  echo "Deploy interrompido."
  exit 1
fi

echo ""
echo "2/8 Testando SSH sem senha..."
if ! ssh "${SSH_OPTS[@]}" "$SSH_USER_HOST" "echo ok" >/dev/null 2>&1; then
  echo "SSH sem senha não está funcionando para $SSH_USER_HOST"
  echo "Configure a chave SSH antes de usar deploy automático."
  echo "Exemplo:"
  echo "  ssh-copy-id $SSH_USER_HOST"
  exit 1
fi

echo ""
echo "3/8 Ajustando configuração local para produção, se configurado..."
if [[ -n "${VITE_CONFIG:-}" && -n "${DEV_API_TARGET:-}" && -n "${PROD_API_TARGET:-}" ]]; then
  replace_in_file "$VITE_CONFIG" "$DEV_API_TARGET" "$PROD_API_TARGET"
  RESTORE_LOCAL_CONFIG=1
else
  echo "Nenhum ajuste local configurado."
fi

echo ""
echo "4/8 Validação local, se configurada..."
if [[ -n "${LOCAL_VALIDATE_CMD:-}" ]]; then
  eval "$LOCAL_VALIDATE_CMD"
else
  echo "Nenhuma validação local configurada."
fi

echo ""
echo "5/8 Commit e push..."
git add -A

if git diff --cached --quiet; then
  echo "Nada novo para commitar."
else
  git commit -m "$MSG"
fi

git push "$GIT_REMOTE" "$LOCAL_BRANCH"

echo ""
echo "6/8 Atualizando servidor..."
REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd "$REMOTE_DIR"

git fetch "$GIT_REMOTE" "$REMOTE_BRANCH"
git pull --ff-only "$GIT_REMOTE" "$REMOTE_BRANCH"

if [[ "$RUN_INSTALL" == "1" ]]; then
  ${REMOTE_INSTALL_CMD:-npm install}
fi

if [[ "$RUN_MIGRATIONS" == "1" ]]; then
  ${REMOTE_MIGRATE_CMD:-echo "REMOTE_MIGRATE_CMD não configurado"; exit 1}
fi

${REMOTE_BUILD_CMD:-cd "$FRONTEND_DIR" && npm run build}
${REMOTE_RELOAD_CMD:-pm2 reload "$PM2_PROCESS" --update-env}
EOF
)

ssh "${SSH_OPTS[@]}" "$SSH_USER_HOST" "$REMOTE_SCRIPT"

echo ""
echo "7/8 Health check, se configurado..."
if [[ -n "${HEALTHCHECK_URL:-}" ]]; then
  HTTP_CODE="$(curl -L -s -o /dev/null -w "%{http_code}" "$HEALTHCHECK_URL" || true)"
  if [[ "$HTTP_CODE" =~ ^2|3 ]]; then
    echo "Health check OK: $HEALTHCHECK_URL ($HTTP_CODE)"
  else
    echo "Health check falhou: $HEALTHCHECK_URL ($HTTP_CODE)"
    exit 1
  fi
else
  echo "Nenhum health check configurado."
fi

echo ""
echo "8/8 Concluído."
echo "======================================================"
echo "Deploy concluído: ${PROJECT_NAME}"
if [[ -n "${PRODUCTION_URL:-}" ]]; then
  echo "Produção: ${PRODUCTION_URL}"
fi
echo "======================================================"
