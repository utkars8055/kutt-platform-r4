#!/usr/bin/env bash
# Kutt R4 one-command installer/launcher.
# Native mode: bash install.sh (Node 24+, auto-bootstrapped on supported Linux/macOS)
# Docker mode: bash install.sh --docker
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
RUNTIME_DIR="$ROOT_DIR/.runtime"
INSTALL_STATE="$ROOT_DIR/.install-state"
MODE="native"

log()  { printf '\n\033[1;36m[Kutt] %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m[Kutt warning] %s\033[0m\n' "$*" >&2; }
fail() { printf '\n\033[1;31m[Kutt error] %s\033[0m\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Kutt R4 one-command installer

Usage:
  bash install.sh             Install/update dependencies, prepare DB, migrate, start app
  bash install.sh --docker   Build and start with Docker Compose
  bash install.sh --help     Show this help

BotKeep / Pterodactyl:
  Set the server startup command to: bash install.sh
  Select a Node.js 24 runtime/egg where available. The script can bootstrap
  Node 24 on supported Linux glibc and macOS hosts if network access is available.

Docker host:
  Run: bash install.sh --docker
  Requires Docker Engine/Desktop and the Docker Compose plugin.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --docker) MODE="docker" ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $arg (use --help)." ;;
  esac
done

has_cmd() { command -v "$1" >/dev/null 2>&1; }

download_file() {
  local url="$1" out="$2"
  if has_cmd curl; then
    curl --fail --location --silent --show-error --retry 2 --connect-timeout 15 "$url" -o "$out"
  elif has_cmd wget; then
    wget -q --tries=3 --timeout=20 -O "$out" "$url"
  else
    fail "curl or wget is required to download Node.js."
  fi
}

sha256_check() {
  local expected="$1" file="$2"
  if has_cmd sha256sum; then
    printf '%s  %s\n' "$expected" "$file" | sha256sum --check >/dev/null 2>&1
  elif has_cmd shasum; then
    printf '%s  %s\n' "$expected" "$file" | shasum -a 256 --check >/dev/null 2>&1
  else
    fail "sha256sum or shasum is required to verify the Node.js download."
  fi
}

node_major() {
  node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0'
}

ensure_node24() {
  local major
  if has_cmd node; then
    major="$(node_major)"
    if [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 24 )); then
      log "Using Node.js $(node --version)."
      has_cmd npm || fail "Node.js is present but npm is missing. Select a Node.js 24 runtime with npm enabled."
      return
    fi
  else
    major=0
  fi

  log "Node.js 24 or newer is required. Preparing a private Node.js 24 runtime..."
  local os arch platform libc tmp version archive checksum archive_path
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os:$arch" in
    Linux:x86_64|Linux:amd64) platform="linux-x64" ;;
    Linux:aarch64|Linux:arm64) platform="linux-arm64" ;;
    Darwin:x86_64) platform="darwin-x64" ;;
    Darwin:arm64) platform="darwin-arm64" ;;
    *) fail "Cannot automatically install Node 24 for $os/$arch. Select a Node.js 24 runtime in your hosting panel, or use Docker on a supported host." ;;
  esac

  if [[ "$os" == "Linux" ]]; then
    libc=""
    if [[ -f /etc/alpine-release ]] || (has_cmd ldd && ldd --version 2>&1 | grep -qi musl); then
      libc="musl"
    fi
    [[ -z "$libc" ]] || fail "This container uses musl/Alpine and does not have Node 24. For BotKeep, select its Node.js 24 runtime/egg. Otherwise use the Docker installer on a Docker host."
  fi

  mkdir -p "$RUNTIME_DIR"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/kutt-node24.XXXXXX")"
  # Keep the Node download isolated from the application source tree.
  download_file "https://nodejs.org/dist/index.json" "$tmp/index.json"
  version="$(sed -n 's/.*"version":"\(v24\.[^"]*\)".*/\1/p' "$tmp/index.json" | head -n 1)"
  [[ "$version" =~ ^v24\.[0-9]+\.[0-9]+$ ]] || fail "Could not determine the latest Node.js 24 release from nodejs.org."
  archive="node-${version}-${platform}.tar.xz"
  download_file "https://nodejs.org/dist/${version}/SHASUMS256.txt" "$tmp/SHASUMS256.txt"
  checksum="$(awk -v f="$archive" '$2 == f { print $1; exit }' "$tmp/SHASUMS256.txt")"
  [[ "$checksum" =~ ^[a-fA-F0-9]{64}$ ]] || fail "The official Node.js checksum for $archive was not found."
  download_file "https://nodejs.org/dist/${version}/${archive}" "$tmp/$archive"
  sha256_check "$checksum" "$tmp/$archive" || fail "Node.js archive checksum verification failed."
  tar -xJf "$tmp/$archive" -C "$tmp"
  rm -rf "$RUNTIME_DIR/node-${version}-${platform}"
  mv "$tmp/node-${version}-${platform}" "$RUNTIME_DIR/node-${version}-${platform}"
  export PATH="$RUNTIME_DIR/node-${version}-${platform}/bin:$PATH"
  rm -rf "$tmp"
  has_cmd node && has_cmd npm || fail "The private Node.js runtime did not install correctly."
  major="$(node_major)"
  (( major >= 24 )) || fail "Installed Node.js is unexpectedly old: $(node --version)."
  log "Installed private Node.js $(node --version) with checksum verification."
}

get_env_value() {
  local key="$1"
  [[ -f .env ]] || return 0
  awk -v key="$key" 'index($0, key "=") == 1 { sub("^[^=]*=", ""); gsub(/^\047|\047$|^\"|\"$/, ""); print; exit }' .env
}

set_env_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/kutt-env.XXXXXX")"
  if [[ -f .env ]] && grep -qE "^${key}=" .env; then
    awk -v key="$key" -v value="$value" '
      BEGIN { found = 0 }
      index($0, key "=") == 1 { print key "=" value; found = 1; next }
      { print }
      END { if (!found) print key "=" value }
    ' .env > "$tmp"
  else
    [[ -f .env ]] && cat .env > "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  cat "$tmp" > .env
  rm -f "$tmp"
}

prepare_env() {
  if [[ ! -f .env ]]; then
    [[ -f .example.env ]] || fail "Neither .env nor .example.env exists. Run this script from the Kutt project root."
    cp .example.env .env
    chmod 600 .env 2>/dev/null || true
    log "Created .env from the project template."
  fi

  local secret file_secret existing_domain desired_domain site_name
  file_secret="$(get_env_value JWT_SECRET)"
  secret="${JWT_SECRET:-$file_secret}"
  if [[ -z "$secret" ]]; then
    if has_cmd openssl; then
      secret="$(openssl rand -hex 48)"
    else
      secret="$(od -An -N48 -tx1 /dev/urandom | tr -d ' \n')"
    fi
    log "Generated a unique JWT secret."
  fi
  # Persist the secret even when it came from a panel environment variable;
  # Docker Compose reads .env through env_file rather than inheriting the shell.
  if [[ "$file_secret" != "$secret" ]]; then
    set_env_value JWT_SECRET "$secret"
    log "Saved the JWT secret in the protected .env file."
  fi

  site_name="${SITE_NAME:-$(get_env_value SITE_NAME)}"
  site_name="${site_name:-Kutt}"
  desired_domain="${DEFAULT_DOMAIN:-${PUBLIC_DOMAIN:-$(get_env_value DEFAULT_DOMAIN)}}"
  local initial_port
  initial_port="${HOST_PORT:-${PORT:-${SERVER_PORT:-$(get_env_value PORT)}}}"
  initial_port="${initial_port:-3000}"
  desired_domain="${desired_domain:-localhost:${initial_port}}"
  if [[ "$desired_domain" == "localhost:3000" && "$initial_port" != "3000" ]]; then
    desired_domain="localhost:${initial_port}"
  fi

  # Ask for the public hostname only on a first-time interactive installation.
  existing_domain="$(get_env_value DEFAULT_DOMAIN)"
  if [[ -t 0 && ( -z "$existing_domain" || "$existing_domain" == "localhost:3000" ) && -z "${DEFAULT_DOMAIN:-}${PUBLIC_DOMAIN:-}" ]]; then
    printf '\nPublic hostname only (no https://), e.g. short.example.com\n'
    read -r -p 'Public domain [localhost:'"$initial_port"']: ' answer || true
    [[ -z "${answer:-}" ]] || desired_domain="$answer"
  fi

  set_env_value SITE_NAME "$site_name"
  set_env_value DEFAULT_DOMAIN "$desired_domain"
  chmod 600 .env 2>/dev/null || true
  export SITE_NAME="$site_name"
  export DEFAULT_DOMAIN="$desired_domain"
  if [[ -n "${PORT:-}" ]]; then
    export PORT
  elif [[ -n "${SERVER_PORT:-}" ]]; then
    export PORT="$SERVER_PORT"
  fi
  log "Configuration ready. Public host: $DEFAULT_DOMAIN"
  if [[ "$DEFAULT_DOMAIN" == localhost:* ]]; then
    warn "DEFAULT_DOMAIN is still localhost. Set DEFAULT_DOMAIN in .env to your actual public hostname so generated short links are correct."
  fi
}

prepare_directories() {
  mkdir -p db custom/images custom/css custom/views
  local db_client db_filename
  db_client="${DB_CLIENT:-$(get_env_value DB_CLIENT)}"
  db_client="${db_client:-better-sqlite3}"
  db_filename="${DB_FILENAME:-$(get_env_value DB_FILENAME)}"
  db_filename="${db_filename:-db/data}"
  if [[ "$db_client" == "better-sqlite3" || "$db_client" == "sqlite3" ]]; then
    case "$db_filename" in
      /*) mkdir -p "$(dirname "$db_filename")" ;;
      *) mkdir -p "$(dirname "$ROOT_DIR/$db_filename")" ;;
    esac
  fi
}

install_dependencies() {
  [[ -f package.json && -f package-lock.json ]] || fail "package.json or package-lock.json is missing. Extract the complete Kutt project and run bash install.sh from its root."
  local lock_hash node_version state
  if has_cmd sha256sum; then
    lock_hash="$(sha256sum package-lock.json | awk '{print $1}')"
  elif has_cmd shasum; then
    lock_hash="$(shasum -a 256 package-lock.json | awk '{print $1}')"
  else
    fail "sha256sum or shasum is required to fingerprint package-lock.json."
  fi
  node_version="$(node --version)"
  state="$lock_hash $node_version"
  if [[ -x node_modules/.bin/knex && -f "$INSTALL_STATE" ]] && [[ "$(cat "$INSTALL_STATE")" == "$state" ]] \
    && node -e 'require("express"); require("knex"); require("better-sqlite3")' >/dev/null 2>&1; then
    log "Locked dependencies are installed and load correctly for $node_version; skipping npm ci."
    return
  fi
  log "Installing exact locked production dependencies (npm ci). This happens only when the lockfile or Node version changes."
  npm ci --omit=dev --no-audit --no-fund || fail "Dependency installation failed. Check network access and native build support. On BotKeep, use a Node.js 24 runtime/egg; if better-sqlite3 compilation is required, the container must include Python 3, make and a C/C++ compiler."
  [[ -x node_modules/.bin/knex ]] || fail "Knex CLI was not installed; dependency installation is incomplete."
  node -e 'require("express"); require("knex"); require("better-sqlite3")' \
    || fail "Core application dependencies did not load after installation. Check the Node version and native better-sqlite3 build output."
  printf '%s' "$state" > "$INSTALL_STATE"
}

run_migrations() {
  prepare_directories
  log "Applying pending database migrations..."
  npm run migrate || fail "Database migration failed. Back up the database and inspect the migration error before retrying."
  log "Database migrations are up to date."
}

print_access_info() {
  local url display_port
  display_port="${HOST_PORT:-${PORT:-${SERVER_PORT:-$(get_env_value PORT)}}}"
  display_port="${display_port:-3000}"
  if [[ "$DEFAULT_DOMAIN" == localhost:* ]]; then
    url="http://localhost:${display_port}"
  elif [[ "$DEFAULT_DOMAIN" == http://* || "$DEFAULT_DOMAIN" == https://* ]]; then
    url="$DEFAULT_DOMAIN"
  else
    url="https://$DEFAULT_DOMAIN"
  fi
  printf '\n\033[1;32mKutt is ready.\033[0m\n'
  printf 'Dashboard: %s/\n' "$url"
  printf 'First-time administrator setup: %s/create-admin\n' "$url"
  printf 'Health check: %s/api/health\n' "$url"
  printf 'Build marker: 2026.11.04-r4-one-command-installer\n\n'
  printf 'Create the first administrator at /create-admin. After that, sign in at /login.\n'
  printf 'Do not delete .env or the db/ directory: they contain your secret and database.\n\n'
}

run_docker() {
  has_cmd docker || fail "Docker is not installed. Install Docker Engine/Desktop, or run bash install.sh on a Node.js host."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is missing. Install the Docker Compose v2 plugin."
  prepare_env
  log "Building and starting Kutt with Docker Compose..."
  export HOST_PORT="${HOST_PORT:-${SERVER_PORT:-3000}}"
  docker compose up -d --build
  log "Docker Compose has accepted the deployment command. Current service status:"
  docker compose ps
  print_access_info
  printf 'Useful commands:\n  docker compose logs -f server\n  docker compose restart server\n  docker compose down   (keeps named database/custom volumes)\n\n'
}

if [[ "$MODE" == "docker" ]]; then
  run_docker
  exit 0
fi

ensure_node24
prepare_env
install_dependencies
run_migrations
print_access_info
log "Starting Kutt in the foreground for the hosting panel..."
export NODE_ENV=production
exec node server/server.js --production
