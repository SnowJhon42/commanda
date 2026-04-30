import { statusLabel } from "../utils/statusLabels";
import { elapsedMinutes, itemAlertClass, sectorClass, sectorLabel } from "../utils/boardMeta";

function badgeClass(status) {
  if (status === "RECEIVED") return "badge badge-received";
  if (status === "IN_PROGRESS") return "badge badge-progress";
  if (status === "DONE") return "badge badge-done";
  if (status === "PARCIAL") return "badge badge-partial";
  if (status === "DELIVERED") return "badge badge-delivered";
  return "badge";
}

function isBarPaymentPending(entity) {
  return (
    entity?.service_mode === "BAR" &&
    entity?.payment_gate === "BEFORE_PREPARATION" &&
    entity?.payment_status !== "CONFIRMED"
  );
}

export function BarBoardPage({
  rows = [],
  loading = false,
  onAdvanceItem = () => {},
  advancingKey = "",
  onSelectOrder = () => {},
  selectedOrderId = null,
  alertMetaByOrder = {},
  readOnlyReason = "",
}) {
  return (
    <section className="panel">
      <div className="section-head">
        <h3>Barra</h3>
        <span className="muted">{rows.length} mesas activas</span>
      </div>
      {readOnlyReason && <p className="muted operational-banner">{readOnlyReason}</p>}
      {loading && <p className="muted">Actualizando...</p>}
      {rows.length === 0 ? (
        <p className="muted">No hay items recibidos o en preparacion en barra.</p>
      ) : (
        <div className="card-grid">
          {rows.map((row) => {
            const rowItems = Array.isArray(row?.items) ? row.items : [];
            const meta = alertMetaByOrder[row.order_id] || {};
            const rowPaymentPending = rowItems.some((item) => isBarPaymentPending(item));
            return (
            <article className="order-card" key={row.order_id}>
              <div className="order-head">
                <h4>
                  Mesa {row.table_code} - Pedido #{row.order_id}
                  {meta.total > 0 && (
                    <span
                      className={meta.severity === "high" ? "alert-count-badge alert-count-high" : "alert-count-badge alert-count-medium"}
                      title={meta.tooltip}
                    >
                      {meta.total} alertas
                    </span>
                  )}
                </h4>
                <button
                  className={selectedOrderId === row.order_id ? "btn-secondary selected-btn" : "btn-secondary"}
                  onClick={() => onSelectOrder(row.order_id)}
                >
                  {selectedOrderId === row.order_id ? "Seleccionado" : "Ver detalle"}
                </button>
              </div>
              {rowPaymentPending ? (
                <div className="order-actions" style={{ marginBottom: 10 }}>
                  <span className="badge badge-received">BAR · PAGO PENDIENTE</span>
                  <span className="muted">Visible para staff, bloqueado hasta cobrar.</span>
                </div>
              ) : null}
              <div className="sector-list">
                {rowItems.length === 0 ? (
                  <p className="muted">Esta mesa BAR no tiene items visibles en barra ahora.</p>
                ) : rowItems.map((item) => {
                  const nextStatus = item.status === "RECEIVED" ? "IN_PROGRESS" : "DONE";
                  const key = `${item.item_id}:${nextStatus}`;
                  const updating = advancingKey === key;
                  const alertClass = itemAlertClass(item, "BAR");
                  const paymentPending = isBarPaymentPending(item);
                  return (
                    <div className={`sector-row ${alertClass}`} key={item.item_id}>
                      <div className="row-main-wrap">
                        <span className="row-main">
                          {item.qty}x {item.item_name}
                          <span className={sectorClass(item.sector)}>{sectorLabel(item.sector)}</span>
                          <span className="muted row-age">{elapsedMinutes(item.created_at || item.updated_at)} min</span>
                        </span>
                        {item.notes ? <span className="row-note row-note-strong">Aclaracion: {item.notes}</span> : null}
                      </div>
                      <span className={badgeClass(item.status)}>{statusLabel(item.status)}</span>
                      <button
                        className="btn-primary"
                        disabled={updating || paymentPending || Boolean(readOnlyReason)}
                        onClick={() =>
                          onAdvanceItem({
                            itemId: item.item_id,
                            currentStatus: item.status,
                            itemSector: item.sector,
                          })
                        }
                      >
                        {paymentPending ? "Esperando pago" : updating ? "..." : item.status === "RECEIVED" ? "Tomar" : "Listo para mozo"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default BarBoardPage;
