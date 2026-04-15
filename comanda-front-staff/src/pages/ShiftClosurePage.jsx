"use client";

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
    value || 0
  );
}

function elapsedLabel(minutesValue) {
  const minutes = Number(minutesValue || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return "--";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem}m`;
}

export function ShiftClosurePage({
  session,
  activeShift,
  shiftSummary = {
    closedCovers: 0,
    closedTables: 0,
    totalRevenue: 0,
    avgDurationMinutes: 0,
    avgRating: 0,
    feedbackCount: 0,
    closedTableDetails: [],
  },
  onConfirmCloseShift = () => {},
  onBackToBoard = () => {},
}) {
  const username = activeShift?.operator_name || session?.staff?.username || "admin";
  const nowLabel = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());

  return (
    <section className="ops-panel menu-admin-shell">
      <div className="menu-admin-hero shift-hero">
        <div>
          <p className="kicker menu-admin-kicker">Cierre operativo</p>
          <h3>Cierre</h3>
          <p className="muted">
            Desde acá revisás el turno actual y confirmás el cierre cuando termina.
          </p>
        </div>
        <div className="shift-hero-meta">
          <span className="shift-meta-pill">Turno: {activeShift?.label || "Turno actual"}</span>
          <span className="shift-meta-pill">Nombre: {username}</span>
          <span className="shift-meta-pill">AR: {nowLabel}</span>
        </div>
      </div>

      <div className="shift-grid">
        <div className="shift-primary">
          <div className="menu-editor-card shift-card">
            <div className="section-head">
              <div>
                <h4>Turno a cerrar</h4>
                <p className="muted">La operación sigue en Pedidos. Acá solo revisás y cerrás.</p>
              </div>
              <span className="shift-status-pill">Turno abierto</span>
            </div>

            <div className="shift-empty-state">
              <strong>{activeShift?.label || "Turno actual"}</strong>
              <p className="muted">
                Usuario a cargo: <strong>{username}</strong>
              </p>
              <p className="muted">
                Apertura:{" "}
                {activeShift?.opened_at
                  ? new Intl.DateTimeFormat("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Argentina/Buenos_Aires",
                    }).format(new Date(activeShift.opened_at))
                  : nowLabel}
              </p>
              <div className="form-actions">
                <button type="button" className="btn-primary" onClick={onConfirmCloseShift}>
                  Confirmar cierre
                </button>
                <button type="button" className="btn-secondary" onClick={onBackToBoard}>
                  Volver a Pedidos
                </button>
              </div>
            </div>
          </div>

          <div className="menu-editor-card shift-card">
            <div className="section-head">
              <div>
                <h4>Resumen de cierre</h4>
                <p className="muted">Vista previa del resumen que se revisa antes de confirmar el cierre.</p>
              </div>
            </div>

            <div className="shift-stats-grid">
              <article className="shift-stat-box">
                <span>Cubiertos cerrados</span>
                <strong>{shiftSummary.closedCovers}</strong>
              </article>
              <article className="shift-stat-box">
                <span>Mesas cerradas</span>
                <strong>{shiftSummary.closedTables}</strong>
              </article>
              <article className="shift-stat-box">
                <span>Facturación total</span>
                <strong>{formatMoney(shiftSummary.totalRevenue)}</strong>
              </article>
              <article className="shift-stat-box">
                <span>Tiempo promedio</span>
                <strong>{elapsedLabel(shiftSummary.avgDurationMinutes)}</strong>
              </article>
              <article className="shift-stat-box">
                <span>Valoración promedio</span>
                <strong>{shiftSummary.feedbackCount > 0 ? `${Number(shiftSummary.avgRating || 0).toFixed(1)} / 5` : "--"}</strong>
              </article>
              <article className="shift-stat-box">
                <span>Opiniones</span>
                <strong>{shiftSummary.feedbackCount || 0}</strong>
              </article>
            </div>

            <div className="shift-placeholder-block">
              <div>
                <h5>Mesas cerradas del turno</h5>
                {shiftSummary.closedTableDetails.length === 0 ? (
                  <p className="muted">Todavía no cerraste mesas en este turno.</p>
                ) : (
                  <div className="shift-closed-table-list">
                    {shiftSummary.closedTableDetails.map((entry) => (
                      <div key={`${entry.tableCode}-${entry.closedAt}`} className="shift-closed-table-row">
                        <strong>{entry.tableCode}</strong>
                        <span>{entry.guestCount} cubiertos</span>
                        <span>{formatMoney(entry.totalAmount)}</span>
                        <span>{elapsedLabel(entry.durationMinutes)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h5>Rankings del turno</h5>
                <p className="muted">Top platos y top bebidas del turno, sin comparativas todavía.</p>
              </div>
            </div>
          </div>
        </div>

        <aside className="shift-side">
          <div className="menu-editor-card shift-card">
            <div className="section-head">
              <div>
                <h4>Cómo funciona</h4>
                <p className="muted">La idea es ver la lógica general antes de meter backend.</p>
              </div>
            </div>
            <ul className="shift-rule-list">
              <li>Seguís operando normal desde Pedidos.</li>
              <li>Si queda una mesa abierta, sigue viva en Pedidos.</li>
              <li>Acá solo revisás el cierre antes de confirmar.</li>
              <li>Cuando confirmás, volvés al login y queda constancia del cierre.</li>
            </ul>
          </div>

          <div className="menu-editor-card shift-card">
            <div className="section-head">
              <div>
                <h4>Último cierre</h4>
                <p className="muted">Referencia visual para el estado inicial del admin.</p>
              </div>
            </div>
            <div className="detail-card">
              <strong>Turno noche</strong>
              <p className="muted">Usuario: admin</p>
              <p className="muted">Facturación: --</p>
              <p className="muted">Cubiertos: --</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default ShiftClosurePage;
