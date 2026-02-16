function badgeClass(status) {
  if (status === "RECEIVED") return "badge badge-received";
  if (status === "IN_PROGRESS") return "badge badge-progress";
  if (status === "DONE") return "badge badge-done";
  if (status === "DELIVERED") return "badge badge-delivered";
  return "badge";
}

export function OrderDetailPanel({ orderDetail, selectedOrderId, loading, error, onRefresh }) {
  return (
    <section className="panel">
      <div className="section-head">
        <h3>Detalle de pedido</h3>
        <button className="btn-secondary" onClick={onRefresh} disabled={!selectedOrderId || loading}>
          {loading ? "Cargando..." : "Refrescar detalle"}
        </button>
      </div>

      {!selectedOrderId && <p className="muted">Selecciona un pedido en el tablero para ver el detalle.</p>}

      {selectedOrderId && loading && <p className="muted">Cargando detalle...</p>}
      {error && <p className="error-text">{error}</p>}

      {orderDetail && (
        <div className="detail-grid">
          <article className="detail-card">
            <h4>
              Pedido #{orderDetail.id} - Mesa {orderDetail.table_code}
            </h4>
            <p className="muted">
              Ticket: {orderDetail.ticket_number} | Estado global:
              {" "}
              <span className={badgeClass(orderDetail.status_aggregated)}>{orderDetail.status_aggregated}</span>
            </p>
            <p className="muted">
              Comensales: {orderDetail.guest_count} | Creado: {new Date(orderDetail.created_at).toLocaleString("es-AR")}
            </p>
          </article>

          <article className="detail-card">
            <h4>Sectores</h4>
            <div className="sector-list">
              {orderDetail.sectors.map((sector) => (
                <div className="sector-row" key={sector.sector}>
                  <span>{sector.sector}</span>
                  <span className={badgeClass(sector.status)}>{sector.status}</span>
                  <span className="muted">{new Date(sector.updated_at).toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="detail-card">
            <h4>Items</h4>
            <ul className="detail-items">
              {orderDetail.items.map((item) => (
                <li key={item.id}>
                  {item.qty}x {item.product_name} <span className="muted">({item.sector})</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      )}
    </section>
  );
}
