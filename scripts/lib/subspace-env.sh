#!/usr/bin/env bash
# Shared environment loader for the Subspace Lattice monorepo (Bash 3.2+ / macOS bash).
#
# Usage (source from other scripts — do not execute):
#   # shellcheck source=scripts/lib/subspace-env.sh
#   . "$(cd "$(dirname "$0")/.." && pwd)/lib/subspace-env.sh"   # from scripts/
#   subspace_env_load <mode>
#   subspace_env_validate <mode>
#
# Modes:
#   base       Root .env / .env.local only
#   web        + apps/web Vite Firebase client env
#   desktop    Same as web (Tauri hosts the web frontend)
#   functions  + apps/functions env; defaults FIREBASE_PROJECT
#   deploy     Same as functions; refuses demo-* project ids
#   e2e        web env + emulator-oriented defaults
#
# Precedence: already-exported process ENV > .env.local > .env > defaults.
# Never overwrites an already-exported variable. Does not execute .env contents.

# Refuse accidental execution as a main script.
if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  echo "error: source scripts/lib/subspace-env.sh; do not execute it" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

_subspace_env_is_set() {
  eval "[ \"\${$1+x}\" = x ]"
}

_subspace_env_export_if_unset() {
  local key="$1"
  local value="$2"
  if _subspace_env_is_set "$key"; then
    return 0
  fi
  case "$value" in
    \$HOME/*) value="${HOME}/${value#\$HOME/}" ;;
    \~/*) value="${HOME}/${value#\~/}" ;;
  esac
  export "$key=$value"
}

subspace_env_die() {
  echo "error: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Repo root
# ---------------------------------------------------------------------------

subspace_env_repo_root() {
  if [ -n "${SUBSPACE_ROOT:-}" ] && [ -d "${SUBSPACE_ROOT}" ]; then
    printf '%s' "$SUBSPACE_ROOT"
    return 0
  fi

  local here candidate
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # scripts/lib → repo root
  candidate="$(cd "${here}/../.." && pwd)"
  if [ -f "${candidate}/package.json" ] && [ -f "${candidate}/nx.json" ]; then
    printf '%s' "$candidate"
    return 0
  fi

  candidate="$here"
  while [ "$candidate" != "/" ]; do
    if [ -f "${candidate}/package.json" ] && [ -f "${candidate}/nx.json" ]; then
      printf '%s' "$candidate"
      return 0
    fi
    candidate="$(cd "${candidate}/.." && pwd)"
  done

  subspace_env_die "could not resolve repo root (set SUBSPACE_ROOT)"
}

# ---------------------------------------------------------------------------
# Safe KEY=VALUE file load (process ENV wins)
# ---------------------------------------------------------------------------

subspace_env_load_file() {
  local path="$1"
  [ -f "$path" ] || return 0

  local line key value stripped
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    stripped="$line"
    while [ "${stripped#"${stripped%%[![:space:]]*}"}" != "$stripped" ]; do
      stripped="${stripped#"${stripped%%[![:space:]]*}"}"
    done
    [ -z "$stripped" ] && continue
    case "$stripped" in
      \#*) continue ;;
      *=*) ;;
      *) continue ;;
    esac

    key="${stripped%%=*}"
    value="${stripped#*=}"
    while [ "${key%"${key##*[![:space:]]}"}" != "$key" ]; do
      key="${key%"${key##*[![:space:]]}"}"
    done
    while [ "${key#"${key%%[![:space:]]*}"}" != "$key" ]; do
      key="${key#"${key%%[![:space:]]*}"}"
    done
    [ -z "$key" ] && continue

    case "$key" in
      *[!A-Za-z0-9_]*) continue ;;
    esac
    case "$value" in
      *'`'* | *'$('* | *'${'*) continue ;;
    esac

    if [ "${#value}" -ge 2 ]; then
      case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
      esac
    fi

    _subspace_env_export_if_unset "$key" "$value"
  done < "$path"
}

# ---------------------------------------------------------------------------
# Layered load by mode
# ---------------------------------------------------------------------------

subspace_env_load() {
  local mode="${1:-base}"
  local root
  root="$(subspace_env_repo_root)"
  export SUBSPACE_ROOT="$root"

  subspace_env_load_file "${root}/.env"
  subspace_env_load_file "${root}/.env.local"

  case "$mode" in
    base) ;;
    web | desktop | e2e)
      subspace_env_load_file "${root}/apps/web/.env"
      subspace_env_load_file "${root}/apps/web/.env.local"
      _subspace_env_export_if_unset VITE_FIREBASE_PROJECT_ID "subspace-lattice"
      _subspace_env_export_if_unset \
        VITE_FIREBASE_AUTH_DOMAIN \
        "subspace-lattice.firebaseapp.com"
      _subspace_env_export_if_unset \
        VITE_FIREBASE_STORAGE_BUCKET \
        "subspace-lattice.appspot.com"
      ;;
    functions | deploy)
      subspace_env_load_file "${root}/apps/functions/.env"
      subspace_env_load_file "${root}/apps/functions/.env.local"
      _subspace_env_export_if_unset FIREBASE_PROJECT "warp-12"
      ;;
    *)
      subspace_env_die "unknown subspace_env_load mode: ${mode} (expected: base|web|desktop|functions|deploy|e2e)"
      ;;
  esac

  if [ "$mode" = "e2e" ]; then
    _subspace_env_export_if_unset VITE_USE_FIREBASE_EMULATORS "true"
    _subspace_env_export_if_unset FIREBASE_E2E_PROJECT "demo-subspace"
  fi

  if [ "$mode" = "desktop" ]; then
    _subspace_env_export_if_unset TAURI_PRODUCT_NAME "Subspace Lattice"
    _subspace_env_export_if_unset \
      TAURI_IDENTIFIER \
      "org.digitaldefiance.app.subspacelattice"
  fi
}

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

subspace_env_require() {
  local missing=0
  local var val
  for var in "$@"; do
    eval "val=\"\${$var:-}\""
    if [ -z "$val" ]; then
      echo "error: required environment variable ${var} is unset or empty" >&2
      echo "  Set it in the process environment or in ${SUBSPACE_ROOT:-.}/.env (see .env.example)" >&2
      missing=1
    fi
  done
  [ "$missing" -eq 0 ] || exit 1
}

subspace_env_require_file() {
  local path
  for path in "$@"; do
    [ -f "$path" ] || subspace_env_die "required file missing: ${path}"
  done
}

subspace_env_validate() {
  local mode="${1:-base}"
  case "$mode" in
    base) ;;
    web | desktop)
      subspace_env_require VITE_FIREBASE_PROJECT_ID
      ;;
    e2e)
      subspace_env_require VITE_FIREBASE_PROJECT_ID VITE_USE_FIREBASE_EMULATORS
      ;;
    functions)
      subspace_env_require FIREBASE_PROJECT
      ;;
    deploy)
      subspace_env_require FIREBASE_PROJECT
      case "${FIREBASE_PROJECT}" in
        demo-*)
          subspace_env_die "FIREBASE_PROJECT=${FIREBASE_PROJECT} looks like an emulator project; refusing production deploy"
          ;;
      esac
      ;;
    *)
      subspace_env_die "unknown subspace_env_validate mode: ${mode} (expected: base|web|desktop|functions|deploy|e2e)"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------

subspace_env_cd_root() {
  local root
  root="$(subspace_env_repo_root)"
  export SUBSPACE_ROOT="$root"
  cd "$root" || subspace_env_die "cd ${root} failed"
}

subspace_env_abs_path() {
  local p="$1"
  case "$p" in
    /*) printf '%s' "$p" ;;
    \$HOME/*) printf '%s' "${HOME}/${p#\$HOME/}" ;;
    \~/*) printf '%s' "${HOME}/${p#\~/}" ;;
    *) printf '%s' "${SUBSPACE_ROOT:-.}/${p}" ;;
  esac
}

# Write apps/desktop/src-tauri/tauri.conf.local.json from env (ignored by git).
# Prints the absolute output path on stdout.
subspace_env_write_tauri_local_config() {
  local root helper out
  root="$(subspace_env_repo_root)"
  helper="${root}/scripts/tauri-config-from-env.mjs"
  out="${root}/apps/desktop/src-tauri/tauri.conf.local.json"
  [ -f "$helper" ] || subspace_env_die "missing ${helper}"
  node "$helper" --write "$out" >/dev/null || subspace_env_die "failed to write ${out}"
  [ -f "$out" ] || subspace_env_die "missing generated config: ${out}"
  printf '%s' "$out"
}
