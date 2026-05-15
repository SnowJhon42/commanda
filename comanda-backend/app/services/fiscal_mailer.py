import logging
import smtplib
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import FiscalDocument, Order, Store

logger = logging.getLogger(__name__)


@dataclass
class FiscalMailResult:
    mode: str
    delivered: bool
    message: str


def mail_transport_mode() -> str:
    return "SMTP" if settings.smtp_host and settings.smtp_from_email else "SIMULATED"


def _build_subject(document: FiscalDocument) -> str:
    invoice_type = document.invoice_type or "Comprobante"
    invoice_number = document.invoice_number or "sin numero"
    return f"{invoice_type} {invoice_number}"


def _build_body(store: Store, order: Order, document: FiscalDocument) -> str:
    return (
        f"Local: {store.fiscal_business_name or store.name}\n"
        f"Pedido: #{order.id}\n"
        f"Ticket: {order.ticket_number}\n"
        f"Tipo: {document.invoice_type or '-'}\n"
        f"Numero: {document.invoice_number or '-'}\n"
        f"CAE: {document.cae or '-'}\n"
        f"Emitido: {document.issued_at.isoformat() if document.issued_at else '-'}\n"
        f"Modo: {'DEMO' if (store.fiscal_integration_provider or 'MANUAL_DEMO') == 'MANUAL_DEMO' else 'REAL'}\n"
    )


def _mark_email_sent(db: Session, document: FiscalDocument) -> None:
    document.email_delivery_status = "SENT"
    document.email_send_count = int(document.email_send_count or 0) + 1
    document.email_last_sent_at = datetime.utcnow()
    document.email_last_error = None
    db.add(document)
    db.flush()


def _mark_email_error(db: Session, document: FiscalDocument, error_message: str) -> None:
    document.email_delivery_status = "ERROR"
    document.email_last_error = error_message
    db.add(document)
    db.flush()


def send_fiscal_document_email(db: Session, *, store: Store, order: Order, document: FiscalDocument, recipient_email: str) -> FiscalMailResult:
    target_email = str(recipient_email or "").strip().lower()
    if not target_email:
        raise ValueError("Missing recipient email")

    subject = _build_subject(document)
    body = _build_body(store, order, document)

    if not settings.smtp_host or not settings.smtp_from_email:
        logger.info("Fiscal mail simulated to %s | %s", target_email, subject)
        _mark_email_sent(db, document)
        return FiscalMailResult(
            mode="SIMULATED",
            delivered=False,
            message=f"Mail simulado para {target_email}. No hay SMTP configurado.",
        )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = target_email
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except Exception as exc:
        _mark_email_error(db, document, str(exc))
        return FiscalMailResult(mode="SMTP", delivered=False, message=f"No se pudo enviar el mail: {exc}")

    _mark_email_sent(db, document)
    return FiscalMailResult(mode="SMTP", delivered=True, message=f"Mail enviado a {target_email}.")
