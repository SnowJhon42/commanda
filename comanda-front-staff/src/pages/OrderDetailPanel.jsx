import { sectorClass, sectorLabel } from "../utils/boardMeta";
import { statusLabel } from "../utils/statusLabels";
import { useEffect, useState } from "react";
import { formatArgentinaDateTime, formatArgentinaTime } from "../utils/dateTime";

function badgeClass(status) {
  if (status === "RECEIVED") return "badge badge-received";
  if (status === "IN_PROGRESS") return "badge badge-progress";
  if (status === "DONE") return "badge badge-done";
  if (status === "PARCIAL") return "badge badge-partial";
  if (status === "DELIVERED") return "badge badge-delivered";
  return "badge";
}

function nextStatusForAdmin(item) {
  if (item.sector === "WAITER" && item.status === "RECEIVED") return "DELIVERED";
  if (item.status === "RECEIVED") return "IN_PROGRESS";
  if (item.status === "IN_PROGRESS") return "DONE";
  if (item.status === "DONE") return "DELIVERED";
  return null;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
    value || 0
  );
}

function elapsedLabel(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  return `${hours}h ${remainder}m`;
}

function delayClass(minutes) {
  if (minutes >= 20) return "alert-high";
  if (minutes >= 12) return "alert-medium";
  return "";
}

function billBadgeClass(status) {
  if (status === "CONFIRMED") return "badge badge-delivered";
  if (status === "REPORTED") return "badge badge-done";
  return "badge badge-received";
}

function cashRequestKindLabel(kind) {
  if (kind === "WAITER_CALL") return "Llamado mozo";
  if (kind === "CASH_PAYMENT") return "Solicitud de pago";
  if (kind === "TRANSFER_PAYMENT") return "Solicitud de transferencia";
  if (kind === "POSNET_PAYMENT") return "Solicitud de posnet";
  return "Solicitud";
}

function paymentMethodLabel(method) {
  if (method === "CASH") return "Efectivo";
  if (method === "MERCADO_PAGO") return "Mercado Pago";
  if (method === "MODO") return "MODO";
  if (method === "TRANSFER") return "Transferencia";
  if (method === "CARD") return "Tarjeta";
  return "Otro";
}

function fiscalDocumentStatusLabel(status) {
  if (status === "READY_TO_ISSUE") return "Listo para emitir";
  if (status === "ISSUED") return "Emitido";
  if (status === "ERROR") return "Con error";
  if (status === "CANCELED") return "Anulado";
  return "Borrador";
}

function isDemoFiscalProvider(storeFiscalProfile) {
  return (storeFiscalProfile?.integration_provider || "MANUAL_DEMO") === "MANUAL_DEMO";
}

const FISCAL_TAX_OPTIONS = [
  { value: "CONSUMIDOR_FINAL", label: "Consumidor final" },
  { value: "RESPONSABLE_INSCRIPTO", label: "Responsable inscripto" },
  { value: "MONOTRIBUTISTA", label: "Monotributista" },
  { value: "EXENTO", label: "Exento" },
];

function emptyFiscalForm() {
  return {
    customer_tax_status: "CONSUMIDOR_FINAL",
    customer_document_type: "DNI",
    customer_document_number: "",
    customer_name: "",
    customer_email: "",
  };
}

function emptyFiscalDocumentForm() {
  return {
    status: "READY_TO_ISSUE",
    invoice_number: "",
    cae: "",
    cae_due_date: "",
    last_error: "",
    response_payload_text: "",
  };
}

function isBarPaymentPending(orderDetail) {
  return (
    orderDetail?.review_status === "APPROVED" &&
    orderDetail?.payment_gate === "BEFORE_PREPARATION" &&
    orderDetail?.payment_status !== "CONFIRMED"
  );
}

export function OrderDetailPanel({
  orderDetail,
  selectedOrderId,
  loading,
  error,
  actorSector,
  onRefresh,
  onAdvanceItem,
  advancingKey,
  onCloseTable,
  onForceCloseTable = () => {},
  closingTableCode = "",
  onCreateSplit,
  onConfirmPart,
  onApproveOrder = () => {},
  onRejectOrder = () => {},
  onResolveCashRequest = () => {},
  onPrintPrebill = () => {},
  onSaveFiscalDraft = async () => {},
  onUpdateFiscalDocument = async () => {},
  onIssueFiscalDocument = async () => {},
  billingBusy = false,
  readOnlyReason = "",
}) {
  const [invoiceEditorOpen, setInvoiceEditorOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState(emptyFiscalForm);
  const [fiscalDocumentForm, setFiscalDocumentForm] = useState(emptyFiscalDocumentForm);
  const [invoiceMessage, setInvoiceMessage] = useState("");
  const allDelivered =
    Array.isArray(orderDetail?.items) &&
    orderDetail.items.length > 0 &&
    orderDetail.items.every((item) => item.status === "DELIVERED");
  const isClosingCurrentTable = Boolean(orderDetail?.table_code) && closingTableCode === orderDetail.table_code;
  const reviewPending = orderDetail?.review_status === "PENDING";
  const normalCloseEnabled =
    !orderDetail ||
    Number(orderDetail.total_amount || 0) <= 0 ||
    (orderDetail.bill_split?.status === "CLOSED" && allDelivered);
  const barPaymentPending = isBarPaymentPending(orderDetail);
  const fiscalDraft = orderDetail?.fiscal_invoice_draft || null;
  const storeFiscalProfile = orderDetail?.store_fiscal_profile || null;
  const fiscalDocument = orderDetail?.fiscal_document || null;
  const demoFiscalMode = isDemoFiscalProvider(storeFiscalProfile);
  const issuePanelTitle = demoFiscalMode ? "Datos para demo de factura" : "Datos para factura real";
  const issueToggleLabel = invoiceEditorOpen
    ? demoFiscalMode
      ? "Cerrar demo"
      : "Cerrar factura"
    : demoFiscalMode
      ? "Emitir demo"
      : "Emitir factura real";

  useEffect(() => {
    setInvoiceForm({
      customer_tax_status: fiscalDraft?.customer_tax_status || "CONSUMIDOR_FINAL",
      customer_document_type: fiscalDraft?.customer_document_type || "DNI",
      customer_document_number: fiscalDraft?.customer_document_number || "",
      customer_name: fiscalDraft?.customer_name || "",
      customer_email: fiscalDraft?.customer_email || "",
    });
    setInvoiceMessage("");
  }, [fiscalDraft, orderDetail?.order_id]);

  useEffect(() => {
    setFiscalDocumentForm({
      status: fiscalDocument?.status || "READY_TO_ISSUE",
      invoice_number: fiscalDocument?.invoice_number || "",
      cae: fiscalDocument?.cae || "",
      cae_due_date: fiscalDocument?.cae_due_date ? String(fiscalDocument.cae_due_date).slice(0, 10) : "",
      last_error: fiscalDocument?.last_error || "",
      response_payload_text:
        fiscalDocument?.response_payload && Object.keys(fiscalDocument.response_payload).length
          ? JSON.stringify(fiscalDocument.response_payload, null, 2)
          : "",
    });
  }, [fiscalDocument, orderDetail?.order_id]);

  async function handleSaveFiscalDraft() {
    setInvoiceMessage("");
    await onSaveFiscalDraft({
      requested: true,
      ...invoiceForm,
    });
    setInvoiceMessage("Datos fiscales guardados.");
  }

  async function handleUpdateFiscalDocument() {
    setInvoiceMessage("");
    let parsedPayload = {};
    if (fiscalDocumentForm.response_payload_text.trim()) {
      try {
        parsedPayload = JSON.parse(fiscalDocumentForm.response_payload_text);
      } catch {
        setInvoiceMessage("La respuesta del emisor debe ser JSON válido.");
        return;
      }
    }
    await onUpdateFiscalDocument({
      status: fiscalDocumentForm.status,
      invoice_number: fiscalDocumentForm.invoice_number.trim() || null,
      cae: fiscalDocumentForm.cae.trim() || null,
      cae_due_date: fiscalDocumentForm.cae_due_date ? `${fiscalDocumentForm.cae_due_date}T00:00:00` : null,
      last_error: fiscalDocumentForm.last_error.trim() || null,
      response_payload: parsedPayload,
    });
    setInvoiceMessage("Comprobante interno actualizado.");
  }

  async function handleIssueFiscalDocument() {
    setInvoiceMessage("");
    const result = await onIssueFiscalDocument();
    const provider = result?.provider || "MANUAL_DEMO";
    const message = result?.message || "Comprobante emitido.";
    setInvoiceMessage(`${message} Proveedor: ${provider}.`);
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h3>Detalle de pedido</h3>
        <button className="btn-secondary" onClick={onRefresh} disabled={!selectedOrderId || loading}>
          {loading ? "Cargando..." : "Refrescar detalle"}
        </button>
      </div>

      {!selectedOrderId && <p className="muted">Selecciona un pedido para ver detalle completo.</p>}
      {selectedOrderId && loading && <p className="muted">Cargando detalle...</p>}
      {error && <p className="error-text">{error}</p>}
      {readOnlyReason && <p className="muted operational-banner">{readOnlyReason}</p>}

      {orderDetail && (
        <div className="detail-grid">
          <article className="detail-card">
            <h4>
              Pedido #{orderDetail.order_id} - Mesa {orderDetail.table_code}
            </h4>
            <p className="muted">
              Ticket: {orderDetail.ticket_number} | Estado:{" "}
              <span className={badgeClass(orderDetail.status_aggregated)}>{statusLabel(orderDetail.status_aggregated)}</span>
            </p>
            <p className="muted">
              Comensales: {orderDetail.guest_count} | Entregados: {orderDetail.delivered_items} / {orderDetail.total_items}
            </p>
            <p className="muted">
              Total: {formatMoney(orderDetail.total_amount)} | Mesa abierta: {elapsedLabel(orderDetail.table_elapsed_minutes)} | Pedido actual:{" "}
              {elapsedLabel(orderDetail.order_elapsed_minutes)}
            </p>
            {barPaymentPending && (
              <div className="order-actions">
                <span className="badge badge-received">PAGO PENDIENTE</span>
                <span className="muted">Se puede ver el pedido, pero no avanzar estados hasta confirmar el pago.</span>
              </div>
            )}
            {actorSector === "ADMIN" && (
              <>
                <div className="order-actions">
                {reviewPending && (
                  <>
                    <button className="btn-primary" onClick={() => onApproveOrder(orderDetail.order_id)} disabled={billingBusy}>
                      {billingBusy ? "..." : "Aceptar pedido"}
                    </button>
                    <button className="btn-secondary" onClick={() => onRejectOrder(orderDetail.order_id)} disabled={billingBusy}>
                      {billingBusy ? "..." : "Rechazar pedido"}
                    </button>
                  </>
                )}
                <button className="btn-secondary" onClick={onCloseTable} disabled={isClosingCurrentTable || !normalCloseEnabled}>
                  {isClosingCurrentTable ? "Cerrando..." : "Cerrar mesa"}
                </button>
                <button className="btn-secondary" onClick={onPrintPrebill} disabled={!orderDetail?.items?.length}>
                  Imprimir precuenta
                </button>
                <button className="btn-primary" onClick={() => setInvoiceEditorOpen((current) => !current)} disabled={Boolean(readOnlyReason)}>
                  {issueToggleLabel}
                </button>
                <button className="btn-secondary" onClick={onForceCloseTable} disabled={isClosingCurrentTable}>
                  {isClosingCurrentTable ? "Cerrando..." : "Forzar cierre"}
                </button>
                {!normalCloseEnabled && (
                  <span className="muted">Cerrar mesa requiere pago confirmado y entrega completa.</span>
                )}
                {orderDetail.bill_split?.status === "CLOSED" && (
                  <span className="badge badge-delivered">Pago confirmado</span>
                )}
                </div>
                {invoiceEditorOpen && (
                  <div className="detail-card" style={{ marginTop: 14 }}>
                  <h4>{issuePanelTitle}</h4>
                  <p className="muted">
                    Local emisor: {storeFiscalProfile?.business_name || "Sin razón social"} · {storeFiscalProfile?.tax_status || "RESPONSABLE_INSCRIPTO"}
                  </p>
                  {demoFiscalMode ? (
                    <p className="error-text">MODO DEMO. Todo lo que emitas acá es una simulación interna y no tiene validez fiscal ante ARCA.</p>
                  ) : null}
                  {storeFiscalProfile?.setup_status && storeFiscalProfile.setup_status !== "READY_TO_INTEGRATE" ? (
                    <p className="muted">El perfil fiscal del local todavía no está listo para integrar. Completalo en Mi local antes de marcar un comprobante como emitido.</p>
                  ) : null}
                  <div className="form-grid">
                    <label className="field">
                      Condición fiscal del cliente
                      <select
                        value={invoiceForm.customer_tax_status}
                        onChange={(event) => setInvoiceForm((prev) => ({ ...prev, customer_tax_status: event.target.value }))}
                      >
                        {FISCAL_TAX_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Tipo documento
                      <select
                        value={invoiceForm.customer_document_type}
                        onChange={(event) => setInvoiceForm((prev) => ({ ...prev, customer_document_type: event.target.value }))}
                      >
                        <option value="DNI">DNI</option>
                        <option value="CUIT">CUIT</option>
                      </select>
                    </label>
                    <label className="field">
                      Número
                      <input
                        value={invoiceForm.customer_document_number}
                        onChange={(event) => setInvoiceForm((prev) => ({ ...prev, customer_document_number: event.target.value }))}
                        placeholder="30-12345678-9 o 12345678"
                      />
                    </label>
                    <label className="field">
                      Razón social o nombre
                      <input
                        value={invoiceForm.customer_name}
                        onChange={(event) => setInvoiceForm((prev) => ({ ...prev, customer_name: event.target.value }))}
                        placeholder="Nombre o razón social"
                      />
                    </label>
                    <label className="field field-span-2">
                      Email
                      <input
                        type="email"
                        value={invoiceForm.customer_email}
                        onChange={(event) => setInvoiceForm((prev) => ({ ...prev, customer_email: event.target.value }))}
                        placeholder="cliente@correo.com"
                      />
                    </label>
                  </div>
                  <div className="order-actions">
                    <button className="btn-primary" type="button" onClick={handleSaveFiscalDraft} disabled={billingBusy}>
                      {billingBusy ? "Guardando..." : "Guardar datos fiscales"}
                    </button>
                    <span className="muted">
                      Se emitirá:{" "}
                      <strong>{fiscalDraft?.suggested_invoice_type ? `Factura ${fiscalDraft.suggested_invoice_type} electrónica` : "comprobante a definir"}</strong>
                    </span>
                    {fiscalDraft?.ready_to_issue ? <span className="badge badge-delivered">Listo para emitir</span> : <span className="badge badge-received">Faltan datos</span>}
                  </div>
                  {fiscalDocument ? (
                    <>
                      <div className="order-actions">
                        <span className="muted">
                          Comprobante interno: <strong>{fiscalDocument.document_kind}</strong>
                        </span>
                        <span className={fiscalDocument.status === "READY_TO_ISSUE" || fiscalDocument.status === "ISSUED" ? "badge badge-delivered" : "badge badge-received"}>
                          {fiscalDocument.status === "ISSUED" && demoFiscalMode
                            ? "Emitido DEMO"
                            : fiscalDocumentStatusLabel(fiscalDocument.status)}
                        </span>
                        {fiscalDocument.invoice_type ? <span className="muted">Tipo: {fiscalDocument.invoice_type}</span> : null}
                        {fiscalDocument.point_of_sale ? <span className="muted">PV: {fiscalDocument.point_of_sale}</span> : null}
                        {fiscalDocument.invoice_number ? <span className="muted">Nro: {fiscalDocument.invoice_number}</span> : null}
                      </div>
                      {demoFiscalMode ? <p className="muted">Este comprobante emitido en demo no reemplaza factura A/B/C real y no sirve para credito fiscal.</p> : null}
                      <div className="form-grid" style={{ marginTop: 12 }}>
                        <label className="field">
                          Estado interno
                          <select
                            value={fiscalDocumentForm.status}
                            onChange={(event) => setFiscalDocumentForm((prev) => ({ ...prev, status: event.target.value }))}
                          >
                            <option value="DRAFT">DRAFT</option>
                            <option value="READY_TO_ISSUE">READY_TO_ISSUE</option>
                            <option value="ISSUED">ISSUED</option>
                            <option value="ERROR">ERROR</option>
                            <option value="CANCELED">CANCELED</option>
                          </select>
                        </label>
                        <label className="field">
                          Número comprobante
                          <input
                            value={fiscalDocumentForm.invoice_number}
                            onChange={(event) => setFiscalDocumentForm((prev) => ({ ...prev, invoice_number: event.target.value }))}
                            placeholder="00001-00000042"
                          />
                        </label>
                        <label className="field">
                          CAE
                          <input
                            value={fiscalDocumentForm.cae}
                            onChange={(event) => setFiscalDocumentForm((prev) => ({ ...prev, cae: event.target.value }))}
                            placeholder="12345678901234"
                          />
                        </label>
                        <label className="field">
                          Vencimiento CAE
                          <input
                            type="date"
                            value={fiscalDocumentForm.cae_due_date}
                            onChange={(event) => setFiscalDocumentForm((prev) => ({ ...prev, cae_due_date: event.target.value }))}
                          />
                        </label>
                        <label className="field field-span-2">
                          Error / observación
                          <textarea
                            rows="3"
                            value={fiscalDocumentForm.last_error}
                            onChange={(event) => setFiscalDocumentForm((prev) => ({ ...prev, last_error: event.target.value }))}
                            placeholder="Motivo técnico o fiscal"
                          />
                        </label>
                        <label className="field field-span-2">
                          Respuesta emisor (JSON)
                          <textarea
                            rows="5"
                            value={fiscalDocumentForm.response_payload_text}
                            onChange={(event) => setFiscalDocumentForm((prev) => ({ ...prev, response_payload_text: event.target.value }))}
                            placeholder='{"resultado":"ok"}'
                          />
                        </label>
                      </div>
                      <div className="order-actions">
                        <button className="btn-secondary" type="button" onClick={handleUpdateFiscalDocument} disabled={billingBusy}>
                          {billingBusy ? "Guardando..." : "Actualizar comprobante interno"}
                        </button>
                        <button className="btn-primary" type="button" onClick={handleIssueFiscalDocument} disabled={billingBusy}>
                          {billingBusy ? "Emitiendo..." : demoFiscalMode ? "Emitir DEMO" : "Emitir por proveedor"}
                        </button>
                        <span className="muted">Para `ISSUED` ahora exigimos número, CAE y vencimiento de CAE.</span>
                      </div>
                      <p className="muted">
                        Proveedor actual del local: <strong>{storeFiscalProfile?.integration_provider || "MANUAL_DEMO"}</strong>.
                        {demoFiscalMode ? " Sin validez fiscal." : ""}
                      </p>
                    </>
                  ) : null}
                  {invoiceMessage ? <p className="success-text">{invoiceMessage}</p> : null}
                  {fiscalDraft?.customer_email ? <p className="muted">Email actual de envío: {fiscalDraft.customer_email}</p> : null}
                  </div>
                )}
              </>
            )}
          </article>

          <article className="detail-card">
            <h4>Atrasos por sector</h4>
            {orderDetail.delays.length === 0 ? (
              <p className="muted">Sin atrasos.</p>
            ) : (
              <div className="sector-list">
                {orderDetail.delays.map((delay) => (
                  <div className={`sector-row ${delayClass(delay.oldest_waiting_minutes)}`} key={delay.sector}>
                    <span className={sectorClass(delay.sector)}>{sectorLabel(delay.sector)}</span>
                    <span className="muted">{delay.waiting_items} esperando</span>
                    <span className="muted">{delay.oldest_waiting_minutes} min</span>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="detail-card">
            <h4>Items por sector</h4>
            <div className="sector-list">
              {orderDetail.items.map((item) => {
                const rowItemId = item.item_id ?? item.id;
                const next = actorSector === "ADMIN" ? nextStatusForAdmin(item) : null;
                const key = `${rowItemId}:${next || ""}`;
                return (
                  <div className="sector-row" key={rowItemId}>
                    <div className="row-main-wrap">
                      <span className="row-main">
                        {item.qty}x {item.item_name}
                        <span className={sectorClass(item.sector)}>{sectorLabel(item.sector)}</span>
                        <span className="muted">c/u {formatMoney(item.unit_price || 0)}</span>
                      </span>
                      {item.notes ? <span className="row-note row-note-strong">Aclaracion: {item.notes}</span> : null}
                    </div>
                    <span className={badgeClass(item.status)}>{statusLabel(item.status)}</span>
                    {next ? (
                      <button
                        className="btn-primary"
                        disabled={reviewPending || barPaymentPending || advancingKey === key || Boolean(readOnlyReason)}
                        onClick={() =>
                          onAdvanceItem({
                            itemId: rowItemId,
                            currentStatus: item.status,
                            itemSector: item.sector,
                          })
                        }
                      >
                        {reviewPending ? "Esperando aprobacion" : barPaymentPending ? "Esperando pago" : advancingKey === key ? "..." : `Pasar a ${next}`}
                      </button>
                    ) : (
                      <span className="muted">{formatArgentinaTime(item.updated_at)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </article>

          <article className="detail-card">
            <h4>Historial de cambios</h4>
            {!orderDetail.events || orderDetail.events.length === 0 ? (
              <p className="muted">Sin eventos de estado todavia.</p>
            ) : (
              <ul className="detail-items">
                {orderDetail.events.slice(0, 30).map((event) => (
                  <li key={event.id}>
                    Item #{event.item_id} ({event.sector}): {event.from_status ? statusLabel(event.from_status) : "-"} {"->"} {statusLabel(event.to_status)}
                    {" | "}
                    <span className="muted">{formatArgentinaDateTime(event.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="detail-card">
            <h4>Division de cuenta</h4>
            {!orderDetail.bill_split ? (
              actorSector === "ADMIN" ? (
                <button className="btn-primary" onClick={onCreateSplit} disabled={billingBusy}>
                  {billingBusy ? "Creando..." : "Crear division (partes iguales)"}
                </button>
              ) : (
                <p className="muted">Sin division creada.</p>
              )
            ) : (
              <div className="sector-list">
                <div className="sector-row">
                  <span>Estado</span>
                  <span className="muted">{orderDetail.bill_split.status}</span>
                  <span className="muted">Total {formatMoney(orderDetail.bill_split.total_amount)}</span>
                </div>
                {orderDetail.bill_split.parts.map((part) => (
                  <div className="sector-row" key={part.id}>
                    <span>
                      {part.label} - {formatMoney(part.amount)}
                      {part.reported_by ? ` (${part.reported_by})` : ""}
                      {part.payment_method ? ` · ${paymentMethodLabel(part.payment_method)}` : ""}
                    </span>
                    <span className={billBadgeClass(part.payment_status)}>{part.payment_status}</span>
                    {actorSector === "ADMIN" && part.payment_status === "REPORTED" ? (
                      <button className="btn-primary" onClick={() => onConfirmPart(part.id)} disabled={billingBusy}>
                        {billingBusy ? "..." : "Confirmar"}
                      </button>
                    ) : (
                      <span className="muted">
                        {part.confirmed_at
                          ? formatArgentinaTime(part.confirmed_at)
                          : part.reported_at
                            ? formatArgentinaTime(part.reported_at)
                            : "-"}
                      </span>
                    )}
                  </div>
                ))}
                {actorSector === "ADMIN" && orderDetail.bill_split.status === "CLOSED" && (
                  <div className="order-actions">
                    <button className="btn-primary" onClick={onCloseTable} disabled={isClosingCurrentTable}>
                      {isClosingCurrentTable ? "Cerrando..." : "Cerrar mesa y finalizar"}
                    </button>
                    <button className="btn-secondary" onClick={onForceCloseTable} disabled={isClosingCurrentTable}>
                      {isClosingCurrentTable ? "Cerrando..." : "Forzar cierre"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>

          <article className="detail-card">
            <h4>Solicitudes de mozo / pago</h4>
            {!orderDetail.cash_requests || orderDetail.cash_requests.length === 0 ? (
              <p className="muted">Sin solicitudes activas.</p>
            ) : (
              <div className="sector-list">
                {orderDetail.cash_requests.map((req) => (
                  <div className="sector-row" key={req.id}>
                    <span>
                      {cashRequestKindLabel(req.request_kind)}: {req.payer_label} {req.note ? `- ${req.note}` : ""}
                    </span>
                    <span className={billBadgeClass(req.status === "RESOLVED" ? "CONFIRMED" : "PENDING")}>
                      {req.status === "RESOLVED" ? "TOMADO" : "PENDIENTE"}
                    </span>
                    {req.status === "PENDING" && (actorSector === "ADMIN" || actorSector === "WAITER") ? (
                      <button className="btn-primary" onClick={() => onResolveCashRequest(req.id)} disabled={billingBusy || Boolean(readOnlyReason)}>
                        {billingBusy ? "..." : "Marcar atendido"}
                      </button>
                    ) : (
                      <span className="muted">
                        {req.resolved_at ? formatArgentinaTime(req.resolved_at) : "-"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}

export default OrderDetailPanel;
