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
  if (method === "CARD") return "Tarjeta";
  return "Medio sin definir";
}

function barPaymentConfirmed(message) {
  return String(message || "").toLowerCase().includes("pago confirmado");
}

export function CheckoutPage({
  serviceMode = "RESTAURANTE",
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
  onContinueOrdering,
  onSplitBill,
  onRequestPaymentFlow,
  onSelectPaymentMethod,
  onReportPayment,
  mesaActionBusy = false,
  mesaActionMessage = "",
  mesaPaymentStateMessage = "",
  orderReviewStatus = "",
  mesaBillSplit = null,
  canSplitBill = false,
  canShowPaymentOptions = false,
  canReportSelectedPayment = false,
  selectedPaymentMethod = "",
  paymentOptions = null,
  paymentMethodRequestPending = false,
  paymentMethodRequestResolved = false,
  paymentFlowRequested = false,
  paymentConfirmed = false,
  restaurantCheckoutStatus = "NONE",
  showLiveTotal = true,
  showSessionContext = true,
  barMesaCleared = false,
}) {
  const [noteOpenByKey, setNoteOpenByKey] = useState({});
  const [mesaOpen, setMesaOpen] = useState({
    toSend: true,
    committed: false,
  });
  const isBarMode = serviceMode === "BAR";
  const reviewPending = orderReviewStatus === "PENDING";
  const hasBarOrder = isBarMode && !barMesaCleared && Boolean(lastCreatedOrder?.order_id);
  const barPaymentConfirmedState = barPaymentConfirmed(mesaPaymentStateMessage);
  const showBarHoldAlert = hasBarOrder && !barPaymentConfirmedState;
  const barPaymentFlowActive = isBarMode && paymentFlowRequested && !barMesaCleared && !paymentConfirmed;
  const showBarDraftIntro = isBarMode && !showSessionContext && cartItems.length > 0 && !paymentFlowRequested;
  const showBarClearedState = isBarMode && barMesaCleared && cartItems.length === 0;
  const showBarIntroCallout =
    isBarMode &&
    (
      showSessionContext ||
      showBarDraftIntro ||
      (!barMesaCleared && !hasBarOrder && cartItems.length === 0)
    );
  const showBarPendingStateCard = isBarMode && !showSessionContext && showBarHoldAlert && !barPaymentFlowActive;
  const showBarInlineMessage = !isBarMode;
  const showRestaurantPaymentCard =
    !isBarMode &&
    (canShowPaymentOptions ||
      paymentConfirmed ||
      Boolean(selectedPaymentMethod) ||
      paymentMethodRequestPending ||
      paymentMethodRequestResolved ||
      Boolean(mesaPaymentStateMessage));
  const cashSelected = selectedPaymentMethod === "CASH";
  const transferSelected = selectedPaymentMethod === "TRANSFER";
  const posnetSelected = ["CARD", "MERCADO_PAGO", "MODO"].includes(selectedPaymentMethod);
  const enabledPaymentOptions = {
    cash: paymentOptions?.cash ?? true,
    transfer: paymentOptions?.transfer ?? true,
    card: paymentOptions?.card ?? true,
    mercadoPago: paymentOptions?.mercadoPago ?? true,
    modo: paymentOptions?.modo ?? true,
  };
  const paymentStageTitle = paymentConfirmed
    ? "Pago confirmado"
    : reviewPending
    ? "Pedido en revision"
    : cashSelected && paymentFlowRequested
    ? "Cobro en efectivo en curso"
    : transferSelected && paymentMethodRequestResolved
    ? "Transferencia habilitada"
    : posnetSelected && paymentMethodRequestResolved
    ? "Posnet en camino"
    : paymentFlowRequested
    ? "¿Con que vas a pagar?"
    : "Esperando aprobacion del pedido";
  const paymentStageCopy = paymentConfirmed
    ? "Cobro confirmado, el local ya tiene el pedido. Te vamos a ir avisando."
    : reviewPending
    ? "El staff esta revisando si puede tomar tu pedido completo. Cuando lo acepte, se habilita el pago."
    : cashSelected && paymentFlowRequested
    ? "Ya avisamos al staff para cobrar en efectivo. Cuando retiren el pago, ellos mismos lo van a confirmar desde caja."
    : transferSelected && paymentMethodRequestResolved
    ? "El staff ya habilito la transferencia. Segui los datos del local y despues avisanos cuando la hagas."
    : posnetSelected && paymentMethodRequestResolved
    ? "El staff ya habilito este medio. Enseguida se acerca alguien con el posnet para cobrarte."
    : paymentFlowRequested
    ? "Elegi el medio de pago para que el staff te habilite el paso siguiente."
    : "Esperando que el staff tome o rechace este pedido.";

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

  useEffect(() => {
    if (!showBarClearedState) return;
    setMesaOpen((current) => ({ ...current, committed: true }));
  }, [showBarClearedState]);

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
        <h2>{showSessionContext ? "Confirmar pedido" : "Resumen de tu mesa"}</h2>
        <span className="muted">{showSessionContext ? cartItems.length : committedItems.length + cartItems.length} lineas</span>
      </div>

      {showBarIntroCallout && (
        <article className="bar-payment-callout">
          <div className="bar-payment-callout-head">
            <span className="bar-payment-pill">BAR PREPAGO</span>
            <strong>{showBarHoldAlert ? "Pedido retenido hasta pagar" : "Pago requerido antes de preparar"}</strong>
          </div>
          <p className="bar-payment-copy">
            Tu pedido no entra en preparación automáticamente. Primero tenés que avanzar al pago y después el staff lo confirma.
          </p>
          <div className="bar-payment-steps">
            <span>1. Pedí</span>
            <span>2. Pagá</span>
            <span>3. Se activa</span>
          </div>
        </article>
      )}

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
            {showBarClearedState && (
              <div className="mesa-block">
                <article className="table-payment-card">
                  <span className="table-payment-kicker">PEDIDO TOMADO</span>
                  <h3>Mesa lista para pedir de nuevo</h3>
                  <p>El seguimiento queda en Notis. Lo que ya pediste sigue visible abajo hasta que el staff cierre la mesa.</p>
                </article>
              </div>
            )}
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
                        <article
                          className="table-consumption-row"
                          key={`committed-${item.item_id ?? item.id ?? `${item.order_id}-${item.product_name}`}`}
                        >
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
            <strong>{toMoney(cartTotal)}</strong>
          </div>

          {checkoutError && <p className="error-text">{checkoutError}</p>}

          <button className="btn-primary btn-full" disabled={submittingOrder}>
            {submittingOrder ? "Enviando..." : "Enviar pedido"}
          </button>
        </form>
      ) : (
        <form className="checkout-form mesa-actions" onSubmit={submit}>
          {showRestaurantPaymentCard && (
            <article className="table-payment-card">
              <span className="table-payment-kicker">CIERRE DE MESA</span>
              <h3>{paymentStageTitle}</h3>
              <p>{paymentStageCopy}</p>
            </article>
          )}
          {!showBarClearedState && showBarPendingStateCard && (
            <article className="bar-payment-state-card">
              <span className="bar-payment-pill">ATENCION</span>
              <h3>{reviewPending ? "Tu pedido está siendo revisado" : "Tu pedido está esperando pago"}</h3>
              <p>
                {reviewPending
                  ? "El staff tiene que aceptar o rechazar este pedido completo antes de habilitar el pago."
                  : "Hasta que el pago quede reportado y confirmado, el pedido no entra en preparación."}
              </p>
              {!reviewPending ? null : <p className="muted">Cuando el staff lo acepte, vas a ver los medios de pago aca.</p>}
            </article>
          )}
          {showBarClearedState ? (
            <div className="mesa-flow-inline-wrap">
              <button type="button" className="mesa-return-bar" onClick={onContinueOrdering}>
                <span className="mesa-return-kicker">Menu</span>
                <strong>Seguir pidiendo</strong>
              </button>
            </div>
          ) : cartItems.length > 0 ? (
            <div className="mesa-flow-inline-wrap">
              <div className="mesa-flow-bar">
                <div className="mesa-flow-copy">
                  <span className="mesa-flow-kicker">Pedido en curso</span>
                  <strong>{cartItems.length} linea{cartItems.length === 1 ? "" : "s"} por enviar</strong>
                </div>
                <div className="mesa-flow-actions">
                  <button type="button" className="mesa-flow-btn mesa-flow-btn-secondary" onClick={onContinueOrdering}>
                    Seguir pidiendo
                  </button>
                  <button
                    type="button"
                    className="mesa-flow-btn mesa-flow-btn-primary"
                    onClick={onSubmitOrder}
                    disabled={submittingOrder}
                  >
                    {submittingOrder ? "Enviando..." : "Pedir ahora"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mesa-flow-inline-wrap">
              <button type="button" className="mesa-return-bar" onClick={onContinueOrdering}>
                <span className="mesa-return-kicker">Menu</span>
                <strong>Seguir pidiendo</strong>
              </button>
            </div>
          )}

          {!isBarMode && (
            <>
              <div className="summary mesa-summary">
                <span>Total ya pedido</span>
                <strong>{toMoney(committedTotal)}</strong>
              </div>
              <div className="summary mesa-summary mesa-summary-grand">
                <span>Total mesa</span>
                <strong>{toMoney(mesaGrandTotal)}</strong>
              </div>
              {canSplitBill && (
                <p className="muted">
                  Conectados en la mesa: <strong>{connectedClients}</strong>
                </p>
              )}
              {!canShowPaymentOptions && !paymentConfirmed && orderReviewStatus === "APPROVED" && committedItems.length > 0 && (
                restaurantCheckoutStatus === "REQUESTED" ? (
                  <p className="muted">Cuenta solicitada. Esperando que el staff habilite el cierre.</p>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-full"
                    onClick={onRequestPaymentFlow}
                    disabled={mesaActionBusy}
                  >
                    Pedir la cuenta
                  </button>
                )
              )}
              {mesaBillSplit?.mode === "EQUAL" && (mesaBillSplit.parts || []).length > 1 && (
                <p className="muted">
                  Cuenta dividida en <strong>{mesaBillSplit.parts.length}</strong> partes iguales.
                </p>
              )}
            </>
          )}
          {!showBarClearedState && canShowPaymentOptions && (
            <div className="detail-card bar-payment-detail-card">
              <h3>{isBarMode ? "Paso 2: como queres pagar" : "Elegi el medio para cerrar la mesa"}</h3>
              {!isBarMode && (
                <p className="muted">
                  El cierre ya fue iniciado. Ahora resolvé el pago para que el staff lo valide.
                </p>
              )}
              <div className="order-actions">
                {enabledPaymentOptions.cash && (
                  <button
                    type="button"
                    className={selectedPaymentMethod === "CASH" ? "btn-primary" : "btn-secondary"}
                    onClick={() => onSelectPaymentMethod?.("CASH")}
                    disabled={mesaActionBusy}
                  >
                    Efectivo en mesa
                  </button>
                )}
                {enabledPaymentOptions.mercadoPago && (
                  <button
                    type="button"
                    className={selectedPaymentMethod === "MERCADO_PAGO" ? "btn-primary" : "btn-secondary"}
                    onClick={() => onSelectPaymentMethod?.("MERCADO_PAGO")}
                    disabled={mesaActionBusy}
                  >
                    Mercado Pago
                  </button>
                )}
                {enabledPaymentOptions.modo && (
                  <button
                    type="button"
                    className={selectedPaymentMethod === "MODO" ? "btn-primary" : "btn-secondary"}
                    onClick={() => onSelectPaymentMethod?.("MODO")}
                    disabled={mesaActionBusy}
                  >
                    MODO
                  </button>
                )}
                {enabledPaymentOptions.card && (
                  <button
                    type="button"
                    className={selectedPaymentMethod === "CARD" ? "btn-primary" : "btn-secondary"}
                    onClick={() => onSelectPaymentMethod?.("CARD")}
                    disabled={mesaActionBusy}
                  >
                    Tarjeta
                  </button>
                )}
                {enabledPaymentOptions.transfer && (
                  <button
                    type="button"
                    className={selectedPaymentMethod === "TRANSFER" ? "btn-primary" : "btn-secondary"}
                    onClick={() => onSelectPaymentMethod?.("TRANSFER")}
                    disabled={mesaActionBusy}
                  >
                    Transferencia
                  </button>
                )}
                {canSplitBill && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onSplitBill}
                    disabled={mesaActionBusy}
                  >
                    Dividir cuenta
                  </button>
                )}
              </div>
              {selectedPaymentMethod && (
                <p className="muted">
                  Medio elegido para esta cuenta: <strong>{paymentMethodLabel(selectedPaymentMethod)}</strong>
                </p>
              )}
              {cashSelected ? (
                <div className="table-payment-waiting-box">
                  <strong>Esperando confirmacion del staff</strong>
                  <p>
                    Cuando retiren el efectivo y lo registren en caja, vas a ver la confirmacion aca.
                  </p>
                </div>
              ) : selectedPaymentMethod ? (
                paymentMethodRequestResolved ? (
                  <button type="button" className="btn-primary btn-full" onClick={onReportPayment} disabled={mesaActionBusy || !canReportSelectedPayment}>
                    {mesaActionBusy
                      ? "Procesando..."
                      : transferSelected
                      ? "Ya hice la transferencia"
                      : "Ya me cobraron"}
                  </button>
                ) : (
                  <div className="table-payment-waiting-box">
                    <strong>Esperando respuesta del staff</strong>
                    <p>
                      {paymentMethodRequestPending
                        ? "El staff tiene que habilitar este medio antes de seguir."
                        : "Elegiste un medio. En cuanto el staff lo habilite, seguís desde aca."}
                    </p>
                  </div>
                )
              ) : (
                <p className="muted">Elegi primero el medio de pago para continuar.</p>
              )}
            </div>
          )}
          {mesaActionMessage && showBarInlineMessage ? <p className={isBarMode ? "bar-payment-inline-note" : "muted"}>{mesaActionMessage}</p> : null}
          {mesaPaymentStateMessage && mesaPaymentStateMessage !== mesaActionMessage && showBarInlineMessage ? (
            <p className={isBarMode ? "bar-payment-inline-note" : "muted"}>{mesaPaymentStateMessage}</p>
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
      {!showSessionContext && lastCreatedOrder && !barMesaCleared && !isBarMode && (
        <div className={isBarMode ? "success-box mesa-success success-box-bar" : "success-box mesa-success"}>
          <p>
            Ultimo pedido enviado: <strong>#{lastCreatedOrder.order_id}</strong>
          </p>
          {isBarMode && !paymentConfirmed && <p>Ahora avanza al pago para que el pedido se active.</p>}
          {isBarMode && paymentConfirmed && <p>Cobro confirmado. El local ya tomo tu pedido y te vamos a ir avisando.</p>}
        </div>
      )}
    </section>
  );
}
