# web

React + Vite + TypeScript frontend for HealthSync.

Dev server runs on port 5173.

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Run with Docker

```bash
docker build -t healthsync-web .
docker run --rm -p 5173:5173 healthsync-web
```
