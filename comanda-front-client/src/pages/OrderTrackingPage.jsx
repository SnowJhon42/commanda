import { useEffect, useState } from "react";
import {
  createEqualSplit,
  fetchOrder,
  fetchOrderSplit,
  openOrderEvents,
  reportSplitPartPayment,
} from "../api/clientApi";
import { statusLabel } from "../utils/statusLabels";

function statusClass(status) {
  if (status === "RECEIVED") return "badge badge-received";
  if (status === "IN_PROGRESS") return "badge badge-progress";
  if (status === "DONE") return "badge badge-done";
  if (status === "DELIVERED") return "badge badge-delivered";
  return "badge";
}

function billBadgeClass(status) {
  if (status === "CONFIRMED") return "badge badge-delivered";
  if (status === "REPORTED") return "badge badge-done";
  return "badge badge-received";
}

function money(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
    value || 0
  );
}

export function OrderTrackingPage({ orderId }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [split, setSplit] = useState(null);
  const [splitError, setSplitError] = useState("");
  const [splitBusy, setSplitBusy] = useState(false);
  const [partsCount, setPartsCount] = useState(2);
  const [payerLabel, setPayerLabel] = useState("Cliente mesa");

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setError("");
      setSplit(null);
      setSplitError("");
      return;
    }
    let mounted = true;

    const loadSplit = () => {
      fetchOrderSplit(orderId)
        .then((data) => {
          if (!mounted) return;
          setSplit(data);
          setSplitError("");
        })
        .catch((err) => {
          if (!mounted) return;
          setSplit(null);
          if (err?.status && err.status !== 404) {
            setSplitError(err.message || "No se pudo cargar division.");
          }
        });
    };

    const tick = () => {
      fetchOrder(orderId)
        .then((data) => {
          if (!mounted) return;
          setOrder(data);
          setPartsCount(Math.max(2, Number(data.guest_count || 2)));
          setError("");
          loadSplit();
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
    stream.addEventListener("bill.split.updated", scheduleRefresh);

    return () => {
      mounted = false;
      clearInterval(timer);
      if (refreshTimer) clearTimeout(refreshTimer);
      stream.close();
      setLiveConnected(false);
    };
  }, [orderId]);

  const handleCreateSplit = async () => {
    if (!orderId) return;
    setSplitBusy(true);
    setSplitError("");
    try {
      const data = await createEqualSplit({ orderId, partsCount });
      setSplit(data);
    } catch (err) {
      setSplitError(err.message || "No se pudo crear division.");
    } finally {
      setSplitBusy(false);
    }
  };

  const handleReportPart = async (partId) => {
    setSplitBusy(true);
    setSplitError("");
    try {
      const data = await reportSplitPartPayment({
        partId,
        payerLabel: payerLabel.trim() || "Cliente mesa",
      });
      setSplit(data);
    } catch (err) {
      setSplitError(err.message || "No se pudo reportar pago.");
    } finally {
      setSplitBusy(false);
    }
  };

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

      {order.status_aggregated === "DELIVERED" && (
        <article className="tracking-card split-card">
          <h3>Dividir cuenta</h3>
          {!split ? (
            <div className="row">
              <label className="field qty-field">
                Partes
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={partsCount}
                  onChange={(e) => setPartsCount(Math.max(2, Number(e.target.value) || 2))}
                />
              </label>
              <button className="btn-primary" disabled={splitBusy} onClick={handleCreateSplit}>
                {splitBusy ? "..." : "Crear division"}
              </button>
            </div>
          ) : (
            <>
              <p className="muted">
                Estado: <strong>{split.status}</strong> | Total: <strong>{money(split.total_amount)}</strong>
              </p>
              <label className="field">
                Tu nombre
                <input value={payerLabel} onChange={(e) => setPayerLabel(e.target.value)} placeholder="Ej: Juan" />
              </label>
              <div className="cart-list">
                {split.parts.map((part) => (
                  <article className="cart-item" key={part.id}>
                    <div className="cart-item-head">
                      <h3>
                        {part.label} - {money(part.amount)}
                      </h3>
                      <span className={billBadgeClass(part.payment_status)}>{part.payment_status}</span>
                    </div>
                    <p className="muted">{part.reported_by ? `Reportado por ${part.reported_by}` : "Sin reportar"}</p>
                    {part.payment_status === "PENDING" && (
                      <button className="btn-primary" disabled={splitBusy} onClick={() => handleReportPart(part.id)}>
                        {splitBusy ? "..." : "Reportar pago"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {splitError && <p className="warning-text">{splitError}</p>}
        </article>
      )}
    </section>
  );
}
