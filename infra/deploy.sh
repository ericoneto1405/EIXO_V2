#!/usr/bin/env bash
# Executor exclusivo da VPS. A origem deve ter sido atualizada pelo transporte.
set -Eeuo pipefail
umask 077
target="${1:?Informe o SHA completo aprovado}"
[[ "$target" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA inválido'; exit 1; }
[ "$PWD" = /var/www/eixo ] || { echo 'Execute somente em /var/www/eixo na VPS'; exit 1; }
state="$(git rev-parse --absolute-git-dir)/eixo-deploy"
mkdir -p "$state"
exec 9>"$state/lock"
flock -n 9 || { echo 'Outro deploy está em execução'; exit 1; }
[ ! -f "$state/in-progress" ] || { echo 'Deploy anterior incompleto. Investigue antes de liberar nova execução.'; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo 'Checkout da VPS alterado; preservar e revisar antes de publicar.'; exit 1; }
git merge-base --is-ancestor "$target" origin/main || { echo 'SHA não pertence a origin/main'; exit 1; }
[ -f server/.env.production ] || { echo 'Ambiente de produção ausente'; exit 1; }
if git ls-files --error-unmatch server/.env.production >/dev/null 2>&1 || \
   git cat-file -e "$target:server/.env.production" 2>/dev/null; then
  echo 'Arquivo de ambiente versionado; publicação bloqueada'; exit 1
fi
for cmd in npm node pm2 curl; do command -v "$cmd" >/dev/null; done
set -a
source server/.env.production
set +a
: "${DATABASE_URL:?DATABASE_URL ausente}"
previous=$(git rev-parse HEAD)
base=''
release=''
if [ -f "$state/success" ]; then
  read -r base release < "$state/success"
  [[ "$base" =~ ^[0-9a-f]{40}$ ]] && [[ "$release" =~ ^[0-9a-f]{40}$ ]] || {
    echo 'Estado de publicação inválido; revisar antes de continuar'; exit 1;
  }
fi
if [ -n "$base" ] && [ "$base" != "$previous" ]; then
  echo 'HEAD diverge da última publicação confirmada; revisar recuperação.'; exit 1
fi
if [ -n "$base" ]; then
  git merge-base --is-ancestor "$base" "$target" || { echo 'Publicação antiga/divergente bloqueada; use reversão por PR.'; exit 1; }
fi
stage=preparacao
log="$state/last.log"
fail() { echo "ERRO na etapa $stage. Publicação não confirmada; não reexecutar automaticamente. Log privado: $log" >&2; }
trap fail ERR
run() {
  stage="$1"; shift
  log="$state/$target-$stage.log"
  echo "▶ $stage"
  # Não imprimir logs de produção: podem conter credenciais ou dados pessoais.
  "$@" >"$log" 2>&1
  echo "OK: $stage"
}
printf '%s %s\n' "$previous" "$target" > "$state/in-progress"
printf '%s\n' "$previous" > "$state/previous"
if [ "$previous" != "$target" ]; then run atualizar-codigo git checkout --detach "$target"; fi
source infra/deploy-plan.sh
plan_changes "$base" "$target"
if [ ! -d node_modules ]; then deps=1; schema=1; frontend=1; backend=1; fi
if [ ! -f frontend/dist/index.html ]; then frontend=1; fi
# Mudança de ambiente também invalida artefatos e processo, sem expor valores.
environment=$(git hash-object server/.env.production)
if [ ! -f "$state/environment" ] || [ "$(cat "$state/environment")" != "$environment" ]; then
  frontend=1; backend=1
fi
runtime=0
if [ "$frontend" = 1 ] || [ "$backend" = 1 ] || [ "$deps" = 1 ]; then runtime=1; fi
if [ "$runtime" = 1 ]; then
  # Histórico já aplicado é imutável. Somente diretórios novos são aceitáveis.
  if [ -n "$base" ] && [ "$migrations" = 1 ]; then
    changed_old=$(git diff --name-only --diff-filter=MD --no-renames "$base" "$target" -- server/prisma/migrations)
    [ -z "$changed_old" ] || { echo 'Migração existente alterada/removida; revisão humana obrigatória'; exit 1; }
  fi
  run backup bash server/backup.sh
  if [ "$deps" = 1 ]; then run dependencias npm ci --include=dev --no-audit --no-fund; fi
  if [ "$schema" = 1 ] || [ "$deps" = 1 ]; then
    run prisma-generate npm run generate
    run prisma-validate npx --no-install prisma validate --schema server/prisma/schema.prisma
  fi
  if [ "$migrations" = 1 ]; then
    run migrations npx --no-install prisma migrate deploy --schema server/prisma/schema.prisma
  fi
  if [ "$frontend" = 1 ]; then
    [ ! -L frontend/dist ] || { echo 'Build aponta para link simbólico; revisar antes de publicar'; exit 1; }
    run build npm run build
    # O umask privado protege logs/backup, mas o Nginx precisa ler o site.
    # Normalizar também arquivos copiados pelo Vite; não seguir links simbólicos.
    run diretorios-publicos find frontend/dist -type d -exec chmod 755 '{}' +
    run arquivos-publicos find frontend/dist -type f -exec chmod 644 '{}' +
  fi
  export APP_RELEASE_SHA="$target"
  # Frontend também muda a versão do produto/base de conhecimento exposta pela API.
  # Um reload mescla variáveis e pode preservar chaves removidas do ambiente.
  # Manter a recriação do processo já usada em produção para evitar isso.
  if pm2 describe eixo-server >/dev/null 2>&1; then run parar pm2 delete eixo-server; fi
  run reiniciar pm2 start ecosystem.config.js
  run persistir-pm2 pm2 save --force
  release="$target"
fi
export APP_RELEASE_SHA="$release"
run health-api curl -fsS --retry 5 --retry-connrefused --retry-delay 2 --max-time 10 "http://127.0.0.1:${PORT:-3000}/health"
if [ -n "$release" ]; then
  export SUPPORT_STATUS_URL="http://127.0.0.1:${PORT:-3000}/api/chat/knowledge-status"
  run versao npm run support:verify-release --workspace server
fi
run health-publica curl -fsS --max-time 15 https://eixo.agr.br/api/health
run site curl -fsSL --max-time 15 https://eixo.agr.br
printf '%s %s\n' "$target" "$release" > "$state/success.next"
printf '%s\n' "$environment" > "$state/environment"
mv "$state/success.next" "$state/success"
rm "$state/in-progress"
echo "Publicação confirmada: checkout=$target aplicação=$release"
