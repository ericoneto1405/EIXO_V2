#!/usr/bin/env bash
# Validação do checkout atual. Não instala dependências nem modifica banco.
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/deploy-plan.sh
base="${1:-}"
plan_changes "$base" HEAD
git diff --check
git diff --cached --check
if [ -n "$base" ] && git cat-file -e "$base^{commit}" 2>/dev/null; then
  git diff --check "$base" HEAD
fi
# Incluir alterações locais na seleção, sem incluir arquivos alheios em commits.
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo 'Checkout com alterações locais: validação conservadora.'
  deps=1; frontend=1; backend=1; schema=1
fi
stage=preparacao
log=$(mktemp)
trap 'rm -f "$log"' EXIT
run() {
  stage="$1"; shift
  echo "▶ $stage"
  if "$@" >"$log" 2>&1; then
    echo "OK: $stage"
  else
    local rc=$?
    tail -n 40 "$log"
    echo "ERRO: $stage (código $rc)" >&2
    exit "$rc"
  fi
}
if [ "$deps" = 1 ]; then run auditoria npm audit --audit-level=moderate; fi
if [ "$schema" = 1 ] || [ "$backend" = 1 ]; then
  run prisma-generate npm run generate
  run prisma-validate npx --no-install prisma validate --schema server/prisma/schema.prisma
fi
if [ "$backend" = 1 ]; then run testes-backend npm test --workspace server; fi
if [ "$frontend" = 1 ] || [ "$backend" = 1 ]; then
  export SUPPORT_BASE_SHA="$base"
  run conhecimento npm run support:validate --workspace server
fi
if [ "$frontend" = 1 ]; then
  run typescript npx --no-install tsc -p frontend/tsconfig.json --noEmit
  run build npm run build
fi
echo 'Validação concluída.'
