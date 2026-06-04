# scheduling

NestJS service responsible for appointment scheduling within HealthSync.

Exposes `GET /health` → `{"status": "ok", "service": "scheduling"}`.

## Run locally

```bash
pnpm install --ignore-scripts
pnpm build
node dist/main
```

Health check:

```bash
curl http://localhost:3000/health
```

## Run with Docker

```bash
docker build -t healthsync-scheduling .
docker run --rm -p 3000:3000 healthsync-scheduling
```
