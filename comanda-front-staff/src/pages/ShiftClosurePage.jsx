"use client";

import { useEffect, useState } from "react";

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
    value || 0
  );
}

function paymentMethodLabel(value) {
  if (value === "CASH") return "Efectivo";
  if (value === "CARD") return "Tarjeta";
  if (value === "TRANSFER") return "Transferencia";
  if (value === "OTHER") return "Otros";
  return value || "Otro";
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
    collectedTotal: 0,
    paymentTotals: [],
    pendingOrders: [],
    pendingOrdersCount: 0,
    cashSession: null,
  },
  cashBusy = false,
  collectingPaymentKey = "",
  onOpenCashSession = () => {},
  onCloseCashSession = () => {},
  onCollectOrderPayment = () => {},
  onConfirmCloseShift = () => {},
  onBackToBoard = () => {},
}) {
  const username = activeShift?.operator_name || session?.staff?.display_name || session?.staff?.username || "admin";
  const [openingFloat, setOpeningFloat] = useState("0");
  const [cashNote, setCashNote] = useState("");
  const [closingDeclared, setClosingDeclared] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [collectForms, setCollectForms] = useState({});
  const nowLabel = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const cashSession = shiftSummary.cashSession;
  const hasOpenCash = cashSession?.status === "OPEN";
  const pendingOrders = shiftSummary.pendingOrders || [];
  const paymentTotals = shiftSummary.paymentTotals || [];
  const paymentTotalsMap = paymentTotals.reduce((acc, entry) => {
    acc[entry.paymentMethod] = Number(entry.totalAmount || 0);
    return acc;
  }, {});
  const cashTotal = Number(paymentTotalsMap.CASH || 0);
  const cardTotal = Number(paymentTotalsMap.CARD || 0);
  const transferTotal = Number(paymentTotalsMap.TRANSFER || 0);
  const otherTotal = Number(paymentTotalsMap.OTHER || 0);
  const digitalTotal = cardTotal + transferTotal + otherTotal;

  useEffect(() => {
    if (!cashSession) {
      setClosingDeclared("");
      return;
    }
    setClosingDeclared(String(cashSession.expectedAmount || 0));
  }, [cashSession?.expectedAmount, cashSession?.id]);

  useEffect(() => {
    setCollectForms((current) => {
      const nextForms = {};
      pendingOrders.forEach((order) => {
        nextForms[order.orderId] = {
          paymentMethod: current[order.orderId]?.paymentMethod || "CASH",
          amount:
            current[order.orderId]?.amount && Number(current[order.orderId]?.amount) > 0
              ? current[order.orderId].amount
              : String(order.balanceDue || 0),
          note: current[order.orderId]?.note || "",
        };
      });
      return nextForms;
    });
  }, [pendingOrders]);

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
                <button type="button" className="btn-primary" onClick={onConfirmCloseShift} disabled={hasOpenCash}>
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
                <h4>Caja del turno</h4>
                <p className="muted">Abrí caja, registrá cobros y cerrala antes del cierre final.</p>
              </div>
            </div>

            {cashSession ? (
              <div className="detail-card" style={{ marginBottom: 16 }}>
                <strong>{cashSession.status === "OPEN" ? "Caja abierta" : "Caja cerrada"}</strong>
                <p className="muted">Fondo inicial: {formatMoney(cashSession.openingFloat)}</p>
                <p className="muted">Cobrado total del turno: {formatMoney(cashSession.collectedAmount)}</p>
                <div className="shift-stats-grid" style={{ marginTop: 12 }}>
                  <article className="shift-stat-box">
                    <span>Caja física</span>
                    <strong>{formatMoney(cashTotal || cashSession.cashCollectedAmount || 0)}</strong>
                  </article>
                  <article className="shift-stat-box">
                    <span>Cuentas / bancos</span>
                    <strong>{formatMoney(digitalTotal)}</strong>
                  </article>
                  <article className="shift-stat-box">
                    <span>Tarjeta</span>
                    <strong>{formatMoney(cardTotal)}</strong>
                  </article>
                  <article className="shift-stat-box">
                    <span>Transferencia</span>
                    <strong>{formatMoney(transferTotal)}</strong>
                  </article>
                  {otherTotal > 0 ? (
                    <article className="shift-stat-box">
                      <span>Otros medios</span>
                      <strong>{formatMoney(otherTotal)}</strong>
                    </article>
                  ) : null}
                </div>
                <p className="muted">Efectivo esperado en caja: {formatMoney(cashSession.expectedAmount)}</p>
                {cashSession.declaredAmount !== null ? (
                  <p className="muted">
                    Efectivo declarado: {formatMoney(cashSession.declaredAmount)} | Diferencia: {formatMoney(cashSession.differenceAmount)}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="muted" style={{ marginBottom: 16 }}>
                Todavía no abriste caja en este turno.
              </p>
            )}

            {!cashSession ? (
              <div className="shift-placeholder-block" style={{ marginBottom: 18 }}>
                <div>
                  <h5>Abrir caja</h5>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingFloat}
                    onChange={(event) => setOpeningFloat(event.target.value)}
                    placeholder="Fondo inicial"
                  />
                  <textarea
                    value={cashNote}
                    onChange={(event) => setCashNote(event.target.value)}
                    placeholder="Observación opcional"
                    rows={3}
                  />
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => onOpenCashSession({ openingFloat, note: cashNote })}
                      disabled={cashBusy}
                    >
                      {cashBusy ? "Abriendo..." : "Abrir caja"}
                    </button>
                  </div>
                </div>
              </div>
            ) : hasOpenCash ? (
              <div className="shift-placeholder-block" style={{ marginBottom: 18 }}>
                <div>
                  <h5>Cerrar caja</h5>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={closingDeclared}
                    onChange={(event) => setClosingDeclared(event.target.value)}
                    placeholder="Total declarado"
                  />
                  <textarea
                    value={closingNote}
                    onChange={(event) => setClosingNote(event.target.value)}
                    placeholder="Observación de cierre"
                    rows={3}
                  />
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => onCloseCashSession({ declaredAmount: closingDeclared, note: closingNote })}
                      disabled={cashBusy}
                    >
                      {cashBusy ? "Cerrando..." : "Cerrar caja"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

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
                <span>Ventas cerradas</span>
                <strong>{formatMoney(shiftSummary.totalRevenue)}</strong>
              </article>
              <article className="shift-stat-box">
                <span>Cobrado en caja</span>
                <strong>{formatMoney(cashTotal || cashSession?.cashCollectedAmount || 0)}</strong>
              </article>
              <article className="shift-stat-box">
                <span>Cuentas / bancos</span>
                <strong>{formatMoney(digitalTotal)}</strong>
              </article>
              <article className="shift-stat-box">
                <span>Cobrado total</span>
                <strong>{formatMoney(shiftSummary.collectedTotal)}</strong>
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
              <article className="shift-stat-box">
                <span>Pedidos pendientes</span>
                <strong>{shiftSummary.pendingOrdersCount || 0}</strong>
              </article>
            </div>

            <div className="shift-placeholder-block">
              <div>
                <h5>Cobros por medio de pago</h5>
                {paymentTotals.length === 0 ? (
                  <p className="muted">Todavía no hay cobros registrados en la caja.</p>
                ) : (
                  <div className="shift-closed-table-list">
                    {paymentTotals.map((entry) => (
                      <div key={entry.paymentMethod} className="shift-closed-table-row">
                        <strong>{paymentMethodLabel(entry.paymentMethod)}</strong>
                        <span>{entry.paymentsCount} pagos</span>
                        <span>{formatMoney(entry.totalAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
            </div>
          </div>
        </div>

        <aside className="shift-side">
          <div className="menu-editor-card shift-card">
            <div className="section-head">
              <div>
                <h4>Pedidos pendientes de cobro</h4>
                <p className="muted">Quedan abiertos y el próximo turno los encuentra tal como están.</p>
              </div>
            </div>
            {pendingOrders.length === 0 ? (
              <p className="muted">No hay pedidos con saldo pendiente.</p>
            ) : (
              <div className="shift-closed-table-list">
                {pendingOrders.map((order) => {
                  const form = collectForms[order.orderId] || { paymentMethod: "CASH", amount: String(order.balanceDue || 0), note: "" };
                  return (
                    <div key={order.orderId} className="detail-card" style={{ marginBottom: 12 }}>
                      <strong>Mesa {order.tableCode} · Pedido #{order.orderId}</strong>
                      <p className="muted">
                        Total {formatMoney(order.totalAmount)} | Pagado {formatMoney(order.paidAmount)} | Saldo {formatMoney(order.balanceDue)}
                      </p>
                      <select
                        value={form.paymentMethod}
                        onChange={(event) =>
                          setCollectForms((current) => ({
                            ...current,
                            [order.orderId]: { ...current[order.orderId], paymentMethod: event.target.value },
                          }))
                        }
                      >
                        <option value="CASH">Efectivo</option>
                        <option value="CARD">Tarjeta</option>
                        <option value="TRANSFER">Transferencia</option>
                        <option value="OTHER">Otro</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.amount}
                        onChange={(event) =>
                          setCollectForms((current) => ({
                            ...current,
                            [order.orderId]: { ...current[order.orderId], amount: event.target.value },
                          }))
                        }
                      />
                      <textarea
                        value={form.note}
                        onChange={(event) =>
                          setCollectForms((current) => ({
                            ...current,
                            [order.orderId]: { ...current[order.orderId], note: event.target.value },
                          }))
                        }
                        rows={2}
                        placeholder="Nota opcional"
                      />
                      <div className="form-actions">
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={!hasOpenCash || collectingPaymentKey === String(order.orderId)}
                          onClick={() =>
                            onCollectOrderPayment({
                              orderId: order.orderId,
                              paymentMethod: form.paymentMethod,
                              amount: form.amount,
                              note: form.note,
                            })
                          }
                        >
                          {collectingPaymentKey === String(order.orderId) ? "Registrando..." : "Registrar cobro"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="menu-editor-card shift-card">
            <div className="section-head">
              <div>
                <h4>Reglas de cierre</h4>
                <p className="muted">Criterios de seguridad para no cerrar en falso.</p>
              </div>
            </div>
            <ul className="shift-rule-list">
              <li>Seguís operando normal desde Pedidos.</li>
              <li>No se puede cerrar una mesa con deuda pendiente.</li>
              <li>No se puede cerrar el turno con caja abierta.</li>
              <li>Si quedan mesas abiertas, pasan al turno siguiente.</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default ShiftClosurePage;
