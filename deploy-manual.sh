#!/usr/bin/env bash
# Contingência autorizada na VPS; mesmo executor do GitHub Actions.
set -euo pipefail
cd "$(dirname "$0")"
[ "$PWD" = /var/www/eixo ] || { echo 'Execute somente na VPS'; exit 1; }
target="${1:?Informe o SHA completo validado e aprovado}"
[[ "$target" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA inválido'; exit 1; }
git fetch --quiet origin main
executor=$(mktemp)
trap 'rm -f "$executor"' EXIT
git show "$target:infra/deploy.sh" > "$executor"
bash "$executor" "$target"
