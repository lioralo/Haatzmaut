# IONOS DNS Setup for Haatzmaut

## Step 1: Get your EC2 public IP
```bash
# Run on EC2 or via SSH:
curl -s http://checkip.amazonaws.com
```

## Step 2: Add A record in IONOS

Log in to IONOS DNS management for `lior-clinic.org` and add:

| Type  | Host/Subdomain    | Points to        | TTL     |
|-------|-------------------|------------------|---------|
| A     | haatzmaut         | `<EC2_PUBLIC_IP>` | 3600    |

Or if using the IONOS API/panel:
```
A  haatzmaut.lior-clinic.org.  3600  IN  <EC2_PUBLIC_IP>
```

## Step 3: Verify DNS propagation
```bash
dig A haatzmaut.lior-clinic.org +short
# Should return your EC2 IP
```

---

## Server-Side Changes (already on EC2)

### A. Clone the Haatzmaut repo to EC2
```bash
ssh ubuntu@<EC2_IP>
git clone <repo-url> /opt/haatzmaut
cd /opt/haatzmaut
npm ci
node build.mjs --prod
```

### B. Update Private_Clinic Caddyfile
Edit `/home/ubuntu/Private_Clinic/Caddyfile` to add haatzmaut block:

```
{$DOMAIN} {
  tls {$TLS_EMAIL}
  reverse_proxy app:8000
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "SAMEORIGIN"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}

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
```

### C. Update docker-compose.prod.yml
Add volume mount for haatzmaut to the caddy service:

```yaml
  caddy:
    ...
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - /opt/haatzmaut/dist:/srv/haatzmaut:ro   # <-- ADD THIS
      - caddy_data:/data
      - caddy_config:/config
```

### D. Reload Caddy
```bash
cd ~/Private_Clinic
docker compose -f docker-compose.prod.yml up -d caddy
# Or reload in-place:
docker compose -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## Verification

```bash
# Health check
curl -I https://haatzmaut.lior-clinic.org/

# Check Caddy SSL
curl -sI https://haatzmaut.lior-clinic.org/ | grep -i location

# Check DNS
dig A haatzmaut.lior-clinic.org +short
```
