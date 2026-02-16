import { useEffect, useMemo, useState } from "react";
import { createOrder, fetchMenu } from "./api/clientApi";
import { MenuPage } from "./pages/MenuPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { OrderTrackingPage } from "./pages/OrderTrackingPage";

const DEFAULT_STORE_ID = 1;

function cartKey(productId, variantId) {
  return `${productId}:${variantId ?? "none"}`;
}

export function App() {
  const [storeId] = useState(DEFAULT_STORE_ID);
  const [tableCode, setTableCode] = useState("M1");
  const [guestCount, setGuestCount] = useState(2);

  const [menu, setMenu] = useState(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");

  const [cartItems, setCartItems] = useState([]);
  const [checkoutError, setCheckoutError] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [lastCreatedOrder, setLastCreatedOrder] = useState(null);
  const [activeOrderId, setActiveOrderId] = useState(null);

  const loadMenu = async () => {
    setMenuLoading(true);
    setMenuError("");
    try {
      const payload = await fetchMenu(storeId);
      setMenu(payload);
    } catch (error) {
      setMenuError(error.message || "No se pudo cargar el menu.");
    } finally {
      setMenuLoading(false);
    }
  };

  useEffect(() => {
    loadMenu();
  }, [storeId]);

  const cartTotal = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.unit_price * item.qty, 0),
    [cartItems]
  );

  const addToCart = ({ product, variant, qty }) => {
    setCheckoutError("");
    const quantity = Number(qty);
    if (!quantity || quantity < 1) return;

    const extra = variant ? Number(variant.extra_price) : 0;
    const price = Number(product.base_price) + extra;
    const key = cartKey(product.id, variant?.id);

    setCartItems((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) =>
          item.key === key ? { ...item, qty: item.qty + quantity } : item
        );
      }
      return [
        ...current,
        {
          key,
          product_id: product.id,
          variant_id: variant?.id ?? null,
          product_name: product.name,
          variant_name: variant?.name ?? null,
          unit_price: price,
          qty: quantity,
          notes: "",
          sector: product.fulfillment_sector,
        },
      ];
    });
  };

  const updateCartQty = (key, qty) => {
    const quantity = Number(qty);
    if (!quantity || quantity < 1) return;
    setCartItems((current) => current.map((item) => (item.key === key ? { ...item, qty: quantity } : item)));
  };

  const updateCartNotes = (key, notes) => {
    setCartItems((current) => current.map((item) => (item.key === key ? { ...item, notes } : item)));
  };

  const removeCartItem = (key) => {
    setCartItems((current) => current.filter((item) => item.key !== key));
  };

  const submitOrder = async () => {
    setCheckoutError("");
    if (cartItems.length === 0) {
      setCheckoutError("Agrega al menos un item al carrito.");
      return;
    }
    if (!tableCode.trim()) {
      setCheckoutError("Ingresa una mesa valida.");
      return;
    }
    if (!guestCount || Number(guestCount) < 1) {
      setCheckoutError("La cantidad de comensales debe ser mayor a 0.");
      return;
    }

    const payload = {
      tenant_id: 1,
      store_id: storeId,
      table_code: tableCode.trim().toUpperCase(),
      guest_count: Number(guestCount),
      items: cartItems.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        qty: item.qty,
        notes: item.notes?.trim() || undefined,
      })),
    };

    setSubmittingOrder(true);
    try {
      const created = await createOrder(payload);
      setLastCreatedOrder(created);
      setActiveOrderId(created.order_id);
      setCartItems([]);
    } catch (error) {
      setCheckoutError(error.message || "No se pudo crear el pedido.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Mesa digital</p>
        <h1>Comanda Cliente</h1>
        <p className="muted">Pedido por mesa con seguimiento en vivo.</p>
      </header>

      <MenuPage
        menu={menu}
        loading={menuLoading}
        error={menuError}
        onRetry={loadMenu}
        onAddToCart={addToCart}
      />

      <CheckoutPage
        tableCode={tableCode}
        guestCount={guestCount}
        cartItems={cartItems}
        cartTotal={cartTotal}
        checkoutError={checkoutError}
        submittingOrder={submittingOrder}
        lastCreatedOrder={lastCreatedOrder}
        onTableCodeChange={setTableCode}
        onGuestCountChange={setGuestCount}
        onUpdateCartQty={updateCartQty}
        onUpdateCartNotes={updateCartNotes}
        onRemoveCartItem={removeCartItem}
        onSubmitOrder={submitOrder}
      />

      <OrderTrackingPage orderId={activeOrderId} />
    </main>
  );
}
