function sessionStatusLabel(status) {
  if (status === "MESA_OCUPADA" || status === "OPEN") return "Mesa ocupada";
  if (status === "CON_PEDIDO") return "Con pedido";
  if (status === "SE_RETIRARON") return "Se retiraron";
  if (status === "CLOSED") return "Cerrada";
  return status || "-";
}

function elapsedLabel(minutesValue) {
  const minutes = Number(minutesValue);
  if (!Number.isFinite(minutes) || minutes < 0) return "-";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem}m`;
}

export function TableSessionsPanel({
  rows = [],
  loading = false,
  actorSector = "ADMIN",
  busyId = null,
  onMarkRetired = () => {},
  readOnlyReason = "",
}) {
  const canUpdate = actorSector === "ADMIN" || actorSector === "WAITER";
  const sortedRows = [...rows].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return (
    <section className="panel">
      <div className="section-head">
        <h3>Mesas activas</h3>
        <span className="muted">{sortedRows.length} activas</span>
      </div>
      {readOnlyReason && <p className="muted operational-banner">{readOnlyReason}</p>}
      {loading && <p className="muted">Actualizando mesas...</p>}
      {sortedRows.length === 0 ? (
        <p className="muted">No hay mesas activas.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Personas</th>
                <th>Conectados</th>
                <th>Pedido activo</th>
                <th>Estado</th>
                <th>Tiempo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.table_session_id} className={row.active_order_id ? "table-session-has-order" : ""}>
                  <td>{row.table_code}</td>
                  <td>{row.guest_count}</td>
                  <td>{row.connected_clients || 0}</td>
                  <td>{row.active_order_id ? `#${row.active_order_id}` : "-"}</td>
                  <td>{sessionStatusLabel(row.status)}</td>
                  <td>{elapsedLabel(row.elapsed_minutes)}</td>
                  <td>
                    <div className="order-actions">
                      {!row.active_order_id && (
                        <button
                          className="btn-secondary"
                          disabled={!canUpdate || busyId === row.table_session_id || Boolean(readOnlyReason)}
                          onClick={() => onMarkRetired(row.table_session_id)}
                        >
                          Se retiraron
                        </button>
                      )}
                      {row.active_order_id && <span className="muted">Mesa con pedido en curso</span>}
                    </div>
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

export default TableSessionsPanel;
