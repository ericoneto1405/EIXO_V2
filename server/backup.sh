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
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

# Usa o parser de URL do Node para preservar senhas com caracteres especiais.
if [ -n "${DATABASE_URL:-}" ]; then
    DB_PARTS=()
    while IFS= read -r -d '' part; do
        DB_PARTS+=("$part")
    done < <(node -e '
        const url = new URL(process.env.DATABASE_URL);
        const values = [
            decodeURIComponent(url.username),
            decodeURIComponent(url.password),
            url.hostname,
            url.port || "5432",
            decodeURIComponent(url.pathname.replace(/^\/+/, "")),
        ];
        if (!values[0] || !values[2] || !values[4]) process.exit(1);
        process.stdout.write(values.join("\0") + "\0");
    ')

    if [ "${#DB_PARTS[@]}" -ne 5 ]; then
        echo "Erro: DATABASE_URL inválida para o backup."
        exit 1
    fi

    DB_USER="${DB_PARTS[0]}"
    DB_PASS="${DB_PARTS[1]}"
    DB_HOST="${DB_PARTS[2]}"
    DB_PORT="${DB_PARTS[3]}"
    DB_NAME="${DB_PARTS[4]}"
    export PGPASSWORD="$DB_PASS"
fi

# ── Cria pasta de backups se não existir ──────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Iniciando backup: $FILENAME"

# ── Gera o dump e comprime ────────────────────────────────────────────────────
TEMP_FILE="$BACKUP_DIR/.${FILENAME}.tmp"
cleanup_temp() {
    rm -f "$TEMP_FILE"
}
trap cleanup_temp EXIT

pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    --format=plain \
    --no-owner \
    --no-acl \
    | gzip > "$TEMP_FILE"

if [ ! -s "$TEMP_FILE" ]; then
    echo "Erro: backup vazio."
    exit 1
fi

mv "$TEMP_FILE" "$BACKUP_DIR/$FILENAME"
trap - EXIT

SIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
echo "[$(date)] Backup concluído: $FILENAME ($SIZE)"

# ── Remove backups com mais de RETENTION_DAYS dias ───────────────────────────
echo "[$(date)] Removendo backups com mais de ${RETENTION_DAYS} dias..."
find "$BACKUP_DIR" -name "eixo_backup_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(find "$BACKUP_DIR" -name "eixo_backup_*.sql.gz" | wc -l | tr -d ' ')
echo "[$(date)] Backups mantidos: $REMAINING"

echo "[$(date)] Backup finalizado com sucesso."
