import { sectorClass, sectorLabel } from "../utils/boardMeta";
import { statusLabel } from "../utils/statusLabels";

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
  return "Solicitud";
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
  closingTable = false,
  onCreateSplit,
  onConfirmPart,
  onResolveCashRequest = () => {},
  billingBusy = false,
}) {
  const allDelivered =
    Array.isArray(orderDetail?.items) &&
    orderDetail.items.length > 0 &&
    orderDetail.items.every((item) => item.status === "DELIVERED");
  const normalCloseEnabled =
    !orderDetail ||
    Number(orderDetail.total_amount || 0) <= 0 ||
    (orderDetail.bill_split?.status === "CLOSED" && allDelivered);

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
            {actorSector === "ADMIN" && (
              <div className="order-actions">
                <button className="btn-secondary" onClick={onCloseTable} disabled={closingTable || !normalCloseEnabled}>
                  {closingTable ? "Cerrando..." : "Cerrar mesa"}
                </button>
                <button className="btn-secondary" onClick={onForceCloseTable} disabled={closingTable}>
                  {closingTable ? "Cerrando..." : "Forzar cierre"}
                </button>
                {!normalCloseEnabled && (
                  <span className="muted">Cerrar mesa requiere pago confirmado y entrega completa.</span>
                )}
                {orderDetail.bill_split?.status === "CLOSED" && (
                  <span className="badge badge-delivered">Pago confirmado</span>
                )}
              </div>
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
                        disabled={advancingKey === key}
                        onClick={() =>
                          onAdvanceItem({
                            itemId: rowItemId,
                            currentStatus: item.status,
                            itemSector: item.sector,
                          })
                        }
                      >
                        {advancingKey === key ? "..." : `Pasar a ${next}`}
                      </button>
                    ) : (
                      <span className="muted">{new Date(item.updated_at).toLocaleTimeString("es-AR")}</span>
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
                    <span className="muted">{new Date(event.created_at).toLocaleString("es-AR")}</span>
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
                    </span>
                    <span className={billBadgeClass(part.payment_status)}>{part.payment_status}</span>
                    {actorSector === "ADMIN" && part.payment_status === "REPORTED" ? (
                      <button className="btn-primary" onClick={() => onConfirmPart(part.id)} disabled={billingBusy}>
                        {billingBusy ? "..." : "Confirmar"}
                      </button>
                    ) : (
                      <span className="muted">
                        {part.confirmed_at
                          ? new Date(part.confirmed_at).toLocaleTimeString("es-AR")
                          : part.reported_at
                            ? new Date(part.reported_at).toLocaleTimeString("es-AR")
                            : "-"}
                      </span>
                    )}
                  </div>
                ))}
                {actorSector === "ADMIN" && orderDetail.bill_split.status === "CLOSED" && (
                  <div className="order-actions">
                    <button className="btn-primary" onClick={onCloseTable} disabled={closingTable}>
                      {closingTable ? "Cerrando..." : "Cerrar mesa y finalizar"}
                    </button>
                    <button className="btn-secondary" onClick={onForceCloseTable} disabled={closingTable}>
                      {closingTable ? "Cerrando..." : "Forzar cierre"}
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
                      <button className="btn-primary" onClick={() => onResolveCashRequest(req.id)} disabled={billingBusy}>
                        {billingBusy ? "..." : "Marcar atendido"}
                      </button>
                    ) : (
                      <span className="muted">
                        {req.resolved_at ? new Date(req.resolved_at).toLocaleTimeString("es-AR") : "-"}
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
