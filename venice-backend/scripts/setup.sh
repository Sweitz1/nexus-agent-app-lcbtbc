#!/usr/bin/env bash
# Venice Private LLM — server setup
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "======================================================"
echo "  Venice Private LLM Setup"
echo "======================================================"

# 1. Create .env from template
if [ ! -f .env ]; then
  cp .env.example .env
  # Generate a random API key
  KEY=$(openssl rand -hex 24 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(24))")
  sed -i "s/changeme-set-in-env/$KEY/" .env
  echo ""
  echo "✓ .env created with API key: $KEY"
  echo "  SAVE THIS KEY — you'll need it in the Android app and web UI."
fi

# 2. SSL certs
mkdir -p nginx/certs
if [ ! -f nginx/certs/fullchain.pem ]; then
  echo ""
  echo "==> SSL certificates"
  echo "Options:"
  echo "  1) Let's Encrypt (recommended for real domain)"
  echo "  2) Self-signed (for local/testing)"
  read -r -p "Choice [1/2]: " ssl_choice

  if [[ "$ssl_choice" == "1" ]]; then
    read -r -p "Domain name: " DOMAIN
    sed -i "s/DOMAIN=localhost/DOMAIN=$DOMAIN/" .env
    if command -v certbot &>/dev/null; then
      certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos -m admin@"$DOMAIN"
      cp /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem nginx/certs/
      cp /etc/letsencrypt/live/"$DOMAIN"/privkey.pem  nginx/certs/
    else
      echo "Install certbot: sudo apt install certbot"
    fi
  else
    echo "  Generating self-signed cert (browsers will warn)..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout nginx/certs/privkey.pem \
      -out    nginx/certs/fullchain.pem \
      -subj "/CN=venice-local"
    echo "  ✓ Self-signed cert created"
  fi
fi

# 3. GPU detection
GPU_COMPOSE=""
if command -v nvidia-smi &>/dev/null; then
  echo ""
  echo "✓ NVIDIA GPU detected"
  GPU_COMPOSE="-f docker-compose.gpu.yml"
fi

# 4. Start
echo ""
echo "==> Starting Venice..."
docker compose -f docker-compose.yml $GPU_COMPOSE up -d --build

echo ""
echo "==> Waiting for services..."
sleep 8

# 5. Pull a starter model
echo ""
echo "Which uncensored model do you want to pull?"
echo "  1) dolphin-mistral:7b     (~4GB, fast, uncensored Mistral)"
echo "  2) dolphin-mixtral:8x7b   (~26GB, high quality, uncensored)"
echo "  3) hermes3:8b             (~5GB, Hermes 3 uncensored)"
echo "  4) dolphin-llama3:8b      (~5GB, uncensored LLaMA 3)"
echo "  5) nous-hermes2-mixtral   (~26GB, top quality uncensored)"
echo "  6) Skip"
read -r -p "Choice [1-6]: " model_choice

MODEL=""
case "$model_choice" in
  1) MODEL="dolphin-mistral:7b" ;;
  2) MODEL="dolphin-mixtral:8x7b" ;;
  3) MODEL="hermes3:8b" ;;
  4) MODEL="dolphin-llama3:8b" ;;
  5) MODEL="nous-hermes2-mixtral" ;;
  *) echo "Skipping model pull." ;;
esac

if [ -n "$MODEL" ]; then
  echo "Pulling $MODEL (this may take a while)..."
  docker exec venice_ollama ollama pull "$MODEL"
  echo "✓ $MODEL ready"
fi

# Load .env for the API key
source .env 2>/dev/null || true

echo ""
echo "======================================================"
echo "  Venice is running!"
echo ""
echo "  Web UI:    https://$(hostname -I | awk '{print $1}')"
echo "  API:       https://$(hostname -I | awk '{print $1}')/v1"
echo "  API Key:   ${VENICE_API_KEY:-see .env}"
echo ""
echo "  Android app — set in Venice Settings:"
echo "    Server URL: https://$(hostname -I | awk '{print $1}')"
echo "    API Key:    ${VENICE_API_KEY:-see .env}"
echo "======================================================"
