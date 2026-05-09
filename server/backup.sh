#!/bin/bash
# ─── EIXO — Backup automático do PostgreSQL ───────────────────────────────────
# Uso: ./backup.sh
# Cron diário às 3h: 0 3 * * * /caminho/para/EIXO\ V2/server/backup.sh >> /var/log/eixo-backup.log 2>&1

set -euo pipefail

# ── Configurações ─────────────────────────────────────────────────────────────
BACKUP_DIR="$(dirname "$0")/backups"
DB_NAME="${PGDATABASE:-eixo_prod}"
DB_USER="${PGUSER:-postgres}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
RETENTION_DAYS=7
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="eixo_backup_${DATE}.sql.gz"

# ── Carrega variáveis de ambiente se existir .env.production ──────────────────
ENV_FILE="$(dirname "$0")/.env.production"
if [ -f "$ENV_FILE" ]; then
    # Extrai host, porta, nome e usuário da DATABASE_URL
    DB_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d '"' -f2)
    if [ -n "$DB_URL" ]; then
        DB_USER=$(echo "$DB_URL" | sed 's|postgresql://||' | cut -d: -f1)
        DB_PASS=$(echo "$DB_URL" | sed 's|postgresql://[^:]*:||' | cut -d@ -f1)
        DB_HOST=$(echo "$DB_URL" | cut -d@ -f2 | cut -d: -f1)
        DB_PORT=$(echo "$DB_URL" | cut -d@ -f2 | cut -d: -f2 | cut -d/ -f1)
        DB_NAME=$(echo "$DB_URL" | cut -d/ -f4 | cut -d? -f1)
        export PGPASSWORD="$DB_PASS"
    fi
fi

# ── Cria pasta de backups se não existir ──────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Iniciando backup: $FILENAME"

# ── Gera o dump e comprime ────────────────────────────────────────────────────
pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    --format=plain \
    --no-owner \
    --no-acl \
    | gzip > "$BACKUP_DIR/$FILENAME"

SIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
echo "[$(date)] Backup concluído: $FILENAME ($SIZE)"

# ── Remove backups com mais de RETENTION_DAYS dias ───────────────────────────
echo "[$(date)] Removendo backups com mais de ${RETENTION_DAYS} dias..."
find "$BACKUP_DIR" -name "eixo_backup_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(find "$BACKUP_DIR" -name "eixo_backup_*.sql.gz" | wc -l | tr -d ' ')
echo "[$(date)] Backups mantidos: $REMAINING"

echo "[$(date)] Backup finalizado com sucesso."
