import { statusLabel } from "../utils/statusLabels";
import { sectorClass, sectorLabel } from "../utils/boardMeta";

function badgeClass(status) {
  if (status === "RECEIVED") return "badge badge-received";
  if (status === "IN_PROGRESS") return "badge badge-progress";
  if (status === "DONE") return "badge badge-done";
  if (status === "PARCIAL") return "badge badge-partial";
  if (status === "DELIVERED") return "badge badge-delivered";
  return "badge";
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
    value || 0
  );
}

function elapsedLabel(minutesValue) {
  const minutes = Number(minutesValue);
  if (!Number.isFinite(minutes) || minutes < 0) return "-";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem}m`;
}

export function AdminBoardPage({
  rows,
  loading,
  onSelectOrder,
  selectedOrderId,
  alertMetaByOrder = {},
  freshByOrder = {},
}) {
  return (
    <section className="panel">
      <div className="section-head">
        <h3>Administrador</h3>
        <span className="muted">{rows.length} pedidos</span>
      </div>
      {loading && <p className="muted">Actualizando...</p>}

      {rows.length === 0 ? (
        <p className="muted">No hay pedidos para este filtro.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Personas</th>
                <th>Items</th>
                <th>Entregados</th>
                <th>Estado general</th>
                <th>Sectores</th>
                <th>Tiempo</th>
                <th>Total</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.order_id} className={row.status_aggregated !== "DELIVERED" ? "admin-row-active" : ""}>
                  <td>
                    {row.table_code}
                    {freshByOrder[row.order_id] && <span className="new-badge">NUEVO</span>}
                    {(alertMetaByOrder[row.order_id]?.total || 0) > 0 && (
                      <span
                        className={
                          alertMetaByOrder[row.order_id]?.severity === "high"
                            ? "alert-count-badge alert-count-high"
                            : "alert-count-badge alert-count-medium"
                        }
                        title={alertMetaByOrder[row.order_id]?.tooltip || ""}
                      >
                        {alertMetaByOrder[row.order_id]?.total} alertas
                      </span>
                    )}
                  </td>
                  <td>{row.guest_count}</td>
                  <td>{row.total_items}</td>
                  <td>
                    {row.delivered_items} / {row.total_items}
                  </td>
                  <td>
                    <span className={badgeClass(row.status_aggregated)}>{statusLabel(row.status_aggregated)}</span>
                  </td>
                  <td>
                    <div className="sector-chip-wrap">
                      {[...new Set((row.sectors || []).map((sector) => sector.sector))].map((sector) => (
                        <span key={`${row.order_id}:${sector}`} className={sectorClass(sector)}>
                          {sectorLabel(sector)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{elapsedLabel(row.elapsed_minutes)}</td>
                  <td>{formatMoney(row.total_amount)}</td>
                  <td>
                    <button
                      className={selectedOrderId === row.order_id ? "btn-secondary selected-btn" : "btn-secondary"}
                      onClick={() => onSelectOrder(row.order_id)}
                    >
                      {selectedOrderId === row.order_id ? "Seleccionado" : "Ver detalle"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
