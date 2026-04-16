from __future__ import annotations

import json
import http.client
from typing import Any

from fastapi import HTTPException

from app.core.config import settings

THEME_PRESETS = {"CLASSIC", "MODERN", "PREMIUM"}
ACCENT_COLORS = {"ROJO", "VERDE", "DORADO", "AZUL", "NEGRO"}


def _theme_suggestion_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "theme_preset": {"type": "string", "enum": sorted(THEME_PRESETS)},
            "accent_color": {"type": "string", "enum": sorted(ACCENT_COLORS)},
            "show_watermark_logo": {"type": "boolean"},
            "reason": {"type": "string"},
        },
        "required": ["theme_preset", "accent_color", "show_watermark_logo", "reason"],
    }


def _extract_response_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    for output in payload.get("output", []):
        for content in output.get("content", []):
            if content.get("type") in {"output_text", "text"} and isinstance(content.get("text"), str):
                return content["text"]
    raise HTTPException(status_code=502, detail="OpenAI no devolvio texto interpretable.")


def suggest_store_theme(*, restaurant_name: str, logo_url: str | None, cover_image_url: str | None) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Falta OPENAI_API_KEY para sugerir estilo con IA.")

    system_prompt = (
        "Sos director de arte para menus digitales de restaurantes. "
        "Solo podes elegir dentro de presets cerrados para no romper la UI. "
        "CLASSIC es claro y sobrio, MODERN es visual y contrastado, PREMIUM es elegante y nocturno. "
        "Elegí un color de acento entre ROJO, VERDE, DORADO, AZUL o NEGRO. "
        "No devuelvas CSS ni valores libres."
    )
    user_prompt = (
        f"Restaurante: {restaurant_name}\n"
        f"Logo URL: {logo_url or '-'}\n"
        f"Portada URL: {cover_image_url or '-'}\n\n"
        "Sugerí preset, color y si conviene usar el logo como marca de agua."
    )

    body = json.dumps(
        {
            "model": settings.openai_model,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
                {"role": "user", "content": [{"type": "input_text", "text": user_prompt}]},
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "store_theme_suggestion",
                    "schema": _theme_suggestion_schema(),
                    "strict": True,
                }
            },
        }
    )

    conn = http.client.HTTPSConnection("api.openai.com", timeout=45)
    try:
        conn.request(
            "POST",
            "/v1/responses",
            body=body.encode("utf-8"),
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
        )
        response = conn.getresponse()
        raw = response.read().decode("utf-8", errors="ignore")
    finally:
        conn.close()

    if response.status >= 400:
        raise HTTPException(status_code=502, detail=f"OpenAI no pudo sugerir estilo: {raw[:400]}")

    try:
        suggestion = json.loads(_extract_response_text(json.loads(raw)))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="OpenAI devolvio un JSON invalido.") from exc

    if suggestion.get("theme_preset") not in THEME_PRESETS or suggestion.get("accent_color") not in ACCENT_COLORS:
        raise HTTPException(status_code=502, detail="OpenAI devolvio una opcion de estilo no permitida.")
    return suggestion
