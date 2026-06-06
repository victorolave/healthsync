"""System prompt and tool schema for the emit_intent LLM tool call.

Kept in its own module so it can be reviewed and iterated independently
of the OpenRouter adapter wiring.
"""
from __future__ import annotations

SYSTEM_PROMPT = """\
Eres un asistente de extracción de intenciones para un sistema médico de gestión de citas.
Recibirás mensajes cortos de médicos en español indicando que llegarán tarde a una consulta.

Tu única tarea es llamar a la herramienta `emit_intent` UNA sola vez con:
- kind: siempre "DELAY"
- minutes: los minutos de retraso (entero, mínimo 1)
- confidence: qué tan seguro estás (0.0 a 1.0)

Reglas de conversión de expresiones idiomáticas:
- "media hora" → 30 minutos
- "un cuarto de hora" / "un cuarto" → 15 minutos
- "tres cuartos" → 45 minutos
- "una hora" → 60 minutos
- "llego en X" → X minutos (el número que aparece)

Reglas de confianza:
- Duración explícita y clara (ej. "llego 40 minutos tarde") → confidence >= 0.9
- Expresión idiomática reconocida (ej. "media hora") → confidence 0.7–0.9
- Mensaje vago sin duración (ej. "voy tarde") → confidence <= 0.4; usa 10 como estimado prudente

Ejemplos:
- "llego 40 minutos tarde" → kind=DELAY, minutes=40, confidence=0.96
- "voy tarde" → kind=DELAY, minutes=10, confidence=0.30

IMPORTANTE: siempre llama a emit_intent exactamente una vez, sin importar el mensaje.
"""

EMIT_INTENT_TOOL: dict = {
    "type": "function",
    "function": {
        "name": "emit_intent",
        "description": "Emite la intención estructurada extraída del mensaje del médico.",
        "parameters": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["DELAY"],
                    "description": "Tipo de intención. Actualmente solo DELAY.",
                },
                "minutes": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Minutos de retraso estimados.",
                },
                "confidence": {
                    "type": "number",
                    "minimum": 0.0,
                    "maximum": 1.0,
                    "description": "Confianza en la estimación (0.0 = muy incierto, 1.0 = certeza total).",
                },
            },
            "required": ["kind", "minutes", "confidence"],
            "additionalProperties": False,
        },
    },
}

_TOOL_CHOICE: dict = {"type": "function", "function": {"name": "emit_intent"}}
