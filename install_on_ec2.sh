#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Haatzmaut — One-shot EC2 setup + deploy
# Run FROM the EC2 server: bash install_on_ec2.sh
# ============================================================

DEPLOY_DIR="/opt/haatzmaut"
CADDY_HOST_DIR="/opt/haatzmaut/dist"
CADDY_CONTAINER_DIR="/srv/haatzmaut"

CLINIC_DIR="${HOME}/Private_Clinic"

echo "=== 1. Clone repo (if not exists) ==="
if [ ! -d "$DEPLOY_DIR" ]; then
  echo "Repo not found at $DEPLOY_DIR."
  echo "Upload the Haatzmaut project to $DEPLOY_DIR first, or provide a git URL."
  echo "  rsync -avz ./Haatzmaut/ ubuntu@<IP>:$DEPLOY_DIR/"
  exit 1
fi

echo "=== 2. Install deps & build ==="
cd "$DEPLOY_DIR"
npm ci
node build.mjs --prod

echo "=== 3. Verify dist ==="
test -f dist/index.html || { echo "ERROR: dist/index.html missing"; exit 1; }
test -f dist/app.min.js || { echo "ERROR: dist/app.min.js missing"; exit 1; }
echo "dist ready ($(du -sh dist | cut -f1))"

echo "=== 4. Update Caddyfile ==="
CADDYFILE="${CLINIC_DIR}/Caddyfile"
if ! grep -q "haatzmaut.lior-clinic.org" "$CADDYFILE" 2>/dev/null; then
  cat >> "$CADDYFILE" <<'CADDY_BLOCK'

haatzmaut.lior-clinic.org {
  tls {$TLS_EMAIL}
  root * /srv/haatzmaut
  file_server
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
CADDY_BLOCK
  echo "Added haatzmaut.lior-clinic.org to Caddyfile"
else
  echo "haatzmaut vhost already in Caddyfile"
fi

echo "=== 5. Update docker-compose.prod.yml ==="
COMPOSE="${CLINIC_DIR}/docker-compose.prod.yml"
if ! grep -q "$CADDY_CONTAINER_DIR" "$COMPOSE" 2>/dev/null; then
  sed -i "s|- caddy_data:/data|- ${DEPLOY_DIR}/dist:${CADDY_CONTAINER_DIR}:ro\n      - caddy_data:/data|" "$COMPOSE"
  echo "Added haatzmaut volume mount to docker-compose"
else
  echo "Volume mount already in docker-compose"
fi

echo "=== 6. Reload Caddy ==="
cd "$CLINIC_DIR"
docker compose -f docker-compose.prod.yml up -d caddy
sleep 3

echo "=== 7. Health check ==="
STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "https://haatzmaut.lior-clinic.org/" 2>/dev/null || echo "---")
if echo "$STATUS" | grep -q "^\d"; then
  STATUS_CODE=$(echo "$STATUS" | head -c3)
  echo "HTTP $STATUS_CODE : https://haatzmaut.lior-clinic.org/"
fi

echo ""
echo "DONE. Verify: https://haatzmaut.lior-clinic.org/"
echo "Also check: https://lior-clinic.org/ (main clinic app)"
