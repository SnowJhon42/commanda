function nextStatus(currentStatus) {
  if (currentStatus === "RECEIVED") return "IN_PROGRESS";
  if (currentStatus === "IN_PROGRESS") return "DONE";
  if (currentStatus === "DONE") return "DELIVERED";
  return null;
}

function badgeClass(status) {
  if (status === "RECEIVED") return "badge badge-received";
  if (status === "IN_PROGRESS") return "badge badge-progress";
  if (status === "DONE") return "badge badge-done";
  if (status === "DELIVERED") return "badge badge-delivered";
  return "badge";
}

export function AdminBoardPage({
  orders,
  loading,
  onAdvanceSector,
  advancingKey,
  onSelectOrder,
  selectedOrderId,
}) {
  return (
    <section className="panel">
      <div className="section-head">
        <h3>Admin</h3>
        <span className="muted">{orders.length} pedidos</span>
      </div>
      {loading && <p className="muted">Actualizando...</p>}

      {orders.length === 0 ? (
        <p className="muted">No hay pedidos para este filtro.</p>
      ) : (
        <div className="card-grid">
          {orders.map((order) => (
            <article key={order.order_id} className="order-card">
              <div className="order-head">
                <h4>
                  #{order.order_id} - Mesa {order.table_code}
                </h4>
                <span className={badgeClass(order.status_aggregated)}>{order.status_aggregated}</span>
              </div>
              <div className="order-actions">
                <button
                  className={selectedOrderId === order.order_id ? "btn-secondary selected-btn" : "btn-secondary"}
                  onClick={() => onSelectOrder(order.order_id)}
                >
                  {selectedOrderId === order.order_id ? "Seleccionado" : "Ver detalle"}
                </button>
              </div>
              <div className="sector-list">
                {order.sectors.map((sector) => {
                  const next = nextStatus(sector.status);
                  const key = `${order.order_id}:${sector.sector}`;
                  const updating = advancingKey === key;
                  return (
                    <div className="sector-row" key={`${order.order_id}:${sector.sector}`}>
                      <span>{sector.sector}</span>
                      <span className={badgeClass(sector.status)}>{sector.status}</span>
                      {next ? (
                        <button
                          className="btn-primary"
                          disabled={updating}
                          onClick={() =>
                            onAdvanceSector({
                              orderId: order.order_id,
                              sector: sector.sector,
                              currentStatus: sector.status,
                            })
                          }
                        >
                          {updating ? "..." : `Pasar a ${next}`}
                        </button>
                      ) : (
                        <span className="muted">Completo</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
