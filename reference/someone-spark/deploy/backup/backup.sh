#!/usr/bin/env bash
# 宝塔计划任务：每日备份 MySQL（含 chat_messages / session_blob）+ 对象存储。
# 不打包 .env 或应用密钥文件。加密密钥与 HUOHUA_SESSION_KEY 分存。
set -euo pipefail
ROOT="${HUOHUA_ROOT:-/www/wwwroot/huohua/spark}"
ENV_FILE="${HUOHUA_ENV_FILE:-$ROOT/backend/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/www/backup/huohua}"
MEDIA_DIR="${HUOHUA_MEDIA_DIR:-$ROOT/backend/var/media}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
KEY_FILE="${BACKUP_KEY_FILE:-/www/backup/huohua-keys/backup.key}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE" >&2
  exit 1
fi
if [[ ! -f "$KEY_FILE" ]]; then
  echo "缺少备份密钥 $KEY_FILE（与 HUOHUA_SESSION_KEY 分存）" >&2
  exit 1
fi
umask 077
mkdir -p "$BACKUP_ROOT"
DSN="$(grep -E '^HUOHUA_MYSQL_DSN=' "$ENV_FILE" | tail -n1 | cut -d= -f2-)"
DSN="${DSN%\"}"
DSN="${DSN#\"}"
if [[ -z "$DSN" ]]; then
  echo "HUOHUA_MYSQL_DSN 为空" >&2
  exit 1
fi
USERPASS="${DSN%%@*}"
DBHOST="${DSN#*@tcp(}"
DBHOST="${DBHOST%%)*}"
DBNAME="${DSN#*/}"
DBNAME="${DBNAME%%\?*}"
MYSQL_USER="${USERPASS%%:*}"
MYSQL_PWD="${USERPASS#*:}"
export MYSQL_PWD
HOST="${DBHOST%%:*}"
PORT="${DBHOST##*:}"
DUMP="$WORKDIR/huohua.sql"
mysqldump --single-transaction --routines --triggers --hex-blob \
  -h"$HOST" -P"$PORT" -u"$MYSQL_USER" --databases "$DBNAME" > "$DUMP"
if ! grep -q "CREATE TABLE \`chat_messages\`" "$DUMP"; then
  echo "dump 缺少 chat_messages" >&2
  exit 1
fi
if ! grep -q "session_blob" "$DUMP"; then
  echo "dump 缺少 session_blob 列" >&2
  exit 1
fi
COUNTS="$WORKDIR/counts.txt"
mysql -h"$HOST" -P"$PORT" -u"$MYSQL_USER" -N -e "
SELECT 'users', COUNT(*), COALESCE(SUM(balance_cents),0) FROM \`${DBNAME}\`.users;
SELECT 'subscriptions', COUNT(*) FROM \`${DBNAME}\`.subscriptions WHERE status='active';
SELECT 'accounts', COUNT(*) FROM \`${DBNAME}\`.douyin_accounts WHERE slot_status='active';
SELECT 'chat_messages', COUNT(*) FROM \`${DBNAME}\`.chat_messages;
" > "$COUNTS"
MEDIA_TAR="$WORKDIR/media.tar"
if [[ -d "$MEDIA_DIR" ]]; then
  tar -C "$(dirname "$MEDIA_DIR")" -cf "$MEDIA_TAR" "$(basename "$MEDIA_DIR")"
else
  tar -cf "$MEDIA_TAR" -T /dev/null
fi
BUNDLE="$WORKDIR/bundle.tar"
tar -C "$WORKDIR" -cf "$BUNDLE" huohua.sql counts.txt media.tar
OUT="$BACKUP_ROOT/huohua-$STAMP.tar.enc"
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$BUNDLE" -out "$OUT" -pass "file:$KEY_FILE"
chmod 600 "$OUT"
find "$BACKUP_ROOT" -name 'huohua-*.tar.enc' -mtime +"$KEEP_DAYS" -delete
echo "ok $OUT"
