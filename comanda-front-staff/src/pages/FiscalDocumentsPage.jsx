"use client";

import { useMemo, useState } from "react";
import { formatArgentinaDateTime } from "../utils/dateTime";

const STATUS_OPTIONS = ["", "DRAFT", "READY_TO_ISSUE", "ISSUED", "ERROR", "CANCELED"];

function statusLabel(status) {
  if (status === "READY_TO_ISSUE") return "Listo para emitir";
  if (status === "ISSUED") return "Emitido";
  if (status === "ERROR") return "Error";
  if (status === "CANCELED") return "Anulado";
  return "Borrador";
}

function providerLabel(provider) {
  if (provider === "MANUAL_DEMO") return "Demo interno";
  if (provider === "ARCA_DIRECT") return "ARCA directa";
  if (provider === "EXTERNAL_API") return "API externa";
  return provider || "-";
}

export function FiscalDocumentsPage({
  history,
  loading = false,
  filter = "",
  mailConfig = null,
  onFilterChange = () => {},
  onRefresh = () => {},
  onOpenOrder = () => {},
  onResendEmail = async () => {},
}) {
  const rows = useMemo(() => history?.items || [], [history]);
  const total = history?.total || 0;

  return (
    <section className="ops-panel">
      <div className="section-head">
        <div>
          <h3>Historial fiscal</h3>
          <p className="muted">Comprobantes internos y emitidos, con proveedor, estado y trazabilidad.</p>
        </div>
        <button className="btn-secondary" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      <div className="order-actions" style={{ marginBottom: 16 }}>
        <label className="field" style={{ minWidth: 220 }}>
          Estado
          <select value={filter} onChange={(event) => onFilterChange(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option || "ALL"} value={option}>
                {option ? statusLabel(option) : "Todos"}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">Total: {total}</span>
      </div>
      <div className="detail-card" style={{ marginBottom: 16 }}>
        <p className="muted">
          Mail fiscal: <strong>{mailConfig?.mode || "SIMULATED"}</strong>
          {mailConfig?.smtp_configured ? ` · ${mailConfig.from_email || "-"} · ${mailConfig.host || "-"}` : " · sin SMTP real configurado"}
        </p>
      </div>

      {!rows.length ? (
        <div className="detail-card">
          <p className="muted">No hay comprobantes para este filtro.</p>
        </div>
      ) : (
        <div className="detail-items">
          {rows.map((item) => (
            <article key={item.document_id} className="detail-card" style={{ marginBottom: 12 }}>
              <div className="section-head">
                <div>
                  <h4>
                    Pedido #{item.order_id} · Mesa {item.table_code || "-"}
                  </h4>
                  <p className="muted">
                    {statusLabel(item.status)} · {providerLabel(item.provider)} · {item.fiscal_valid ? "Validez fiscal" : "Sin validez fiscal"}
                  </p>
                </div>
                <div className="order-actions">
                  <button className="btn-secondary" type="button" onClick={() => onOpenOrder(item.order_id)}>
                    Ver pedido
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => onResendEmail(item.order_id)}>
                    Reenviar mail
                  </button>
                </div>
              </div>
              <div className="sector-list">
                <div className="sector-row">
                  <span>Tipo</span>
                  <span className="muted">{item.invoice_type || "-"}</span>
                </div>
                <div className="sector-row">
                  <span>Número</span>
                  <span className="muted">{item.invoice_number || "-"}</span>
                </div>
                <div className="sector-row">
                  <span>CAE</span>
                  <span className="muted">{item.cae || "-"}</span>
                </div>
                <div className="sector-row">
                  <span>Cliente</span>
                  <span className="muted">{item.customer_name || "-"}{item.customer_email ? ` · ${item.customer_email}` : ""}</span>
                </div>
                <div className="sector-row">
                  <span>Actualizado</span>
                  <span className="muted">{formatArgentinaDateTime(item.updated_at)}</span>
                </div>
                <div className="sector-row">
                  <span>Emitido</span>
                  <span className="muted">{item.issued_at ? formatArgentinaDateTime(item.issued_at) : "-"}</span>
                </div>
                <div className="sector-row">
                  <span>Mail</span>
                  <span className="muted">
                    {item.email_delivery_status || "PENDING"}
                    {item.email_send_count ? ` · envíos: ${item.email_send_count}` : ""}
                    {item.email_last_sent_at ? ` · último: ${formatArgentinaDateTime(item.email_last_sent_at)}` : ""}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
