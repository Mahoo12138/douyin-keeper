#!/usr/bin/env bash
# 恢复演练：解密备份导入空库，核对余额合计、有效套餐数、号位数、归档条数。
# 用法：BACKUP_FILE=/www/backup/huohua/huohua-xxx.tar.enc ./restore-check.sh
set -euo pipefail
ROOT="${HUOHUA_ROOT:-/www/wwwroot/huohua/spark}"
ENV_FILE="${HUOHUA_ENV_FILE:-$ROOT/backend/.env}"
KEY_FILE="${BACKUP_KEY_FILE:-/www/backup/huohua-keys/backup.key}"
BACKUP_FILE="${BACKUP_FILE:-}"
RESTORE_DB="${RESTORE_DB:-huohua_restore}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "设置 BACKUP_FILE 指向 huohua-*.tar.enc" >&2
  exit 1
fi
if [[ ! -f "$KEY_FILE" ]]; then
  echo "缺少备份密钥 $KEY_FILE" >&2
  exit 1
fi
umask 077
DSN="$(grep -E '^HUOHUA_MYSQL_DSN=' "$ENV_FILE" | tail -n1 | cut -d= -f2-)"
DSN="${DSN%\"}"
DSN="${DSN#\"}"
USERPASS="${DSN%%@*}"
DBHOST="${DSN#*@tcp(}"
DBHOST="${DBHOST%%)*}"
MYSQL_USER="${USERPASS%%:*}"
MYSQL_PWD="${USERPASS#*:}"
export MYSQL_PWD
HOST="${DBHOST%%:*}"
PORT="${DBHOST##*:}"
SRC_DB="${DSN#*/}"
SRC_DB="${SRC_DB%%\?*}"
openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -out "$WORKDIR/bundle.tar" -pass "file:$KEY_FILE"
tar -C "$WORKDIR" -xf "$WORKDIR/bundle.tar"
if [[ ! -f "$WORKDIR/huohua.sql" || ! -f "$WORKDIR/counts.txt" ]]; then
  echo "备份包缺 sql 或 counts.txt" >&2
  exit 1
fi
mysql -h"$HOST" -P"$PORT" -u"$MYSQL_USER" -e "DROP DATABASE IF EXISTS \`${RESTORE_DB}\`; CREATE DATABASE \`${RESTORE_DB}\` DEFAULT CHARSET utf8mb4;"
sed "s/\`${SRC_DB}\`/\`${RESTORE_DB}\`/g" "$WORKDIR/huohua.sql" | mysql -h"$HOST" -P"$PORT" -u"$MYSQL_USER"
GOT="$WORKDIR/got.txt"
mysql -h"$HOST" -P"$PORT" -u"$MYSQL_USER" -N -e "
SELECT 'users', COUNT(*), COALESCE(SUM(balance_cents),0) FROM \`${RESTORE_DB}\`.users;
SELECT 'subscriptions', COUNT(*) FROM \`${RESTORE_DB}\`.subscriptions WHERE status='active';
SELECT 'accounts', COUNT(*) FROM \`${RESTORE_DB}\`.douyin_accounts WHERE slot_status='active';
SELECT 'chat_messages', COUNT(*) FROM \`${RESTORE_DB}\`.chat_messages;
" > "$GOT"
if ! cmp -s "$WORKDIR/counts.txt" "$GOT"; then
  echo "恢复计数不一致" >&2
  echo "期望:" >&2
  cat "$WORKDIR/counts.txt" >&2
  echo "实际:" >&2
  cat "$GOT" >&2
  exit 1
fi
echo "ok 余额/套餐/号位/归档条数一致"
