#!/usr/bin/env bash
# Run the Arkon knowledge hub (github.com/nduckmink/arkon) on this PC using
# local Ollama models instead of paid AI APIs.
#
# Arkon only offers Claude / Gemini / GPT models, but lets you change each
# provider's server address. This script points Arkon's "OpenAI" provider at
# Ollama and creates Ollama models under the names Arkon asks for:
#   gpt-4o-mini            → your local chat model (long context)
#   text-embedding-3-small → your local embedding model (1536 numbers)
#
# Arkon is downloaded from its own GitHub repo onto this machine. Its licence
# (PolyForm Internal Use) allows running and changing it for your own use, not
# redistributing it, so nothing from Arkon is stored in the Nexus Agent repo.
#
#   ./arkon-local-setup.sh              # full setup
#   ./arkon-local-setup.sh --dry-run    # show what would happen
#   ./arkon-local-setup.sh --no-ollama-config   # don't touch the Ollama service
#
# Settings (environment variables):
#   ARKON_DIR   where to put Arkon             (default: ~/arkon)
#   LLM_BASE    Ollama chat model to use       (default: qwen3:30b)
#   LLM_CTX     context length for that model  (default: 131072)
#   EMBED_BASE  Ollama embedding model         (default: qwen3-embedding:4b)
set -euo pipefail

ARKON_DIR="${ARKON_DIR:-$HOME/arkon}"
ARKON_REPO="${ARKON_REPO:-https://github.com/nduckmink/arkon}"
LLM_BASE="${LLM_BASE:-qwen3:30b}"
LLM_CTX="${LLM_CTX:-131072}"
EMBED_BASE="${EMBED_BASE:-qwen3-embedding:4b}"
LLM_ALIAS="gpt-4o-mini";            LLM_SPEC="openai/gpt-4o-mini"
EMBED_ALIAS="text-embedding-3-small"; EMBED_SPEC="openai/text-embedding-3-small"; EMBED_DIM=1536
OLLAMA_LOCAL="http://127.0.0.1:11434"
OLLAMA_FROM_DOCKER="http://host.docker.internal:11434/v1"
API="http://127.0.0.1:5055"

DRY_RUN=0
CONFIG_OLLAMA=1
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    --no-ollama-config) CONFIG_OLLAMA=0 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Unknown option: $a" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; WARNINGS=$((WARNINGS+1)); }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then echo "    (dry run) $*"; else "$@"; fi; }
WARNINGS=0

# Set KEY=VALUE in an env file, replacing an existing line or appending one.
setkv() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
}
rand() { openssl rand -hex "${1:-24}"; }
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }

# ── 1. Prerequisites ────────────────────────────────────────────────────────
say "Checking prerequisites"
for c in git curl openssl python3 docker ollama; do
  command -v "$c" >/dev/null 2>&1 || die "Missing '$c'. $( [ "$c" = ollama ] && echo 'Run linux-local-ai-setup.sh first.' || echo 'Install it and re-run.')"
done
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command)."
COMPOSE_VER=$(docker compose version --short | sed 's/^v//')
if [ "$(printf '%s\n%s\n' 2.24.4 "$COMPOSE_VER" | sort -V | head -1)" != "2.24.4" ]; then
  die "Docker Compose $COMPOSE_VER is too old (need 2.24.4+ to keep Arkon's ports private). Update Docker."
fi
docker info >/dev/null 2>&1 || die "Can't talk to Docker. Start it, or add yourself to the docker group (then log out and in)."

# ── 2. Let Docker containers reach Ollama ───────────────────────────────────
# Ollama listens on 127.0.0.1 by default, which containers can't reach.
if [ "$CONFIG_OLLAMA" = 1 ] && command -v systemctl >/dev/null 2>&1 && systemctl cat ollama.service >/dev/null 2>&1; then
  say "Configuring the Ollama service for Arkon"
  CONF=/etc/systemd/system/ollama.service.d/arkon.conf
  if [ "$DRY_RUN" = 1 ]; then
    echo "    (dry run) write $CONF: OLLAMA_HOST=0.0.0.0:11434, flash attention, q8_0 KV cache"
  else
    sudo mkdir -p "$(dirname "$CONF")"
    sudo tee "$CONF" >/dev/null <<'EOF'
[Service]
# Added by Nexus Agent's arkon-local-setup.sh so Docker containers can reach Ollama.
Environment="OLLAMA_HOST=0.0.0.0:11434"
# Halve the memory used by long contexts.
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
EOF
    sudo systemctl daemon-reload
    sudo systemctl restart ollama
  fi
  if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    say "Firewall: allowing Ollama from Docker networks only"
    run sudo ufw allow from 172.16.0.0/12 to any port 11434 proto tcp
    run sudo ufw deny 11434/tcp
  else
    warn "Ollama now listens on all network interfaces. On a shared network, block port 11434 from other machines."
  fi
elif [ "$CONFIG_OLLAMA" = 1 ]; then
  warn "No ollama systemd service found. Start Ollama yourself with OLLAMA_HOST=0.0.0.0:11434 so Arkon can reach it."
fi

if [ "$DRY_RUN" = 0 ]; then
  for _ in $(seq 1 30); do curl -fsS -m 2 "$OLLAMA_LOCAL/api/version" >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS -m 3 "$OLLAMA_LOCAL/api/version" >/dev/null || die "Ollama isn't answering on $OLLAMA_LOCAL."
fi

# ── 3. Local models under the names Arkon expects ───────────────────────────
say "Preparing models: $LLM_BASE → $LLM_ALIAS (ctx $LLM_CTX), $EMBED_BASE → $EMBED_ALIAS"
run ollama pull "$LLM_BASE"
run ollama pull "$EMBED_BASE"
MF=$(mktemp)
trap 'rm -f "$MF"' EXIT
printf 'FROM %s\nPARAMETER num_ctx %s\n' "$LLM_BASE" "$LLM_CTX" > "$MF"
run ollama create "$LLM_ALIAS" -f "$MF"
printf 'FROM %s\n' "$EMBED_BASE" > "$MF"
run ollama create "$EMBED_ALIAS" -f "$MF"

if [ "$DRY_RUN" = 0 ]; then
  TRAINED=$(ollama show "$LLM_BASE" 2>/dev/null | awk '/context length/ {print $NF; exit}')
  if [ -n "$TRAINED" ] && [ "$TRAINED" -lt "$LLM_CTX" ] 2>/dev/null; then
    warn "$LLM_BASE was trained for $TRAINED tokens but Arkon will send up to ~$((LLM_CTX*6/10)). Pick a longer-context LLM_BASE for big documents."
  fi
  say "Checking that embeddings come back with $EMBED_DIM numbers"
  GOT=$(curl -fsS -m 300 "$OLLAMA_LOCAL/v1/embeddings" -H 'Content-Type: application/json' \
        -d "{\"model\":\"$EMBED_ALIAS\",\"input\":\"hello\",\"dimensions\":$EMBED_DIM}" \
        | json 'len(d["data"][0]["embedding"])' 2>/dev/null || echo 0)
  if [ "$GOT" = "$EMBED_DIM" ]; then
    say "Embeddings OK ($GOT)"
  else
    warn "Embeddings came back with $GOT numbers, not $EMBED_DIM. Arkon's search and document upload won't work until this is fixed: update Ollama, or set EMBED_BASE to a model that supports $EMBED_DIM dimensions."
  fi
fi

# ── 4. Download Arkon ───────────────────────────────────────────────────────
if [ -d "$ARKON_DIR/.git" ]; then
  say "Updating Arkon in $ARKON_DIR"
  run git -C "$ARKON_DIR" pull --ff-only
else
  say "Downloading Arkon into $ARKON_DIR"
  run git clone --depth 1 "$ARKON_REPO" "$ARKON_DIR"
fi

# ── 5. Private config (kept on re-runs so passwords don't change) ───────────
CRED="$ARKON_DIR/.nexus-arkon-credentials"
if [ "$DRY_RUN" = 1 ]; then
  echo "    (dry run) write $ARKON_DIR/.env.docker, .env and docker-compose.override.yml with random secrets"
else
  cd "$ARKON_DIR"
  if [ ! -f .env.docker ]; then
    say "Writing .env.docker with random secrets"
    PG_PW=$(rand 16); REDIS_PW=$(rand 16); MINIO_PW=$(rand 16); ADMIN_PW=$(rand 12)
    cp .env.docker.example .env.docker
    chmod 600 .env.docker
    setkv POSTGRES_PASSWORD "$PG_PW" .env.docker
    setkv DATABASE_URL "postgresql+asyncpg://arkon:${PG_PW}@postgres:5432/arkon" .env.docker
    setkv SECRET_KEY "$(rand 32)" .env.docker
    setkv MCP_TOKEN_PEPPER "$(rand 32)" .env.docker
    setkv DEFAULT_ADMIN_EMAIL "admin@arkon.local" .env.docker
    setkv DEFAULT_ADMIN_PASSWORD "$ADMIN_PW" .env.docker
    setkv MINIO_ACCESS_KEY "arkon" .env.docker
    setkv MINIO_SECRET_KEY "$MINIO_PW" .env.docker
    setkv MINIO_PUBLIC_ENDPOINT "localhost:9002" .env.docker
    setkv REDIS_PASSWORD "$REDIS_PW" .env.docker
    setkv WORKER_JOB_TIMEOUT "7200" .env.docker
    setkv WORKER_MAX_JOBS "1" .env.docker
    setkv CORS_ORIGINS "http://localhost:3119" .env.docker
    # Docker Compose reads its own ${...} values from .env, so mirror them.
    umask 077
    cat > .env <<EOF
POSTGRES_USER=arkon
POSTGRES_PASSWORD=$PG_PW
POSTGRES_DB=arkon
REDIS_PASSWORD=$REDIS_PW
MINIO_ACCESS_KEY=arkon
MINIO_SECRET_KEY=$MINIO_PW
NEXT_PUBLIC_API_URL=http://localhost:5055
EOF
    printf 'url=http://localhost:3119\napi=%s\nemail=admin@arkon.local\npassword=%s\n' "$API" "$ADMIN_PW" > "$CRED"
    chmod 600 "$CRED"
  else
    say "Keeping existing .env.docker"
  fi

  say "Writing docker-compose.override.yml (Ollama access, ports on this PC only)"
  cat > docker-compose.override.yml <<'EOF'
# Written by Nexus Agent's arkon-local-setup.sh. Safe to delete to undo.
x-ollama: &ollama
  extra_hosts:
    - "host.docker.internal:host-gateway"
services:
  api:
    <<: *ollama
    ports: !override
      - "127.0.0.1:5055:5055"
  worker:
    <<: *ollama
  worker_skills:
    <<: *ollama
  frontend:
    ports: !override
      - "127.0.0.1:3119:3000"
  minio:
    ports: !override
      - "127.0.0.1:9002:9000"
      - "127.0.0.1:9003:9001"
EOF
fi

# ── 6. Start Arkon ──────────────────────────────────────────────────────────
say "Building and starting Arkon (the first build takes several minutes)"
if [ "$DRY_RUN" = 1 ]; then
  echo "    (dry run) docker compose up -d --build   (in $ARKON_DIR)"
  echo; say "Dry run finished. Nothing was changed."; exit 0
fi
docker compose up -d --build
say "Waiting for Arkon's API"
for _ in $(seq 1 90); do curl -fsS -m 3 "$API/health" >/dev/null 2>&1 && break; sleep 5; done
curl -fsS -m 3 "$API/health" >/dev/null || die "Arkon's API didn't come up. See: docker compose -f $ARKON_DIR/docker-compose.yml logs api"

# ── 7. Point Arkon at Ollama ────────────────────────────────────────────────
say "Configuring Arkon to use Ollama"
EMAIL=$(sed -n 's/^email=//p' "$CRED"); PASS=$(sed -n 's/^password=//p' "$CRED")
TOKEN=$(curl -fsS "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$EMAIL" "$PASS")" \
  | json 'd["access_token"]') || die "Couldn't log in to Arkon as $EMAIL."
call() {
  if [ $# -ge 3 ]; then
    curl -fsS -X "$1" "$API$2" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$3"
  else
    curl -fsS -X "$1" "$API$2" -H "Authorization: Bearer $TOKEN"
  fi
}

# Ollama ignores the key, but Arkon insists on one.
call PUT /api/settings "{\"settings\":{\"llm_api_key\":\"ollama\",\"llm_base_url\":\"$OLLAMA_FROM_DOCKER\",\"embedding_api_key__openai\":\"ollama\",\"embedding_base_url\":\"$OLLAMA_FROM_DOCKER\"}}" >/dev/null
call POST /api/settings/llm/switch "{\"model_spec_id\":\"$LLM_SPEC\"}" >/dev/null
call POST /api/settings/embeddings/switch "{\"model_spec_id\":\"$EMBED_SPEC\"}" >/dev/null \
  || warn "Embedding switch was refused (a job may already be running). Pick '$EMBED_SPEC' in Arkon → Settings → Embedding."

say "Testing the connection from Arkon to Ollama (the first call loads the model, so it can take a minute)"
LLM_TEST=$(call POST /api/settings/test-llm | json 'str(d["success"]) + ": " + d["message"]' || echo "False: request failed")
EMB_TEST=$(call POST /api/settings/test-embedding | json 'str(d["success"]) + ": " + d["message"]' || echo "False: request failed")
echo "    Chat model: $LLM_TEST"
echo "    Embeddings: $EMB_TEST"
case "$LLM_TEST" in True*) ;; *) warn "Arkon can't use the chat model yet." ;; esac
case "$EMB_TEST" in True*) ;; *) warn "Arkon can't use the embedding model yet." ;; esac

cat <<EOF

Arkon is running (finished with $WARNINGS warning(s)).
  Web app:  http://localhost:3119
  Login:    $EMAIL  /  password in $CRED
  Vision:   left off (no local vision model is wired up)

In Nexus Agent → Providers → Arkon knowledge hub: enter the API URL
$API with the same email and password, then enable the arkon_* tools on a task.

Stop:   docker compose -f $ARKON_DIR/docker-compose.yml down
Start:  docker compose -f $ARKON_DIR/docker-compose.yml up -d
EOF
