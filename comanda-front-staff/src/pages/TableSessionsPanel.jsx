function sessionStatusLabel(status) {
  if (status === "MESA_OCUPADA" || status === "OPEN") return "Mesa ocupada";
  if (status === "CON_PEDIDO") return "Con pedido";
  if (status === "SE_RETIRARON") return "Se retiraron";
  if (status === "CLOSED") return "Cerrada";
  return status || "-";
}

function elapsedLabel(createdAt) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem}m`;
}

export function TableSessionsPanel({ rows, loading, actorSector, busyId, onMarkRetired, onClose }) {
  const canUpdate = actorSector === "ADMIN" || actorSector === "WAITER";

  return (
    <section className="panel">
      <div className="section-head">
        <h3>Mesas ocupadas</h3>
        <span className="muted">{rows.length} activas</span>
      </div>
      {loading && <p className="muted">Actualizando mesas...</p>}
      {rows.length === 0 ? (
        <p className="muted">No hay mesas ocupadas sin pedido.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Personas</th>
                <th>Estado</th>
                <th>Tiempo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.table_session_id}>
                  <td>{row.table_code}</td>
                  <td>{row.guest_count}</td>
                  <td>{sessionStatusLabel(row.status)}</td>
                  <td>{elapsedLabel(row.created_at)}</td>
                  <td>
                    <div className="order-actions">
                      <button
                        className="btn-secondary"
                        disabled={!canUpdate || busyId === row.table_session_id}
                        onClick={() => onMarkRetired(row.table_session_id)}
                      >
                        Se retiraron
                      </button>
                      <button
                        className="btn-secondary"
                        disabled={!canUpdate || busyId === row.table_session_id}
                        onClick={() => onClose(row.table_session_id)}
                      >
                        Cerrar mesa
                      </button>
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
