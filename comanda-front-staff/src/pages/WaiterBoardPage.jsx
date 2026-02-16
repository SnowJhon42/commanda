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

export function WaiterBoardPage({
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
        <h3>Mozo</h3>
        <span className="muted">{orders.length} pedidos</span>
      </div>
      {loading && <p className="muted">Actualizando...</p>}
      {orders.length === 0 ? (
        <p className="muted">No hay pedidos para este filtro.</p>
      ) : (
        <div className="card-grid">
          {orders.map((order) => {
            const next = nextStatus(order.sector_status);
            const key = `${order.order_id}:${order.sector}`;
            const updating = advancingKey === key;
            return (
              <article className="order-card" key={order.order_id}>
                <div className="order-head">
                  <h4>
                    #{order.order_id} - Mesa {order.table_code}
                  </h4>
                  <span className={badgeClass(order.sector_status)}>{order.sector_status}</span>
                </div>
                <div className="order-actions">
                  <button
                    className={selectedOrderId === order.order_id ? "btn-secondary selected-btn" : "btn-secondary"}
                    onClick={() => onSelectOrder(order.order_id)}
                  >
                    {selectedOrderId === order.order_id ? "Seleccionado" : "Ver detalle"}
                  </button>
                  {next ? (
                    <button
                      className="btn-primary"
                      disabled={updating}
                      onClick={() =>
                        onAdvanceSector({
                          orderId: order.order_id,
                          sector: order.sector,
                          currentStatus: order.sector_status,
                        })
                      }
                    >
                      {updating ? "Actualizando..." : `Pasar a ${next}`}
                    </button>
                  ) : (
                    <p className="muted">Pedido entregado por mozo.</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
