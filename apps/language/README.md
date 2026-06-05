# language

FastAPI service responsible for natural-language understanding within HealthSync.

Exposes `GET /health` → `{"status": "ok", "service": "language"}`.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install .
uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

## Run with Docker

```bash
docker build -t healthsync-language .
docker run --rm -p 8000:8000 healthsync-language
```
