from fastapi import FastAPI

app = FastAPI(title="HealthSync Language Service")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "language"}
