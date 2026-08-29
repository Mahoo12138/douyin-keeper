#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.runtime/test-env"
PID_DIR="${RUNTIME_DIR}/pids"
LOG_DIR="${RUNTIME_DIR}/logs"
SIDECAR_LOG_DIR="${ROOT_DIR}/logs"
BIN_DIR="${RUNTIME_DIR}/bin"
PROFILE_DIR="${RUNTIME_DIR}/browser-profiles"
KEY_FINGERPRINT_FILE="${RUNTIME_DIR}/session-key.sha256"
ENV_FILE="${TEST_ENV_FILE:-${ROOT_DIR}/.env.test}"
CUSTOM_ENV_FILE="${TEST_ENV_FILE:-}"

mkdir -p "${PID_DIR}" "${LOG_DIR}" "${BIN_DIR}" "${PROFILE_DIR}" "${SIDECAR_LOG_DIR}"
chmod 700 "${RUNTIME_DIR}" "${PID_DIR}" "${LOG_DIR}" "${BIN_DIR}" "${PROFILE_DIR}" "${SIDECAR_LOG_DIR}"

log() {
  printf '[test-env] %s\n' "$*"
}

die() {
  printf '[test-env] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

wait_for_api() {
  log "waiting for API"
  local api_port="${HTTP_ADDR##*:}"
  local api_pid
  api_pid="$(pid_for api)"
  [[ "${api_port}" =~ ^[0-9]+$ ]] || api_port=18080
  for _ in $(seq 1 60); do
    is_running "${api_pid}" || {
      tail -n 80 "${LOG_DIR}/api.log" 2>/dev/null || true
      die "API process exited before becoming ready"
    }
    if curl -fsS "http://127.0.0.1:${api_port}/health/ready" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  tail -n 80 "${LOG_DIR}/api.log" 2>/dev/null || true
  die "API did not become ready"
}

load_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    if [[ -f "${ROOT_DIR}/.env.test.example" ]]; then
      ENV_FILE="${ROOT_DIR}/.env.test.example"
    elif [[ -f "${ROOT_DIR}/.env" ]]; then
      ENV_FILE="${ROOT_DIR}/.env"
    fi
  fi
  [[ -f "${ENV_FILE}" ]] || die "no test environment file found; copy .env.test.example to .env.test"
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a

  export DATABASE_URL="${DATABASE_URL:-postgres://keeper:change-me@localhost:5432/douyin_keeper?sslmode=disable}"
  export REDIS_ADDR="${REDIS_ADDR:-localhost:6379}"
  export HTTP_ADDR="${HTTP_ADDR:-:18080}"
  export PLAYWRIGHT_HEADLESS="${PLAYWRIGHT_HEADLESS:-0}"
  export PLAYWRIGHT_SIDECAR_COMMAND="${PLAYWRIGHT_SIDECAR_COMMAND:-node}"
  export PLAYWRIGHT_SIDECAR_SCRIPT="${PLAYWRIGHT_SIDECAR_SCRIPT:-sidecars/playwright-node/sidecar.mjs}"
  export PLAYWRIGHT_SIDECAR_DEBUG="${PLAYWRIGHT_SIDECAR_DEBUG:-1}"
  export PLAYWRIGHT_SIDECAR_LOG_FILE="${PLAYWRIGHT_SIDECAR_LOG_FILE:-${SIDECAR_LOG_DIR}/worker-browser-node.log}"

  # /tmp is routinely cleaned and defeats the per-account persistent Profile
  # contract. Preserve existing custom locations, but migrate the old bundled
  # test default into this private project runtime directory.
  if [[ -z "${LOGIN_PROFILE_DIR:-}" || "${LOGIN_PROFILE_DIR}" == "/tmp/douyin-keeper/test-login" ]]; then
    export LOGIN_PROFILE_DIR="${PROFILE_DIR}"
  fi

  # The bundled test template uses deterministic, local-only keys. Keep the
  # startup command usable when a copied .env.test still has blank secrets,
  # while preserving strict validation for explicitly supplied env files.
  if [[ -z "${CUSTOM_ENV_FILE}" ]]; then
    export AUTH_SIGNING_KEY="${AUTH_SIGNING_KEY:-0000000000000000000000000000000000000000000000000000000000000001}"
    export AUTH_REFRESH_PEPPER="${AUTH_REFRESH_PEPPER:-test-only-refresh-pepper}"
    export SESSION_MASTER_KEY="${SESSION_MASTER_KEY:-0000000000000000000000000000000000000000000000000000000000000002}"
    export CARD_CODE_PEPPER_DK1="${CARD_CODE_PEPPER_DK1:-test-only-card-pepper}"
  fi
}

check_session_key_identity() {
  local fingerprint previous
  fingerprint="$(printf '%s' "${SESSION_MASTER_KEY}" | shasum -a 256 | awk '{print $1}')"
  if [[ -f "${KEY_FINGERPRINT_FILE}" ]]; then
    previous="$(tr -d '[:space:]' <"${KEY_FINGERPRINT_FILE}")"
    [[ "${previous}" == "${fingerprint}" ]] || die "SESSION_MASTER_KEY changed for this test runtime; restore the previous key or remove ${KEY_FINGERPRINT_FILE} and log in all accounts again"
    return
  fi
  (umask 077; printf '%s\n' "${fingerprint}" >"${KEY_FINGERPRINT_FILE}")
}

build_backend_binaries() {
  log "building directly managed backend binaries"
  for name in api scheduler worker-interactive worker-browser worker-light; do
    go -C "${ROOT_DIR}/backend" build -o "${BIN_DIR}/${name}" "./cmd/${name}"
  done
}

check_secrets() {
  local missing=()
  [[ -n "${AUTH_SIGNING_KEY:-}" ]] || missing+=(AUTH_SIGNING_KEY)
  [[ -n "${AUTH_REFRESH_PEPPER:-}" ]] || missing+=(AUTH_REFRESH_PEPPER)
  [[ -n "${SESSION_MASTER_KEY:-}" ]] || missing+=(SESSION_MASTER_KEY)
  [[ -n "${CARD_CODE_PEPPER_DK1:-}" ]] || missing+=(CARD_CODE_PEPPER_DK1)
  ((${#missing[@]} == 0)) || die "missing required .env values: ${missing[*]}"
}

pid_for() {
  local name="$1"
  [[ -f "${PID_DIR}/${name}.pid" ]] && cat "${PID_DIR}/${name}.pid" || true
}

is_running() {
  local pid="$1"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

start_process() {
  local name="$1"
  shift
  local old_pid
  old_pid="$(pid_for "${name}")"
  if is_running "${old_pid}"; then
    log "${name} already running (pid ${old_pid})"
    return
  fi
  rm -f "${PID_DIR}/${name}.pid"
  log "starting ${name}"
  (
    cd "${ROOT_DIR}"
    exec "$@"
  ) >>"${LOG_DIR}/${name}.log" 2>&1 &
  echo $! >"${PID_DIR}/${name}.pid"
}

stop_process_tree() {
  local parent="$1"
  local child
  while read -r child; do
    [[ -n "${child}" ]] || continue
    stop_process_tree "${child}"
  done < <(pgrep -P "${parent}" 2>/dev/null || true)
  kill "${parent}" 2>/dev/null || true
}

wait_for_processes() {
  trap 'stop_all; exit 130' INT TERM
  log "test environment is running; press Ctrl+C to stop application processes"
  while true; do
    for name in api scheduler worker-interactive worker-browser worker-light web mini-h5 mini-weapp; do
      local pid
      pid="$(pid_for "${name}")"
      if ! is_running "${pid}"; then
        log "${name} stopped unexpectedly; stopping remaining application processes"
        stop_all
        return 1
      fi
    done
    sleep 1
  done
}

stop_process() {
  local name="$1"
  local pid
  pid="$(pid_for "${name}")"
  if ! is_running "${pid}"; then
    rm -f "${PID_DIR}/${name}.pid"
    return
  fi
  log "stopping ${name} (pid ${pid})"
  stop_process_tree "${pid}"
  for _ in $(seq 1 20); do
    is_running "${pid}" || break
    sleep 0.25
  done
  is_running "${pid}" && kill -9 "${pid}" 2>/dev/null || true
  rm -f "${PID_DIR}/${name}.pid"
}

start_all() {
  require_command go
  require_command pnpm
  require_command curl
  load_env
  check_secrets
  check_session_key_identity
  build_backend_binaries

  log "applying database migrations using the externally managed PostgreSQL instance"
  if ! go -C "${ROOT_DIR}/backend" run ./cmd/migrate; then
    die "PostgreSQL is unavailable at the DATABASE_URL configured in ${ENV_FILE}; start it outside this script or update DATABASE_URL"
  fi
  log "seeding local test data"
  if ! go -C "${ROOT_DIR}/backend" run ./cmd/migrate seed; then
    die "test data seeding failed; verify the externally managed PostgreSQL instance and DATABASE_URL"
  fi

  start_process api "${BIN_DIR}/api"
  wait_for_api
  start_process scheduler env METRICS_ADDR=:19090 "${BIN_DIR}/scheduler"
  start_process worker-interactive env METRICS_ADDR=:19091 "${BIN_DIR}/worker-interactive"
  start_process worker-browser env METRICS_ADDR=:19092 "${BIN_DIR}/worker-browser"
  start_process worker-light env METRICS_ADDR=:19093 "${BIN_DIR}/worker-light"
  start_process web pnpm --filter @douyin-keeper/web dev
  start_process mini-h5 env TARO_OUTPUT_ROOT=dist/h5 pnpm --filter @douyin-keeper/mini dev:h5
  start_process mini-weapp env TARO_OUTPUT_ROOT=dist/weapp pnpm --filter @douyin-keeper/mini dev:weapp

  log "test environment started"
  log "Web:      http://127.0.0.1:5173"
  log "Mini H5:  http://127.0.0.1:10086"
  log "API:      http://127.0.0.1:18080"
  log "Logs:     ${LOG_DIR}"
  log "Sidecar:  ${PLAYWRIGHT_SIDECAR_LOG_FILE}"
  wait_for_processes
}

stop_all() {
  for name in mini-weapp mini-h5 web worker-light worker-browser worker-interactive scheduler api; do
    stop_process "${name}"
  done
  log "application processes stopped; PostgreSQL and Redis were left untouched"
}

status_all() {
  for name in api scheduler worker-interactive worker-browser worker-light web mini-h5 mini-weapp; do
    local pid
    pid="$(pid_for "${name}")"
    if is_running "${pid}"; then
      printf '%-20s running (pid %s)\n' "${name}" "${pid}"
    else
      printf '%-20s stopped\n' "${name}"
    fi
  done
  log "PostgreSQL and Redis are managed outside this script"
}

logs_all() {
  tail -f "${LOG_DIR}"/*.log
}

main() {
  local command="${1:-start}"
  case "${command}" in
    start) start_all ;;
    stop) stop_all ;;
    restart) stop_all; start_all ;;
    status) status_all ;;
    logs) logs_all ;;
    *)
      printf 'Usage: %s {start|stop|restart|status|logs}\n' "$0"
      exit 2
      ;;
  esac
}

main "$@"
