from uuid import uuid4
from pathlib import Path
from urllib.parse import urlparse
import json

import http.client
from fastapi import HTTPException, UploadFile

from app.core.config import settings

MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024


def upload_menu_image_to_r2(file: UploadFile) -> str:
    if not all(
        [settings.cloudflare_account_id, settings.cloudflare_r2_bucket, settings.cloudflare_api_token]
    ):
        raise HTTPException(status_code=500, detail="Cloudflare R2 no está configurado")

    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen válida")

    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(content) > MAX_IMAGE_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="La imagen excede el límite de 5MB")

    extension = Path(file.filename or "upload").suffix or ".jpg"
    key = f"menu/{uuid4().hex}{extension}"
    upload_url = (
        f"https://api.cloudflare.com/client/v4/accounts/{settings.cloudflare_account_id}"
        f"/r2/buckets/{settings.cloudflare_r2_bucket}/objects/{key}"
    )
    parsed = urlparse(upload_url)
    conn = http.client.HTTPSConnection(parsed.hostname, parsed.port or 443, timeout=30)
    headers = {
        "Authorization": f"Bearer {settings.cloudflare_api_token}",
        "Content-Type": content_type,
    }

    try:
        conn.request("PUT", parsed.path, body=content, headers=headers)
        response = conn.getresponse()
        raw_body = response.read()
        if response.status not in (200, 201):
            detail = "Error subiendo la imagen a Cloudflare"
            if raw_body:
                try:
                    payload = json.loads(raw_body.decode("utf-8", errors="ignore"))
                    first_error = (payload.get("errors") or [{}])[0].get("message")
                    if first_error:
                        detail = f"{detail}: {first_error}"
                except Exception:
                    pass
            raise HTTPException(status_code=502, detail=detail)
    except OSError as exc:
        raise HTTPException(status_code=503, detail="No se pudo conectar con Cloudflare") from exc
    finally:
        conn.close()

    public_host = settings.cloudflare_public_host.rstrip("/")
    return f"{public_host}/{key}"
