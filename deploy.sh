#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Deploy Haatzmaut PWA to EC2 alongside Private_Clinic Caddy
# Usage: bash deploy.sh [EC2_IP] [SSH_KEY_PATH]
# ============================================================

DEPLOY_DIR="/opt/haatzmaut"
DIST_DIR="${DEPLOY_DIR}/dist"
REPO_URL="${HAATZMAUT_REPO_URL:-}"  # set via env or edit below

EC2_IP="${1:-${EC2_IP:-}}"
SSH_KEY="${2:-${SSH_KEY_PATH:-~/.ssh/id_rsa}}"

if [ -z "$EC2_IP" ]; then
  echo "ERROR: EC2_IP required. Usage: bash deploy.sh <EC2_IP> [SSH_KEY_PATH]"
  exit 1
fi

SSH="ssh -i ${SSH_KEY} ubuntu@${EC2_IP}"

echo "=== 1. Clone / pull code ==="
$SSH "
  if [ -d \"${DEPLOY_DIR}\" ]; then
    cd ${DEPLOY_DIR} && git pull origin main
  else
    git clone ${REPO_URL:?set HAATZMAUT_REPO_URL} ${DEPLOY_DIR}
  fi
"

echo "=== 2. Build production dist ==="
$SSH "
  cd ${DEPLOY_DIR}
  npm ci
  node build.mjs --prod
"

echo "=== 3. Caddy reload ==="
$SSH "
  cd ~/Private_Clinic
  docker compose -f docker-compose.prod.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile
"

echo "=== 4. Health check ==="
sleep 2
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://haatzmaut.lior-clinic.org/" || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "PASS: Haatzmaut is live (HTTP $STATUS)"
else
  echo "WARN: health check returned HTTP $STATUS"
fi

echo ""
echo "Done. Visit: https://haatzmaut.lior-clinic.org/"
