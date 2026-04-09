from __future__ import annotations

import base64
import csv
import http.client
import json
import re
import zipfile
from html import unescape
from io import BytesIO, StringIO
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from fastapi import HTTPException

from app.core.config import settings


ALLOWED_EXTENSIONS = {".csv", ".txt", ".tsv", ".xlsx", ".docx", ".pdf", ".jpg", ".jpeg", ".png", ".webp"}
VISION_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
MAX_IMPORT_BYTES = 8 * 1024 * 1024


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def _extract_csv_text(content: bytes, suffix: str) -> str:
    raw = _decode_text(content)
    delimiter = "\t" if suffix == ".tsv" else None
    if delimiter:
        return raw

    sample = raw[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        return raw

    rows = csv.reader(StringIO(raw), dialect)
    return "\n".join("\t".join(cell.strip() for cell in row) for row in rows)


def _xlsx_column_index(cell_ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    total = 0
    for letter in letters:
        total = total * 26 + (ord(letter) - ord("A") + 1)
    return max(0, total - 1)


def _xlsx_cell_text(cell: ElementTree.Element, shared_strings: list[str], ns: dict[str, str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return " ".join(node.text or "" for node in cell.findall(".//main:t", ns)).strip()
    value_node = cell.find("main:v", ns)
    value = value_node.text if value_node is not None else ""
    if cell_type == "s" and value.isdigit():
        index = int(value)
        return shared_strings[index] if 0 <= index < len(shared_strings) else ""
    return value.strip()


def _extract_xlsx_text(content: bytes) -> str:
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            shared_strings: list[str] = []
            if "xl/sharedStrings.xml" in archive.namelist():
                shared_root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
                for item in shared_root.findall(".//main:si", ns):
                    shared_strings.append(" ".join(node.text or "" for node in item.findall(".//main:t", ns)).strip())

            sheet_names = sorted(name for name in archive.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", name))
            output: list[str] = []
            for sheet_index, sheet_name in enumerate(sheet_names, start=1):
                root = ElementTree.fromstring(archive.read(sheet_name))
                output.append(f"--- Hoja {sheet_index} ---")
                for row in root.findall(".//main:sheetData/main:row", ns):
                    cells: list[str] = []
                    for cell in row.findall("main:c", ns):
                        column_index = _xlsx_column_index(cell.attrib.get("r", ""))
                        while len(cells) < column_index:
                            cells.append("")
                        cells.append(_xlsx_cell_text(cell, shared_strings, ns))
                    if any(cell.strip() for cell in cells):
                        output.append("\t".join(cells))
            return "\n".join(output)
    except (KeyError, zipfile.BadZipFile, ElementTree.ParseError) as exc:
        raise HTTPException(status_code=422, detail="No se pudo leer el Excel.") from exc


def _extract_docx_text(content: bytes) -> str:
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as exc:
        raise HTTPException(status_code=422, detail="No se pudo leer el Word.") from exc

    text = re.sub(r"</w:p[^>]*>", "\n", xml.decode("utf-8", errors="ignore"))
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(text).strip()


def extract_menu_file_text(filename: str, content: bytes) -> tuple[str, str]:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Formato no soportado. Usá Excel, CSV, Word, PDF o imagen.")
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 8MB.")

    if suffix in {".csv", ".txt", ".tsv"}:
        return _extract_csv_text(content, suffix), suffix.removeprefix(".")
    if suffix == ".xlsx":
        return _extract_xlsx_text(content), "xlsx"
    if suffix == ".docx":
        return _extract_docx_text(content), "docx"
    return "", suffix.removeprefix(".")


def _menu_import_schema() -> dict[str, Any]:
    item_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "row_id": {"type": "string"},
            "category_name": {"type": ["string", "null"]},
            "name": {"type": "string"},
            "description": {"type": ["string", "null"]},
            "base_price": {"type": ["number", "null"]},
            "fulfillment_sector": {"type": "string", "enum": ["KITCHEN", "BAR", "WAITER"]},
            "image_url": {"type": ["string", "null"]},
            "active": {"type": "boolean"},
            "confidence": {"type": "number"},
            "warnings": {"type": "array", "items": {"type": "string"}},
            "errors": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "row_id",
            "category_name",
            "name",
            "description",
            "base_price",
            "fulfillment_sector",
            "image_url",
            "active",
            "confidence",
            "warnings",
            "errors",
        ],
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "items": {"type": "array", "items": item_schema},
            "warnings": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["items", "warnings"],
    }


def _extract_response_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    for output in payload.get("output", []):
        for content in output.get("content", []):
            if content.get("type") in {"output_text", "text"} and isinstance(content.get("text"), str):
                return content["text"]
    raise HTTPException(status_code=502, detail="OpenAI no devolvió texto interpretable.")


def _call_openai_menu_reader(
    *,
    filename: str,
    content: bytes,
    extracted_text: str,
    source_kind: str,
) -> dict[str, Any]:
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Falta OPENAI_API_KEY para usar el lector inteligente.")

    system_prompt = (
        "Sos un lector de cartas de restaurante para COMANDA. Interpretá el archivo y devolvé solo productos reales. "
        "No inventes precios ni productos. Si un precio es dudoso, dejalo null y agregá error. "
        "Usá KITCHEN para comida, BAR para bebidas y WAITER solo para servicios o productos atendidos por mozo. "
        "Mantené revisión humana: agregá warnings cuando haya baja confianza, duplicados probables o datos ambiguos."
    )

    user_content: list[dict[str, Any]] = [
        {
            "type": "input_text",
            "text": (
                f"Archivo: {filename}\nTipo: {source_kind}\n\n"
                "Convertí esta carta en un borrador de menú COMANDA con categorías, productos, precios y sectores.\n\n"
                f"{extracted_text[:45000]}"
            ),
        }
    ]

    if not extracted_text and Path(filename).suffix.lower() in VISION_EXTENSIONS:
        suffix = Path(filename).suffix.lower()
        mime = "application/pdf" if suffix == ".pdf" else f"image/{'jpeg' if suffix in {'.jpg', '.jpeg'} else suffix.removeprefix('.')}"
        encoded = base64.b64encode(content).decode("ascii")
        if suffix == ".pdf":
            user_content.append(
                {
                    "type": "input_file",
                    "filename": filename,
                    "file_data": f"data:{mime};base64,{encoded}",
                }
            )
        else:
            user_content.append({"type": "input_image", "image_url": f"data:{mime};base64,{encoded}"})

    body = json.dumps(
        {
            "model": settings.openai_model,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
                {"role": "user", "content": user_content},
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "menu_import_preview",
                    "schema": _menu_import_schema(),
                    "strict": True,
                }
            },
        }
    )

    conn = http.client.HTTPSConnection("api.openai.com", timeout=60)
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
        raise HTTPException(status_code=502, detail=f"OpenAI no pudo interpretar la carta: {raw[:400]}")

    try:
        payload = json.loads(raw)
        return json.loads(_extract_response_text(payload))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="OpenAI devolvió un JSON inválido.") from exc


def build_menu_import_preview(*, filename: str, content: bytes) -> tuple[str, dict[str, Any]]:
    extracted_text, source_kind = extract_menu_file_text(filename, content)
    if not extracted_text and Path(filename).suffix.lower() not in VISION_EXTENSIONS:
        raise HTTPException(status_code=422, detail="No se pudo extraer texto del archivo.")
    return source_kind, _call_openai_menu_reader(
        filename=filename,
        content=content,
        extracted_text=extracted_text,
        source_kind=source_kind,
    )
