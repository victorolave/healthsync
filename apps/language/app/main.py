from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title="HealthSync Language Service")


class InterpretRequest(BaseModel):
    message: str


class IntentResponse(BaseModel):
    intent: dict
    confidence: float


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "language"}


@app.post("/interpret", response_model=IntentResponse)
async def interpret(body: InterpretRequest) -> IntentResponse:
    return IntentResponse(
        intent={"kind": "DELAY", "params": {"minutes": 15}},
        confidence=1.0,
    )
