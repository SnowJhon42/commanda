import json
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import FiscalDocument, Order, Store


@dataclass
class FiscalIssueResult:
    provider: str
    mode: str
    fiscal_valid: bool
    message: str
    document: FiscalDocument


def _demo_invoice_number(db: Session, store_id: int, point_of_sale: str | None) -> str:
    issued_count = (
        db.scalar(
            select(func.count())
            .select_from(FiscalDocument)
            .where(
                FiscalDocument.store_id == store_id,
                FiscalDocument.status == "ISSUED",
            )
        )
        or 0
    )
    pv = str(point_of_sale or "00000").zfill(5)
    return f"{pv}-DEMO{str(int(issued_count) + 1).zfill(6)}"


def _demo_cae(store_id: int, order_id: int) -> str:
    seed = f"{store_id:04d}{order_id:06d}{int(datetime.utcnow().timestamp())}"
    return seed[-14:].rjust(14, "0")


def issue_document(db: Session, *, store: Store, order: Order, document: FiscalDocument) -> FiscalIssueResult:
    provider = (store.fiscal_integration_provider or "MANUAL_DEMO").strip().upper()

    if provider != "MANUAL_DEMO":
        raise ValueError(f"Provider {provider} not implemented yet")

    document.status = "ISSUED"
    document.invoice_number = document.invoice_number or _demo_invoice_number(db, store.id, store.fiscal_point_of_sale)
    document.cae = document.cae or _demo_cae(store.id, order.id)
    document.cae_due_date = document.cae_due_date or (datetime.utcnow() + timedelta(days=10))
    document.issued_at = document.issued_at or datetime.utcnow()
    document.canceled_at = None
    document.last_error = None
    document.response_payload_json = json.dumps(
        {
            "provider": "MANUAL_DEMO",
            "mode": "DEMO",
            "fiscal_valid": False,
            "message": "Emision simulada interna. No valida ante ARCA.",
            "issued_at": document.issued_at.isoformat() if document.issued_at else None,
        },
        ensure_ascii=True,
    )
    db.add(document)
    db.flush()
    return FiscalIssueResult(
        provider="MANUAL_DEMO",
        mode="DEMO",
        fiscal_valid=False,
        message="Emision simulada interna. No valida ante ARCA.",
        document=document,
    )
