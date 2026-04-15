"use client";

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
    value || 0
  );
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}

export function ShiftSummariesPage({ items = [] }) {
  return (
    <section className="ops-panel menu-admin-shell">
      <div className="menu-admin-hero shift-hero">
        <div>
          <p className="kicker menu-admin-kicker">Historial operativo</p>
          <h3>Resumenes</h3>
          <p className="muted">
            Acá se van a guardar los cierres por fecha y turno para volver a abrirlos después.
          </p>
        </div>
      </div>

      <div className="menu-editor-card shift-card">
        <div className="section-head">
          <div>
            <h4>Cierres guardados</h4>
            <p className="muted">Cada fila deja el cierre guardado por fecha, turno, usuario y números base.</p>
          </div>
          <span className="shift-status-pill shift-status-pill-soft">{items.length} cierres</span>
        </div>

        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha</th>
                <th>Turno</th>
                <th>Usuario</th>
                <th>Cubiertos</th>
                <th>Facturación</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    Todavía no hay cierres guardados.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                <tr key={row.shift.id}>
                  <td>T-{row.shift.id}</td>
                  <td>{formatDate(row.shift.closed_at || row.shift.opened_at)}</td>
                  <td>{row.shift.label}</td>
                  <td>{row.shift.operator_name}</td>
                  <td>{row.summary.closed_covers}</td>
                  <td>{formatMoney(row.summary.total_revenue)}</td>
                  <td>
                    <button type="button" className="btn-secondary">
                      Ver resumen
                    </button>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default ShiftSummariesPage;
