import asyncio
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.api.deps import TableClientContext, get_current_staff, get_current_table_client
from app.db.models import StaffAccount
from app.services.realtime import event_bus

router = APIRouter(prefix="/events", tags=["events"])


def _sse_frame(*, event_id: int, event_name: str, payload: dict) -> str:
    return f"id: {event_id}\nevent: {event_name}\ndata: {json.dumps(payload)}\n\n"


@router.get("/orders/{order_id}/stream")
async def stream_order_events(
    order_id: int,
    request: Request,
    after: int | None = None,
    table_client: TableClientContext = Depends(get_current_table_client),
) -> StreamingResponse:
    async def gen():
        cursor = after if after is not None else event_bus.latest_seq()

        while True:
            if await request.is_disconnected():
                break

            events = event_bus.after(cursor)
            sent = False
            for event in events:
                cursor = event["seq"]
                payload = event["payload"]
                if payload.get("order_id") != order_id:
                    continue
                if payload.get("table_session_id") != table_client.table_session_id:
                    continue
                sent = True
                yield _sse_frame(event_id=event["seq"], event_name=event["type"], payload=payload)

            if not sent:
                yield ": keepalive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/items/stream")
async def stream_item_events(
    store_id: int,
    request: Request,
    sector: str | None = None,
    after: int | None = None,
    current_staff: StaffAccount = Depends(get_current_staff),
) -> StreamingResponse:
    if current_staff.store_id != store_id:
        raise HTTPException(status_code=403, detail="Cross-store access is not allowed")
    if current_staff.sector != "ADMIN" and sector and sector != current_staff.sector:
        raise HTTPException(status_code=403, detail="Forbidden sector")

    async def gen():
        cursor = after if after is not None else event_bus.latest_seq()

        while True:
            if await request.is_disconnected():
                break

            events = event_bus.after(cursor)
            sent = False
            for event in events:
                cursor = event["seq"]
                payload = event["payload"]
                if payload.get("store_id") != store_id:
                    continue
                if sector and sector != "ADMIN":
                    item_sector = payload.get("item_sector")
                    if item_sector is not None and item_sector != sector:
                        # WAITER also needs to react to DONE from KITCHEN/BAR.
                        if not (sector == "WAITER" and payload.get("item_status") == "DONE"):
                            continue
                sent = True
                yield _sse_frame(event_id=event["seq"], event_name=event["type"], payload=payload)

            if not sent:
                yield ": keepalive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/table-session/{table_session_id}/stream")
async def stream_table_session_events(
    table_session_id: int,
    request: Request,
    after: int | None = None,
    table_client: TableClientContext = Depends(get_current_table_client),
) -> StreamingResponse:
    if table_client.table_session_id != table_session_id:
        raise HTTPException(status_code=403, detail="Table session token does not match this session")

    async def gen():
        cursor = after if after is not None else event_bus.latest_seq()

        while True:
            if await request.is_disconnected():
                break

            events = event_bus.after(cursor)
            sent = False
            for event in events:
                cursor = event["seq"]
                payload = event["payload"]
                if payload.get("table_session_id") != table_session_id:
                    continue
                sent = True
                yield _sse_frame(event_id=event["seq"], event_name=event["type"], payload=payload)

            if not sent:
                yield ": keepalive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")
