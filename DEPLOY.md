# Haatzmaut — CLI Deployment Guide

## Current Release Notes

- This release is client-side only; deployment flow, hosts, and container commands are unchanged.
- The updated meeting-form behavior, dashboard counter removal, and session/login changes are all shipped through the normal `npm run build` + sync path.
- No additional infra or Caddy changes are required for this update.

## Prerequisites

- SSH key at `~/Documents/private-clinic-key.pem`
- EC2 at `13.61.60.244`
- Local repo at `~/Haatzmaut`
- GitHub remote: `https://github.com/lioralo/Haatzmaut`

## Quick Deploy (build + push + sync)

```bash
cd ~/Haatzmaut
npm run build && \
rsync -avz --delete \
  -e "ssh -i ~/Documents/private-clinic-key.pem -o StrictHostKeyChecking=no" \
  dist/ ubuntu@13.61.60.244:/opt/haatzmaut/dist/
```

## Full Deploy (rebuild sync server + deploy)

```bash
cd ~/Haatzmaut

# Build frontend
npm run build

# Upload frontend
rsync -avz --delete \
  -e "ssh -i ~/Documents/private-clinic-key.pem -o StrictHostKeyChecking=no" \
  dist/ ubuntu@13.61.60.244:/opt/haatzmaut/dist/

# Upload server code
rsync -avz \
  -e "ssh -i ~/Documents/private-clinic-key.pem -o StrictHostKeyChecking=no" \
  server/ ubuntu@13.61.60.244:/opt/haatzmaut/server/

# Rebuild and restart sync container
ssh -i ~/Documents/private-clinic-key.pem ubuntu@13.61.60.244 \
  "cd /opt/Private_Clinic && \
   sudo docker compose -f docker-compose.prod.yml build haatzmaut_sync && \
   sudo docker compose -f docker-compose.prod.yml up -d haatzmaut_sync"

# Verify
curl -sk -o /dev/null -w "haatzmaut: HTTP %{http_code}\n" https://haatzmaut.lior-clinic.org/
curl -sk -o /dev/null -w "clinic:    HTTP %{http_code}\n" https://clinic.lior-clinic.org/login
curl -sk https://haatzmaut.lior-clinic.org/api/healthz
```

## Post-Deploy Freshness Checks (recommended)

Run these right after deploy to verify clients receive the latest build automatically:

```bash
# 1) Confirm no-store policy on HTML shell
curl -skI https://haatzmaut.lior-clinic.org/ | grep -i "cache-control"

# 2) Confirm service worker is served and cache-busted by build id
curl -sk https://haatzmaut.lior-clinic.org/sw.js | head -n 5

# 3) Confirm built index references versioned assets
curl -sk https://haatzmaut.lior-clinic.org/ | grep -E "app.min.js\\?v=|styles.css\\?v="

# 4) Browser spot-check:
#    keep one tab open, deploy again, verify it auto-refreshes to newest version
```

## Restart Caddy (after Caddyfile changes)

```bash
ssh -i ~/Documents/private-clinic-key.pem ubuntu@13.61.60.244 \
  "sudo docker stop private_clinic_caddy && sudo docker rm private_clinic_caddy && \
   sudo docker stop private_clinic_app && sudo docker rm private_clinic_app && \
   cd /opt/Private_Clinic && \
   sudo docker compose -f docker-compose.prod.yml up -d"
```

## Seed Cloud Database (wipes + re-uploads encrypted state)

```bash
# Upload seed script
rsync -avz \
  -e "ssh -i ~/Documents/private-clinic-key.pem -o StrictHostKeyChecking=no" \
  server/seed_full.mjs ubuntu@13.61.60.244:/opt/haatzmaut/server/seed_full.mjs

# Run seed
ssh -i ~/Documents/private-clinic-key.pem ubuntu@13.61.60.244 \
  "sudo docker cp /opt/haatzmaut/server/seed_full.mjs haatzmaut_sync:/app/seed_full.mjs && \
   sudo docker exec haatzmaut_sync node /app/seed_full.mjs"
```

## Push to GitHub

```bash
cd ~/Haatzmaut
git add -A
git commit -m "your commit message"
git push origin main
```

## View Logs

```bash
# Sync server
ssh -i ~/Documents/private-clinic-key.pem ubuntu@13.61.60.244 \
  "sudo docker logs haatzmaut_sync --tail 20"

# Caddy
ssh -i ~/Documents/private-clinic-key.pem ubuntu@13.61.60.244 \
  "sudo docker logs private_clinic_caddy --tail 20"

# App
ssh -i ~/Documents/private-clinic-key.pem ubuntu@13.61.60.244 \
  "sudo docker logs private_clinic_app --tail 20"
```

## URLs

| Site | URL |
|------|-----|
| Haatzmaut | https://haatzmaut.lior-clinic.org |
| Clinic | https://clinic.lior-clinic.org |
| Cloud API health | https://haatzmaut.lior-clinic.org/api/healthz |
