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

export function KitchenBoardPage({
  rows,
  loading,
  onAdvanceItem,
  advancingKey,
  onSelectOrder,
  selectedOrderId,
  alertMetaByOrder = {},
}) {
  return (
    <section className="panel">
      <div className="section-head">
        <h3>Cocina</h3>
        <span className="muted">{rows.length} mesas activas</span>
      </div>
      {loading && <p className="muted">Actualizando...</p>}
      {rows.length === 0 ? (
        <p className="muted">No hay items en preparacion en cocina.</p>
      ) : (
        <div className="card-grid">
          {rows.map((row) => {
            const meta = alertMetaByOrder[row.order_id] || {};
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
              <div className="sector-list">
                {row.items.map((item) => {
                  const key = `${item.item_id}:DONE`;
                  const updating = advancingKey === key;
                  const alertClass = itemAlertClass(item, "KITCHEN");
                  return (
                    <div className={`sector-row ${alertClass}`} key={item.item_id}>
                      <span className="row-main">
                        {item.qty}x {item.item_name}
                        <span className={sectorClass(item.sector)}>{sectorLabel(item.sector)}</span>
                        <span className="muted row-age">{elapsedMinutes(item.updated_at || item.created_at)} min</span>
                      </span>
                      <span className={badgeClass(item.status)}>{statusLabel(item.status)}</span>
                      <button
                        className="btn-primary"
                        disabled={updating}
                        onClick={() =>
                          onAdvanceItem({
                            itemId: item.item_id,
                            currentStatus: item.status,
                            itemSector: item.sector,
                          })
                        }
                      >
                        {updating ? "..." : "Marcar LISTO"}
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
