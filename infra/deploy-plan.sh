#!/usr/bin/env bash
# Biblioteca: comparação entre commits, sem efeitos no ambiente.
plan_changes() {
  local base="$1" target="$2" file changes
  deps=0 frontend=0 backend=0 schema=0 migrations=0 full=0
  if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
    full=1; migrations=1
  else
    changes=$(git diff --name-only --no-renames "$base" "$target") || return
    while IFS= read -r file; do
      case "$file" in
        '') ;;
        AGENTS.md|CLAUDE.md|README.md|docs/*.md|infra/*.md|.github/*.md|server/docs/*.md) ;;
        package.json|package-lock.json|frontend/package.json|server/package.json|.npmrc|vendor/*) deps=1 ;;
        server/prisma/migrations/*) migrations=1; schema=1; backend=1 ;;
        server/prisma/schema.prisma|server/prisma.config.ts) schema=1; backend=1 ;;
        frontend/*) frontend=1 ;;
        server/*) backend=1 ;;
        *) full=1 ;;
      esac
    done <<< "$changes"
  fi
  if [ "$full" = 1 ]; then deps=1; frontend=1; backend=1; schema=1; fi
  if [ "$deps" = 1 ]; then frontend=1; backend=1; schema=1; fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  plan_changes "${1:-}" "${2:-HEAD}"
  printf 'dependencias=%s frontend=%s backend=%s prisma=%s migrations=%s conservador=%s\n' \
    "$deps" "$frontend" "$backend" "$schema" "$migrations" "$full"
fi
