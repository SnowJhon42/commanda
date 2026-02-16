function toMoney(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

export function CheckoutPage({
  tableCode,
  guestCount,
  cartItems,
  cartTotal,
  checkoutError,
  submittingOrder,
  lastCreatedOrder,
  onTableCodeChange,
  onGuestCountChange,
  onUpdateCartQty,
  onUpdateCartNotes,
  onRemoveCartItem,
  onSubmitOrder,
}) {
  const submit = (e) => {
    e.preventDefault();
    onSubmitOrder();
  };

  return (
    <section className="panel">
      <div className="section-head">
        <h2>Checkout</h2>
        <span className="muted">{cartItems.length} items</span>
      </div>

      {cartItems.length === 0 ? (
        <p className="muted">Tu carrito esta vacio. Agrega productos desde el menu.</p>
      ) : (
        <div className="cart-list">
          {cartItems.map((item) => (
            <article className="cart-item" key={item.key}>
              <div className="cart-item-head">
                <h3>{item.product_name}</h3>
                <button className="btn-link" onClick={() => onRemoveCartItem(item.key)}>
                  Quitar
                </button>
              </div>
              <p className="muted">
                {item.variant_name ? `${item.variant_name} · ` : ""}
                {item.sector} · {toMoney(item.unit_price)}
              </p>
              <div className="row">
                <label className="field qty-field">
                  Cantidad
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => onUpdateCartQty(item.key, e.target.value)}
                  />
                </label>
                <label className="field grow-field">
                  Nota
                  <input
                    placeholder="Ej: sin cebolla"
                    value={item.notes || ""}
                    onChange={(e) => onUpdateCartNotes(item.key, e.target.value)}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}

      <form className="checkout-form" onSubmit={submit}>
        <div className="row">
          <label className="field">
            Mesa
            <input
              value={tableCode}
              onChange={(e) => onTableCodeChange(e.target.value)}
              placeholder="M1"
            />
          </label>
          <label className="field">
            Comensales
            <input
              type="number"
              min="1"
              value={guestCount}
              onChange={(e) => onGuestCountChange(Number(e.target.value) || 1)}
            />
          </label>
        </div>

        <div className="summary">
          <span>Total</span>
          <strong>{toMoney(cartTotal)}</strong>
        </div>

        {checkoutError && <p className="error-text">{checkoutError}</p>}

        <button className="btn-primary btn-full" disabled={submittingOrder}>
          {submittingOrder ? "Enviando..." : "Confirmar pedido"}
        </button>
      </form>

      {lastCreatedOrder && (
        <div className="success-box">
          <p>
            Pedido creado: <strong>#{lastCreatedOrder.order_id}</strong>
          </p>
          <p>
            Ticket: <strong>{lastCreatedOrder.ticket_number}</strong>
          </p>
        </div>
      )}
    </section>
  );
}
