#!/bin/sh
set -eu

container="${KEEPER_POSTGRES_CONTAINER:-douyin-keeper-dev-postgres-1}"
expected_owner="${EXPECTED_STREAK_OWNER:-}"
expected_days="${EXPECTED_STREAK_DAYS:-}"
wrong_owner="${WRONG_STREAK_OWNER:-}"

if [ -z "$expected_owner" ] || [ -z "$expected_days" ] || [ -z "$wrong_owner" ]; then
  printf 'EXPECTED_STREAK_OWNER, EXPECTED_STREAK_DAYS and WRONG_STREAK_OWNER are required\n' >&2
  exit 64
fi

duplicate_count="$(docker exec "$container" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "
  SELECT count(*)
  FROM (
    SELECT account_id, peer_platform_user_id
    FROM conversations
    WHERE archived_at IS NULL
      AND conversation_type = '\''direct'\''
      AND COALESCE(peer_platform_user_id, '\'''\'') <> '\'''\''
    GROUP BY account_id, peer_platform_user_id
    HAVING count(*) > 1
  ) duplicates;
"')"

streak_query="
  SELECT COALESCE(max(f.streak_days), 0)
  FROM conversations c
  LEFT JOIN friends f ON f.id = c.friend_id AND f.deleted_at IS NULL
  WHERE c.archived_at IS NULL AND c.peer_display_name = :'owner';
"

expected_actual="$(printf '%s\n' "$streak_query" | docker exec -i \
  -e EXPECTED_OWNER="$expected_owner" \
  "$container" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v owner="$EXPECTED_OWNER" -At')"

wrong_actual="$(printf '%s\n' "$streak_query" | docker exec -i \
  -e WRONG_OWNER="$wrong_owner" \
  "$container" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v owner="$WRONG_OWNER" -At')"

printf 'duplicate_direct_identities=%s expected_owner=%s expected_days=%s actual_days=%s wrong_owner=%s actual_days=%s\n' \
  "$duplicate_count" "$expected_owner" "$expected_days" "$expected_actual" "$wrong_owner" "$wrong_actual"

if [ "$duplicate_count" -gt 0 ] \
  || [ "$expected_actual" -ne "$expected_days" ] \
  || [ "$wrong_actual" -ne 0 ]; then
  printf 'VERDICT=RED\n'
  exit 1
fi

printf 'VERDICT=GREEN\n'
