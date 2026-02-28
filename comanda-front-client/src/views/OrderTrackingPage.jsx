import { useCallback, useEffect, useMemo, useState } from "react";
import { createEqualSplit, fetchOrder, fetchOrderSplit, openOrderEvents, reportSplitPartPayment } from "../api/clientApi";
import { statusLabel } from "../utils/statusLabels";

function statusClass(status) {
  if (status === "RECEIVED") return "badge badge-received";
  if (status === "IN_PROGRESS") return "badge badge-progress";
  if (status === "DONE") return "badge badge-done";
  if (status === "DELIVERED") return "badge badge-delivered";
  return "badge";
}

function toMoney(value) {
  return `$${Math.round(Number(value || 0)).toLocaleString("es-AR")}`;
}

export function OrderTrackingPage({
  orderId,
  guestCount = 2,
  tableCode = "",
  clientId = "",
  feedbackLocked = false,
}) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [billSplit, setBillSplit] = useState(null);
  const [splitError, setSplitError] = useState("");
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitHint, setSplitHint] = useState("");
  const [partsCount, setPartsCount] = useState(2);
  const [payerByPart, setPayerByPart] = useState({});
  const [showSplitOptions, setShowSplitOptions] = useState(false);

  const isTwoGuests = Number(guestCount || 0) <= 2;

  const sectorCards = useMemo(() => {
    const map = new Map();
    const sectors = order?.sectors || [];
    sectors.forEach((sector) => {
      const key = String(sector.sector || "").trim().toUpperCase();
      const previous = map.get(key);
      if (!previous) {
        map.set(key, { ...sector, sector: key });
        return;
      }
      const prevTs = new Date(previous.updated_at || 0).getTime();
      const nextTs = new Date(sector.updated_at || 0).getTime();
      if (nextTs >= prevTs) {
        map.set(key, { ...sector, sector: key });
      }
    });
    return Array.from(map.values());
  }, [order?.sectors]);

  const loadSplit = useCallback(async () => {
    if (!orderId) {
      setBillSplit(null);
      setSplitError("");
      return;
    }
    try {
      const split = await fetchOrderSplit(orderId);
      setBillSplit(split);
      setSplitError("");
      setSplitHint("");
    } catch (err) {
      if (err?.status === 404) {
        setBillSplit(null);
        setSplitError("");
        return;
      }
      setSplitError(err.message || "No se pudo cargar el estado de pago.");
    }
  }, [orderId]);

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
    loadSplit();
    const timer = setInterval(tick, 7000);
    const splitTimer = setInterval(loadSplit, 9000);
    const stream = openOrderEvents(orderId);
    let refreshTimer = null;

    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        tick();
        loadSplit();
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
      clearInterval(splitTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      stream.close();
      setLiveConnected(false);
    };
  }, [orderId, loadSplit]);

  useEffect(() => {
    setPartsCount(Math.max(2, Math.min(20, Number(guestCount) || 2)));
  }, [guestCount]);

  const createSplit = async () => {
    if (!orderId || splitBusy) return;
    setSplitBusy(true);
    setSplitError("");
    setSplitHint("");
    try {
      const payload = await createEqualSplit({
        orderId,
        partsCount: Math.max(2, Math.min(20, Number(partsCount) || 2)),
      });
      setBillSplit(payload);
      setShowSplitOptions(true);
    } catch (err) {
      setSplitError(err.message || "No se pudo crear la division.");
    } finally {
      setSplitBusy(false);
    }
  };

  const reportPart = async (partId) => {
    if (splitBusy) return;
    const fallback = tableCode ? `Mesa ${tableCode}` : `Cliente ${clientId.slice(-4) || "anon"}`;
    const payerLabel = (payerByPart[partId] || fallback).trim();
    if (!payerLabel) return;

    setSplitBusy(true);
    setSplitError("");
    setSplitHint("");
    try {
      const payload = await reportSplitPartPayment({ partId, payerLabel });
      setBillSplit(payload);
      setSplitHint("Pago reportado. El staff debe validarlo y cerrar la mesa.");
    } catch (err) {
      setSplitError(err.message || "No se pudo reportar el pago.");
    } finally {
      setSplitBusy(false);
    }
  };

  const payWithoutSplit = async () => {
    if (!orderId || splitBusy) return;
    setSplitBusy(true);
    setSplitError("");
    setSplitHint("");
    try {
      let activeSplit = billSplit;
      if (!activeSplit) {
        activeSplit = await createEqualSplit({ orderId, partsCount: 1 });
      }

      const pendingPart = (activeSplit.parts || []).find((part) => part.payment_status === "PENDING");
      if (!pendingPart) {
        setSplitHint("El pago ya fue reportado. Queda pendiente validacion del staff.");
        setBillSplit(activeSplit);
        return;
      }

      const payerLabel = tableCode ? `Mesa ${tableCode}` : `Cliente ${clientId.slice(-4) || "anon"}`;
      const payload = await reportSplitPartPayment({ partId: pendingPart.id, payerLabel });
      setBillSplit(payload);
      setSplitHint("Pago reportado. El staff debe validarlo y cerrar la mesa.");
      setShowSplitOptions(false);
    } catch (err) {
      setSplitError(err.message || "No se pudo reportar el pago.");
    } finally {
      setSplitBusy(false);
    }
  };

  if (!orderId) {
    return (
      <section className="panel" id="tracking-section">
        <h2>Seguimiento</h2>
        <p className="muted">Sin pedido activo.</p>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="panel" id="tracking-section">
        <h2>Seguimiento</h2>
        <p className="muted">Cargando estado...</p>
      </section>
    );
  }

  return (
    <section className="panel" id="tracking-section">
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
        {sectorCards.map((sector, idx) => (
          <article className="tracking-card" key={`${sector.sector}:${idx}`}>
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

      <article className="split-card">
        <h3>Pago</h3>
        {splitError && <p className="warning-text">{splitError}</p>}
        {splitHint && <p className="muted">{splitHint}</p>}

        {!billSplit && isTwoGuests && (
          <div className="split-quick-actions">
            <button type="button" className="btn-primary" onClick={payWithoutSplit} disabled={splitBusy}>
              {splitBusy ? "Procesando..." : "Pagar sin dividir"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowSplitOptions((current) => !current)}
              disabled={splitBusy}
            >
              {showSplitOptions ? "Ocultar division" : "Dividir cuenta (opcional)"}
            </button>
          </div>
        )}

        {(showSplitOptions || !isTwoGuests || billSplit) && !billSplit && (
          <div className="split-create">
            <label className="field split-field">
              Partes
              <input
                type="number"
                min="2"
                max="20"
                value={partsCount}
                onChange={(e) => setPartsCount(Number(e.target.value) || 2)}
              />
            </label>
            <button type="button" className="btn-primary" onClick={createSplit} disabled={splitBusy}>
              {splitBusy ? "Creando..." : "Crear division"}
            </button>
          </div>
        )}

        {billSplit && (
          <div className="split-body">
            <p className="muted">
              Estado: <strong>{billSplit.status}</strong> | Total: <strong>{toMoney(billSplit.total_amount)}</strong>
            </p>
            <div className="split-parts">
              {billSplit.parts?.map((part) => (
                <div className="split-part" key={part.id}>
                  <div className="split-part-head">
                    <strong>{part.label}</strong>
                    <span className="badge">{part.payment_status}</span>
                  </div>
                  <p className="muted">{toMoney(part.amount)}</p>
                  {part.payment_status === "PENDING" && (
                    <div className="split-part-actions">
                      <input
                        value={payerByPart[part.id] ?? ""}
                        onChange={(e) => setPayerByPart((current) => ({ ...current, [part.id]: e.target.value }))}
                        placeholder={tableCode ? `Mesa ${tableCode}` : "Tu nombre"}
                      />
                      <button type="button" className="btn-secondary" onClick={() => reportPart(part.id)} disabled={splitBusy}>
                        {splitBusy ? "..." : "Reportar pago"}
                      </button>
                    </div>
                  )}
                  {part.payment_status !== "PENDING" && (
                    <p className="muted">
                      {part.payment_status === "REPORTED" ? "Reportado" : "Confirmado"} por {part.reported_by || "-"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </article>

      <article className="split-card">
        <h3>Feedback</h3>
        {feedbackLocked ? (
          <p className="muted">Cuando el staff cierre la mesa se abrira la pantalla de estrellas y comentario.</p>
        ) : (
          <p className="muted">Mesa cerrada. Ya podes puntuar y dejar comentario.</p>
        )}
      </article>
    </section>
  );
}
