import { useEffect, useMemo, useRef, useState } from "react";
import { fetchOrder, openOrderEvents } from "../api/clientApi";
import { statusLabel } from "../utils/statusLabels";

function statusClass(status) {
  if (status === "RECEIVED") return "badge badge-received";
  if (status === "IN_PROGRESS") return "badge badge-progress";
  if (status === "DONE") return "badge badge-done";
  if (status === "DELIVERED") return "badge badge-delivered";
  return "badge";
}

function statusIcon(status) {
  if (status === "RECEIVED") return "🧾";
  if (status === "IN_PROGRESS") return "🍳";
  if (status === "DONE") return "✅";
  if (status === "DELIVERED") return "🍽️";
  return "•";
}

function sectorLabel(sector) {
  if (sector === "WAITER") return "Mozo";
  if (sector === "BAR") return "Bar";
  if (sector === "KITCHEN") return "Cocina";
  return sector || "Sector";
}

function formatShortDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export function OrderTrackingPage({ orderId, tableSessionToken }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [recentlyChangedIds, setRecentlyChangedIds] = useState({});
  const previousStatusByItemRef = useRef({});

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setError("");
      return;
    }
    let mounted = true;

    const tick = () => {
      fetchOrder(orderId, tableSessionToken)
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
    const stream = openOrderEvents(orderId, tableSessionToken);
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
  }, [orderId, tableSessionToken]);

  const summary = useMemo(() => {
    const items = order?.items || [];
    const totalQty = items.reduce((acc, item) => acc + Number(item.qty || 0), 0);
    const deliveredQty = items.reduce(
      (acc, item) => acc + (item.status === "DELIVERED" ? Number(item.qty || 0) : 0),
      0
    );
    const doneQty = items.reduce(
      (acc, item) =>
        acc + (item.status === "DONE" || item.status === "DELIVERED" ? Number(item.qty || 0) : 0),
      0
    );
    const progress = totalQty > 0 ? Math.round((deliveredQty / totalQty) * 100) : 0;
    const prepProgress = totalQty > 0 ? Math.round((doneQty / totalQty) * 100) : 0;
    return { totalQty, deliveredQty, doneQty, progress, prepProgress };
  }, [order?.items]);

  const sectorCards = useMemo(() => {
    const items = order?.items || [];
    const map = new Map();
    items.forEach((item) => {
      const sector = String(item.sector || "").toUpperCase() || "OTHER";
      const prev = map.get(sector) || { sector, total: 0, delivered: 0, done: 0 };
      prev.total += Number(item.qty || 0);
      if (item.status === "DELIVERED") prev.delivered += Number(item.qty || 0);
      if (item.status === "DONE" || item.status === "DELIVERED") prev.done += Number(item.qty || 0);
      map.set(sector, prev);
    });
    const orderBySector = { WAITER: 0, BAR: 1, KITCHEN: 2 };
    return Array.from(map.values()).sort(
      (a, b) => (orderBySector[a.sector] ?? 99) - (orderBySector[b.sector] ?? 99)
    );
  }, [order?.items]);

  const sortedItems = useMemo(() => {
    const statusOrder = { IN_PROGRESS: 0, RECEIVED: 1, DONE: 2, DELIVERED: 3 };
    return [...(order?.items || [])].sort((a, b) => {
      const aKey = statusOrder[a.status] ?? 99;
      const bKey = statusOrder[b.status] ?? 99;
      if (aKey !== bKey) return aKey - bKey;
      return String(a.product_name || "").localeCompare(String(b.product_name || ""), "es");
    });
  }, [order?.items]);

  useEffect(() => {
    const items = order?.items || [];
    if (items.length === 0) return;

    const previous = previousStatusByItemRef.current;
    const changed = {};

    items.forEach((item) => {
      const currentStatus = String(item.status || "");
      const previousStatus = previous[item.id];
      if (previousStatus && previousStatus !== currentStatus) {
        changed[item.id] = Date.now();
      }
      previous[item.id] = currentStatus;
    });

    if (Object.keys(changed).length === 0) return;

    setRecentlyChangedIds((current) => ({ ...current, ...changed }));
    const timer = setTimeout(() => {
      setRecentlyChangedIds((current) => {
        const next = { ...current };
        Object.keys(changed).forEach((id) => {
          delete next[id];
        });
        return next;
      });
    }, 1400);

    return () => clearTimeout(timer);
  }, [order?.items]);

  if (!orderId) {
    return (
      <section className="panel" id="tracking-section">
        <h2>Estado del pedido</h2>
        <p className="muted">Todavia no hiciste un pedido.</p>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="panel" id="tracking-section">
        <h2>Estado del pedido</h2>
        <p className="muted">Cargando estado...</p>
      </section>
    );
  }

  return (
    <section className="panel tracking-compact" id="tracking-section">
      <div className="tracking-head">
        <p>
          Pedido <strong>#{order.id}</strong>
        </p>
        <span className={statusClass(order.status_aggregated)}>
          {statusIcon(order.status_aggregated)} {statusLabel(order.status_aggregated)}
        </span>
      </div>

      <p className={liveConnected ? "live-pill live-pill-on" : "live-pill"}>
        {liveConnected ? "En vivo" : "Reconectando"}
      </p>
      {error && <p className="warning-text">{error}</p>}

      <div className="tracking-progress-card">
        <div className="tracking-progress-row">
          <span>Preparacion</span>
          <strong>
            {summary.doneQty}/{summary.totalQty}
          </strong>
        </div>
        <div className="tracking-progress-bar">
          <div className="tracking-progress-fill tracking-progress-fill-prep" style={{ width: `${summary.prepProgress}%` }} />
        </div>
        <div className="tracking-progress-row">
          <span>Entregado</span>
          <strong>
            {summary.deliveredQty}/{summary.totalQty}
          </strong>
        </div>
        <div className="tracking-progress-bar">
          <div className="tracking-progress-fill" style={{ width: `${summary.progress}%` }} />
        </div>
      </div>

      <div className="tracking-sector-list">
        {sectorCards.map((sector) => (
          <article className="tracking-sector-chip" key={sector.sector}>
            <p>{sectorLabel(sector.sector)}</p>
            <strong>
              {sector.delivered}/{sector.total}
            </strong>
          </article>
        ))}
      </div>

      <div className="tracking-items-compact">
        {sortedItems.map((item) => (
          <article
            key={item.id}
            className={[
              "tracking-item-row",
              item.status === "DELIVERED" ? "tracking-item-row-delivered" : "",
              recentlyChangedIds[item.id]
                ? item.status === "DELIVERED"
                  ? "tracking-item-row-updated-delivered"
                  : "tracking-item-row-updated-prep"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="tracking-item-main">
              <h4>
                {item.qty}x {item.product_name}
              </h4>
              <p className="muted">
                {sectorLabel(item.sector)} | {formatShortDate(item.updated_at)}
              </p>
            </div>
            <span className={statusClass(item.status)}>
              {statusIcon(item.status)} {statusLabel(item.status)}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
