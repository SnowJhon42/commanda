import { useEffect, useState } from "react";
import { fetchOrder, openOrderEvents } from "../api/clientApi";
import { statusLabel } from "../utils/statusLabels";

function statusClass(status) {
  if (status === "RECEIVED") return "badge badge-received";
  if (status === "IN_PROGRESS") return "badge badge-progress";
  if (status === "DONE") return "badge badge-done";
  if (status === "DELIVERED") return "badge badge-delivered";
  return "badge";
}

export function OrderTrackingPage({ orderId }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setError("");
      return;
    }
    let mounted = true;
    const tick = () => {
      fetchOrder(orderId)
        .then((data) => {
          if (!mounted) return;
          setOrder(data);
          setError("");
        })
        .catch((err) => {
          if (!mounted) return;
          setError(err.message || "No se pudo actualizar el seguimiento.");
        });
    };
    tick();
    const timer = setInterval(tick, 7000);
    const stream = openOrderEvents(orderId);
    let refreshTimer = null;

    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        tick();
      }, 200);
    };

    stream.onopen = () => setLiveConnected(true);
    stream.onerror = () => setLiveConnected(false);
    stream.onmessage = scheduleRefresh;
    stream.addEventListener("items.changed", scheduleRefresh);
    stream.addEventListener("order.created", scheduleRefresh);

    return () => {
      mounted = false;
      clearInterval(timer);
      if (refreshTimer) clearTimeout(refreshTimer);
      stream.close();
      setLiveConnected(false);
    };
  }, [orderId]);

  if (!orderId) {
    return (
      <section className="panel">
        <h2>Seguimiento</h2>
        <p className="muted">Sin pedido activo.</p>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="panel">
        <h2>Seguimiento</h2>
        <p className="muted">Cargando estado...</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Seguimiento</h2>
      <div className="tracking-head">
        <p>
          Pedido <strong>#{order.id}</strong> - Ticket <strong>{order.ticket_number}</strong>
        </p>
        <span className={statusClass(order.status_aggregated)}>{statusLabel(order.status_aggregated)}</span>
      </div>
      <p className={liveConnected ? "live-pill live-pill-on" : "live-pill"}>
        {liveConnected ? "Actualizacion en vivo activa" : "Actualizacion en vivo reconectando"}
      </p>
      {error && <p className="warning-text">{error}</p>}

      <div className="tracking-grid">
        {order.sectors.map((sector) => (
          <article className="tracking-card" key={sector.sector}>
            <p className="muted">{sector.sector}</p>
            <p>
              <span className={statusClass(sector.status)}>{statusLabel(sector.status)}</span>
            </p>
            <p className="muted">{new Date(sector.updated_at).toLocaleString("es-AR")}</p>
          </article>
        ))}
      </div>

      <h3>Items</h3>
      <ul className="tracking-items">
        {order.items.map((item) => (
          <li key={item.id}>
            {item.qty}x {item.product_name} <span className="muted">({item.sector})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
