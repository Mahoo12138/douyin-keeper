#!/bin/sh
set -eu

container="douyin-keeper-dev-postgres-1"

result="$({
  docker exec "$container" sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -F "|" -Atc "select a.id,a.nickname,count(distinct c.id),count(distinct c.id) filter (where c.peer_display_name=a.nickname),count(distinct f.id) filter (where f.streak_days>0),count(distinct c.id) filter (where c.friend_id=f.id and f.streak_days>0),max(c.last_synced_at) from douyin_accounts a left join conversations c on c.account_id=a.id and c.archived_at is null left join friends f on f.account_id=a.id and f.deleted_at is null where a.deleted_at is null group by a.id,a.nickname having count(distinct c.id)>0 order by max(c.last_synced_at) desc nulls last limit 1"'
} 2>&1)" || {
  printf '%s\n' "$result" >&2
  exit 2
}

IFS='|' read -r account_id account_nickname conversation_count self_named_count known_nonzero_streak_count linked_nonzero_streak_count last_synced_at <<EOF
$result
EOF

printf 'account_id=%s nickname=%s conversations=%s self_named=%s known_nonzero_streaks=%s linked_nonzero_streaks=%s last_synced_at=%s\n' \
  "$account_id" "$account_nickname" "$conversation_count" "$self_named_count" \
  "$known_nonzero_streak_count" "$linked_nonzero_streak_count" "$last_synced_at"

if [ "$self_named_count" -gt 3 ] || { [ "$known_nonzero_streak_count" -gt 0 ] && [ "$linked_nonzero_streak_count" -eq 0 ]; }; then
  printf 'VERDICT=RED\n'
  exit 1
fi

printf 'VERDICT=GREEN\n'
