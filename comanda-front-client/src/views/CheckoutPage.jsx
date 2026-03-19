import { useEffect, useMemo, useState } from "react";

const SECTOR_ORDER = {
  WAITER: 0,
  BAR: 1,
  KITCHEN: 2,
};

function sectorLabel(sector) {
  if (sector === "WAITER") return "Mozo";
  if (sector === "BAR") return "Bar";
  if (sector === "KITCHEN") return "Cocina";
  return "Otros";
}

function toMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function paymentMethodLabel(method) {
  if (method === "CASH") return "Efectivo";
  if (method === "MERCADO_PAGO") return "Mercado Pago";
  if (method === "MODO") return "MODO";
  if (method === "TRANSFER") return "Transferencia";
  return "Medio sin definir";
}

export function CheckoutPage({
  tableCode,
  guestCount,
  cartItems,
  cartTotal,
  committedItems = [],
  committedTotal = 0,
  mesaGrandTotal = 0,
  connectedClients = 1,
  checkoutError,
  submittingOrder,
  lastCreatedOrder,
  onOpenAdjustGuests,
  onUpdateCartQty,
  onUpdateCartNotes,
  onRemoveCartItem,
  onIncrementCartItem,
  onDecrementCartItem,
  onIncrementProductInCart,
  onDecrementProductInCart,
  onRemoveProductFromCart,
  onSubmitOrder,
  onGoToTracking,
  onRequestTableBill,
  onSplitBill,
  onSelectPaymentMethod,
  onReportPayment,
  mesaActionBusy = false,
  mesaActionMessage = "",
  mesaPaymentStateMessage = "",
  mesaBillSplit = null,
  canSplitBill = false,
  canShowPaymentOptions = false,
  selectedPaymentMethod = "",
  paymentHelpMessage = "",
  showLiveTotal = true,
  showSessionContext = true,
}) {
  const [noteOpenByKey, setNoteOpenByKey] = useState({});
  const [mesaOpen, setMesaOpen] = useState({
    toSend: true,
    committed: false,
  });

  useEffect(() => {
    setNoteOpenByKey((current) => {
      const next = {};
      cartItems.forEach((item) => {
        if (current[item.key] || String(item.notes || "").trim()) {
          next[item.key] = true;
        }
      });
      return next;
    });
  }, [cartItems]);

  const submit = (e) => {
    e.preventDefault();
    onSubmitOrder();
  };

  const groupedCartItems = useMemo(() => {
    const grouped = new Map();
    cartItems.forEach((item) => {
      const groupKey = String(item.product_id ?? item.product_name ?? item.key);
      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          group_key: groupKey,
          product_id: item.product_id,
          product_name: item.product_name,
          sector: item.sector,
          qty: Number(item.qty || 0),
          line_total: Number(item.unit_price || 0) * Number(item.qty || 0),
          notes: String(item.notes || "").trim(),
        });
        return;
      }
      existing.qty += Number(item.qty || 0);
      existing.line_total += Number(item.unit_price || 0) * Number(item.qty || 0);
      if (!existing.notes && String(item.notes || "").trim()) {
        existing.notes = String(item.notes || "").trim();
      }
    });
    return Array.from(grouped.values()).sort((a, b) => {
      const aOrder = SECTOR_ORDER[a.sector] ?? 99;
      const bOrder = SECTOR_ORDER[b.sector] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.product_name || "").localeCompare(String(b.product_name || ""), "es");
    });
  }, [cartItems]);

  const groupedBySector = useMemo(() => {
    const map = new Map();
    groupedCartItems.forEach((item) => {
      const sector = item.sector || "OTHER";
      if (!map.has(sector)) map.set(sector, []);
      map.get(sector).push(item);
    });
    return Array.from(map.entries()).sort(
      ([a], [b]) => (SECTOR_ORDER[a] ?? 99) - (SECTOR_ORDER[b] ?? 99)
    );
  }, [groupedCartItems]);

  return (
    <section className="panel checkout-panel">
      <div className="section-head">
        <h2>{showSessionContext ? "Confirmar pedido" : "Consumo de mesa"}</h2>
        <span className="muted">{showSessionContext ? cartItems.length : committedItems.length + cartItems.length} lineas</span>
      </div>

      {showSessionContext && cartItems.length === 0 ? (
        <p className="muted">
          {showSessionContext
            ? "Tu carrito esta vacio. Agrega productos desde el menu."
            : "Todavia no hay consumo cargado en esta mesa."}
        </p>
      ) : (
        showSessionContext ? (
          <div className="cart-list">
            {cartItems.map((item) => (
              <article className="cart-item" key={item.key}>
                <div className="cart-item-top-row">
                  <h3 className="cart-item-name">{item.product_name}</h3>
                  <p className="cart-item-price">{showLiveTotal ? toMoney(item.unit_price) : "-"}</p>
                </div>
                <p className="muted cart-item-meta">
                  {item.variant_name ? `${item.variant_name} | ` : ""}
                  {item.sector}
                </p>
                <div className="cart-item-controls-row">
                  <label className="field cart-qty-inline">
                    Cantidad
                    <input
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(e) => onUpdateCartQty(item.key, e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary cart-note-toggle"
                    onClick={() =>
                      setNoteOpenByKey((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }))
                    }
                  >
                    {noteOpenByKey[item.key] ? "Ocultar nota" : "Agregar nota"}
                  </button>
                  <button className="btn-link" onClick={() => onRemoveCartItem(item.key)}>
                    Quitar
                  </button>
                </div>
                {noteOpenByKey[item.key] && (
                  <label className="field">
                    Nota
                    <input
                      placeholder="Ej: sin cebolla"
                      value={item.notes || ""}
                      onChange={(e) => onUpdateCartNotes(item.key, e.target.value)}
                    />
                  </label>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="mesa-sections">
            <div className="mesa-block">
              <button
                type="button"
                className="mesa-block-head mesa-accordion-trigger"
                onClick={() => setMesaOpen((current) => ({ ...current, toSend: !current.toSend }))}
                aria-expanded={mesaOpen.toSend}
              >
                <h3>Por enviar ahora</h3>
                <span className="muted">
                  {cartItems.length} lineas {mesaOpen.toSend ? "▾" : "▸"}
                </span>
              </button>
              {mesaOpen.toSend && (
                <>
                  {cartItems.length === 0 ? (
                    <p className="muted">No hay productos seleccionados para enviar.</p>
                  ) : (
                    <div className="table-consumption-list">
                      {groupedBySector.map(([sector, items]) => (
                        <div className="sector-group-compact" key={sector}>
                          <p className="sector-group-title">{sectorLabel(sector)}</p>
                          {items.map((item) => (
                            <article className="table-consumption-row" key={item.group_key}>
                              <div className="table-consumption-main">
                                <h3 className="table-consumption-name">{item.product_name}</h3>
                                <div className="table-consumption-values">
                                  <span className="table-consumption-qty">x{item.qty}</span>
                                  {showLiveTotal && (
                                    <strong className="table-consumption-line">{toMoney(item.line_total)}</strong>
                                  )}
                                </div>
                              </div>
                              <div className="cart-item-controls-row">
                                <button
                                  type="button"
                                  className="btn-secondary qty-btn"
                                  onClick={() => onDecrementProductInCart?.(item.product_id)}
                                >
                                  -
                                </button>
                                <span className="menu-qty-pill menu-qty-pill-active">{item.qty}</span>
                                <button
                                  type="button"
                                  className="btn-secondary qty-btn"
                                  onClick={() => onIncrementProductInCart?.(item.product_id)}
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  className="btn-link"
                                  onClick={() => onRemoveProductFromCart?.(item.product_id)}
                                >
                                  Quitar
                                </button>
                              </div>
                              {String(item.notes || "").trim() ? (
                                <p className="table-consumption-note">
                                  <strong>Aclaracion:</strong> {item.notes}
                                </p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {checkoutError && <p className="error-text">{checkoutError}</p>}
                  <button
                    className="btn-primary btn-full mesa-submit"
                    disabled={submittingOrder || cartItems.length === 0}
                    onClick={onSubmitOrder}
                    type="button"
                  >
                    {submittingOrder ? "Enviando..." : "Pedir ahora"}
                  </button>
                </>
              )}
            </div>

            <div className="mesa-block">
              <button
                type="button"
                className="mesa-block-head mesa-accordion-trigger"
                onClick={() => setMesaOpen((current) => ({ ...current, committed: !current.committed }))}
                aria-expanded={mesaOpen.committed}
              >
                <h3>Ya pedido</h3>
                <span className="muted">
                  {committedItems.length} lineas {mesaOpen.committed ? "▾" : "▸"}
                </span>
              </button>
              {mesaOpen.committed && (
                <>
                  {committedItems.length === 0 ? (
                    <p className="muted">Todavia no hay consumo confirmado en esta mesa.</p>
                  ) : (
                    <div className="table-consumption-list">
                      {committedItems.map((item) => (
                        <article className="table-consumption-row" key={`committed-${item.id}`}>
                          <div className="table-consumption-main">
                            <h3 className="table-consumption-name">{item.product_name}</h3>
                            <div className="table-consumption-values">
                              {showLiveTotal && <span className="table-consumption-unit">{toMoney(item.unit_price)}</span>}
                              <span className="table-consumption-qty">x{item.qty}</span>
                              {showLiveTotal && (
                                <strong className="table-consumption-line">{toMoney(item.unit_price * item.qty)}</strong>
                              )}
                            </div>
                          </div>
                          {String(item.notes || "").trim() ? (
                            <p className="table-consumption-note">
                              <strong>Aclaracion:</strong> {item.notes}
                            </p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )
      )}

      {showSessionContext ? (
        <form className="checkout-form" onSubmit={submit}>
          <div className="checkout-context">
            <p className="muted checkout-context-line">
              Mesa: <strong>{tableCode || "-"}</strong>
            </p>
            <p className="muted checkout-context-line">
              Personas: <strong>{guestCount}</strong>
            </p>
            <button type="button" className="btn-secondary" onClick={onOpenAdjustGuests}>
              Ajustar personas
            </button>
          </div>

          <div className="summary">
            <span>Total</span>
            <strong>{showLiveTotal ? toMoney(cartTotal) : "Oculto por el local"}</strong>
          </div>

          {checkoutError && <p className="error-text">{checkoutError}</p>}

          <button className="btn-primary btn-full" disabled={submittingOrder}>
            {submittingOrder ? "Enviando..." : "Enviar pedido"}
          </button>
        </form>
      ) : (
        <form className="checkout-form mesa-actions" onSubmit={submit}>
          <div className="summary mesa-summary">
            <span>Total ya pedido</span>
            <strong>{showLiveTotal ? toMoney(committedTotal) : "Oculto por el local"}</strong>
          </div>
          <div className="summary mesa-summary mesa-summary-grand">
            <span>Total mesa</span>
            <strong>{showLiveTotal ? toMoney(mesaGrandTotal) : "Oculto por el local"}</strong>
          </div>
          <div className="mesa-final-actions">
            <button
              type="button"
              className="btn-primary btn-full"
              onClick={onRequestTableBill}
              disabled={mesaActionBusy}
            >
              {mesaActionBusy ? "Procesando..." : "Pagar"}
            </button>
            {canSplitBill && (
              <button
                type="button"
                className="btn-secondary btn-full"
                onClick={onSplitBill}
                disabled={mesaActionBusy}
              >
                {mesaActionBusy ? "Procesando..." : "Dividir cuenta"}
              </button>
            )}
          </div>
          {canSplitBill && (
            <p className="muted">
              Conectados en la mesa: <strong>{connectedClients}</strong>
            </p>
          )}
          {mesaBillSplit?.mode === "EQUAL" && (mesaBillSplit.parts || []).length > 1 && (
            <p className="muted">
              Cuenta dividida en <strong>{mesaBillSplit.parts.length}</strong> partes iguales.
            </p>
          )}
          {canShowPaymentOptions && (
            <div className="detail-card">
              <h3>Como queres pagar</h3>
              {paymentHelpMessage ? <p className="toast-ok">{paymentHelpMessage}</p> : null}
              <div className="order-actions">
                <button
                  type="button"
                  className={selectedPaymentMethod === "CASH" ? "btn-primary" : "btn-secondary"}
                  onClick={() => onSelectPaymentMethod?.("CASH")}
                  disabled={mesaActionBusy}
                >
                  Llamar al mozo para efectivo
                </button>
                <button
                  type="button"
                  className={selectedPaymentMethod === "MERCADO_PAGO" ? "btn-primary" : "btn-secondary"}
                  onClick={() => onSelectPaymentMethod?.("MERCADO_PAGO")}
                  disabled={mesaActionBusy}
                >
                  Mercado Pago
                </button>
                <button
                  type="button"
                  className={selectedPaymentMethod === "MODO" ? "btn-primary" : "btn-secondary"}
                  onClick={() => onSelectPaymentMethod?.("MODO")}
                  disabled={mesaActionBusy}
                >
                  MODO
                </button>
                <button
                  type="button"
                  className={selectedPaymentMethod === "TRANSFER" ? "btn-primary" : "btn-secondary"}
                  onClick={() => onSelectPaymentMethod?.("TRANSFER")}
                  disabled={mesaActionBusy}
                >
                  Transferencia
                </button>
              </div>
              {selectedPaymentMethod && (
                <p className="muted">
                  Medio elegido: <strong>{paymentMethodLabel(selectedPaymentMethod)}</strong>
                </p>
              )}
              <button type="button" className="btn-primary btn-full" onClick={onReportPayment} disabled={mesaActionBusy}>
                {mesaActionBusy ? "Procesando..." : "Ya pague"}
              </button>
            </div>
          )}
          {mesaActionMessage ? <p className="muted">{mesaActionMessage}</p> : null}
          {mesaPaymentStateMessage && mesaPaymentStateMessage !== mesaActionMessage ? (
            <p className="muted">{mesaPaymentStateMessage}</p>
          ) : null}
        </form>
      )}

      {showSessionContext && lastCreatedOrder && (
        <div className="success-box">
          <p>
            Pedido creado: <strong>#{lastCreatedOrder.order_id}</strong>
          </p>
          <p>
            Ticket: <strong>{lastCreatedOrder.ticket_number}</strong>
          </p>
          {onGoToTracking && (
            <button type="button" className="btn-secondary" onClick={onGoToTracking}>
              Ver seguimiento
            </button>
          )}
        </div>
      )}
      {!showSessionContext && lastCreatedOrder && (
        <div className="success-box mesa-success">
          <p>
            Ultimo pedido enviado: <strong>#{lastCreatedOrder.order_id}</strong>
          </p>
        </div>
      )}
    </section>
  );
}
