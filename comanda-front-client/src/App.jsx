"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchMenu,
  submitTableSessionFeedback,
  fetchTableSessionState,
  joinTableSession,
  openTableSession,
  openTableSessionEvents,
  upsertOrderByTable,
} from "./api/clientApi";
import { MenuPage } from "./views/MenuPage";
import { CheckoutPage } from "./views/CheckoutPage";
import { OrderTrackingPage } from "./views/OrderTrackingPage";
import { SessionClosedFeedbackPage } from "./views/SessionClosedFeedbackPage";
import { EntryGatePage } from "./views/EntryGatePage";
import { AdjustGuestsModal } from "./views/AdjustGuestsModal";

const DEFAULT_STORE_ID = 1;
const SESSION_STATE_KEY = "comanda_client_session_state_v1";
const MIN_GUESTS = 1;
const MAX_GUESTS = 20;

function normalizeTableCode(input) {
  if (typeof input !== "string") return null;
  const compact = input.trim().toUpperCase().replace(/\s+/g, "");
  const match = compact.match(/^M?(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value < 1) return null;
  return `M${value}`;
}

function validateGuestCount(input) {
  const value = Number(input);
  if (!Number.isInteger(value)) {
    return { ok: false, error: "Ingresa una cantidad entera de personas." };
  }
  if (value < MIN_GUESTS || value > MAX_GUESTS) {
    return { ok: false, error: `La cantidad debe estar entre ${MIN_GUESTS} y ${MAX_GUESTS}.` };
  }
  return { ok: true, value };
}

function cartKey(productId, variantId) {
  return `${productId}:${variantId ?? "none"}`;
}

function getStableClientId() {
  if (typeof window === "undefined") return `client-${Date.now()}`;
  const key = "comanda_client_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const generated = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `client-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  window.localStorage.setItem(key, generated);
  return generated;
}

export function App() {
  const [storeId] = useState(DEFAULT_STORE_ID);
  const [clientId] = useState(getStableClientId);
  const [tableCode, setTableCode] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [entryValidated, setEntryValidated] = useState(false);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entryErrors, setEntryErrors] = useState({ table: "", guests: "" });

  const [menu, setMenu] = useState(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");

  const [cartItems, setCartItems] = useState([]);
  const [checkoutError, setCheckoutError] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [lastCreatedOrder, setLastCreatedOrder] = useState(null);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [tableSessionId, setTableSessionId] = useState(null);
  const [connectedClients, setConnectedClients] = useState(1);
  const [uiToast, setUiToast] = useState("");
  const [closedSession, setClosedSession] = useState(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [isAdjustGuestsOpen, setIsAdjustGuestsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tableFromUrl = normalizeTableCode(urlParams.get("mesa") || "");
      const raw = window.localStorage.getItem(SESSION_STATE_KEY);
      const saved = raw ? JSON.parse(raw) : {};

      const normalizedTable = tableFromUrl || normalizeTableCode(saved.tableCode);
      if (normalizedTable) {
        setTableCode(normalizedTable);
      }
      const guestsValidation = validateGuestCount(saved.guestCount);
      if (guestsValidation.ok) {
        setGuestCount(guestsValidation.value);
      }
      if (Number(saved.tableSessionId) > 0) setTableSessionId(Number(saved.tableSessionId));
      if (Number(saved.activeOrderId) > 0) setActiveOrderId(Number(saved.activeOrderId));
      if (Number(saved.connectedClients) > 0) setConnectedClients(Number(saved.connectedClients));
      if (saved.closedSession?.tableSessionId && saved.closedSession?.tableCode) {
        setClosedSession({
          tableSessionId: Number(saved.closedSession.tableSessionId),
          tableCode: String(saved.closedSession.tableCode),
        });
      }
      // Gate obligatorio al abrir: siempre inicia en bienvenida.
      setEntryValidated(false);
    } catch {
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      tableCode,
      guestCount,
      tableSessionId,
      activeOrderId,
      connectedClients,
      closedSession,
    };
    try {
      window.localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(payload));
    } catch {
    }
  }, [tableCode, guestCount, tableSessionId, activeOrderId, connectedClients, closedSession]);

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

  const productQtyInCart = useMemo(() => {
    const map = {};
    cartItems.forEach((item) => {
      map[item.product_id] = (map[item.product_id] || 0) + item.qty;
    });
    return map;
  }, [cartItems]);

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
    setUiToast(`Agregado: ${product.name}`);
  };

  useEffect(() => {
    if (!uiToast) return;
    const timer = setTimeout(() => setUiToast(""), 1400);
    return () => clearTimeout(timer);
  }, [uiToast]);

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
    if (submittingOrder) return;
    setCheckoutError("");
    if (cartItems.length === 0) {
      setCheckoutError("Agrega al menos un item al carrito.");
      return;
    }
    const normalizedTable = normalizeTableCode(tableCode);
    if (!normalizedTable) {
      setCheckoutError("Ingresa una mesa valida.");
      return;
    }
    const guestsValidation = validateGuestCount(guestCount);
    if (!guestsValidation.ok) {
      setCheckoutError(guestsValidation.error);
      return;
    }
    setTableCode(normalizedTable);

    setSubmittingOrder(true);
    try {
      let resolvedTableSessionId = tableSessionId;
      if (!resolvedTableSessionId) {
        const opened = await openTableSession({
          store_id: storeId,
          table_code: normalizedTable,
          guest_count: guestsValidation.value,
        });
        resolvedTableSessionId = opened.table_session_id;
        setTableSessionId(opened.table_session_id);

        const joined = await joinTableSession({
          tableSessionId: opened.table_session_id,
          clientId,
          alias: `Mesa-${normalizedTable}-${clientId.slice(-4)}`,
        });
        setConnectedClients(joined.connected_clients || 1);
      }

      const created = await upsertOrderByTable({
        tenant_id: 1,
        store_id: storeId,
        table_session_id: resolvedTableSessionId,
        client_id: clientId,
        guest_count: guestsValidation.value,
        items: cartItems.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          qty: item.qty,
          notes: item.notes?.trim() || undefined,
        })),
      });

      setLastCreatedOrder(created);
      setActiveOrderId(created.order_id);
      setCartItems([]);
    } catch (error) {
      setCheckoutError(error.message || "No se pudo crear el pedido compartido.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  useEffect(() => {
    if (!tableSessionId) return;

    const refreshState = async () => {
      try {
        const state = await fetchTableSessionState(tableSessionId);
        if (state.status === "CLOSED") {
          setClosedSession({
            tableSessionId: state.table_session_id,
            tableCode: state.table_code,
          });
          setFeedbackError("");
          setTableSessionId(null);
          setConnectedClients(1);
          setActiveOrderId(null);
          setCartItems([]);
          return;
        }
        setConnectedClients(state.connected_clients || 1);
        if (state.active_order_id) {
          setActiveOrderId(state.active_order_id);
        }
      } catch {
      }
    };

    refreshState();
    const timer = setInterval(refreshState, 10000);
    const stream = openTableSessionEvents(tableSessionId);
    stream.onmessage = refreshState;
    stream.addEventListener("items.changed", refreshState);
    stream.addEventListener("order.created", refreshState);
    stream.addEventListener("table.session.joined", refreshState);
    stream.addEventListener("table.session.closed", refreshState);

    return () => {
      clearInterval(timer);
      stream.close();
    };
  }, [tableSessionId]);

  const handleEntryTableChange = (value) => {
    setTableCode(value);
    setEntryErrors((current) => ({ ...current, table: "" }));
  };

  const handleEntryGuestChange = (value) => {
    setGuestCount(value);
    setEntryErrors((current) => ({ ...current, guests: "" }));
  };

  const completeEntryGate = () => {
    if (entrySubmitting) return;
    const normalizedTable = normalizeTableCode(tableCode);
    const guestsValidation = validateGuestCount(guestCount);

    const nextErrors = {
      table: normalizedTable ? "" : "Ingresa una mesa valida (ej: 9 o M9).",
      guests: guestsValidation.ok ? "" : guestsValidation.error,
    };
    setEntryErrors(nextErrors);
    if (!normalizedTable || !guestsValidation.ok) return;

    const openSession = async () => {
      setEntrySubmitting(true);
      try {
        const opened = await openTableSession({
          store_id: storeId,
          table_code: normalizedTable,
          guest_count: guestsValidation.value,
        });
        setTableSessionId(opened.table_session_id);
        const joined = await joinTableSession({
          tableSessionId: opened.table_session_id,
          clientId,
          alias: `Mesa-${normalizedTable}-${clientId.slice(-4)}`,
        });
        setConnectedClients(joined.connected_clients || 1);
        setTableCode(normalizedTable);
        setGuestCount(guestsValidation.value);
        setClosedSession(null);
        setEntryValidated(true);
        setUiToast("Mesa registrada. Avisamos al staff.");
      } catch (error) {
        setEntryErrors((current) => ({
          ...current,
          table: error.message || "No se pudo registrar la mesa.",
        }));
      } finally {
        setEntrySubmitting(false);
      }
    };

    void openSession();
  };

  const saveGuestCount = (nextGuestCount) => {
    setGuestCount(nextGuestCount);
    setIsAdjustGuestsOpen(false);
    setUiToast("Personas actualizadas para proximos pedidos.");
  };

  const goToTracking = () => {
    if (typeof window === "undefined") return;
    const node = document.getElementById("tracking-section");
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetSession = () => {
    setClosedSession(null);
    setTableCode("");
    setGuestCount(2);
    setEntryValidated(false);
    setEntryErrors({ table: "", guests: "" });
    setActiveOrderId(null);
    setTableSessionId(null);
    setConnectedClients(1);
    setCartItems([]);
    setCheckoutError("");
    setFeedbackError("");
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(SESSION_STATE_KEY);
      } catch {
      }
    }
  };

  const submitFeedbackAndReset = async ({ rating, comment }) => {
    if (!closedSession?.tableSessionId) {
      resetSession();
      return;
    }
    setFeedbackSaving(true);
    setFeedbackError("");
    try {
      await submitTableSessionFeedback({
        tableSessionId: closedSession.tableSessionId,
        clientId,
        rating,
        comment,
      });
      resetSession();
      setUiToast("Gracias por tu valoracion.");
    } catch (error) {
      setFeedbackError(error.message || "No se pudo guardar tu valoracion.");
    } finally {
      setFeedbackSaving(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Mesa digital</p>
        <h1>Comanda Cliente</h1>
        <p className="muted">Hace tu pedido por mesa y segui el estado en vivo.</p>
        <p className="hero-meta">
          Carrito: <strong>{cartItems.reduce((acc, item) => acc + item.qty, 0)}</strong> items
        </p>
        <p className="hero-meta">
          Mesa: <strong>{tableCode.trim().toUpperCase() || "-"}</strong>
          {tableSessionId && (
            <>
              {" | "}Sesion: <strong>#{tableSessionId}</strong>
              {" | "}Conectados: <strong>{connectedClients}</strong>
            </>
          )}
        </p>
      </header>

      {uiToast && <div className="toast-ok">{uiToast}</div>}

      {!entryValidated ? (
        <EntryGatePage
          tableCode={tableCode}
          guestCount={guestCount}
          submitting={entrySubmitting}
          errors={entryErrors}
          onTableCodeChange={handleEntryTableChange}
          onGuestCountChange={handleEntryGuestChange}
          onContinue={completeEntryGate}
        />
      ) : closedSession ? (
        <SessionClosedFeedbackPage
          tableCode={closedSession.tableCode}
          clientUrl={
            typeof window !== "undefined"
              ? `${window.location.origin}/?mesa=${encodeURIComponent(closedSession.tableCode || "")}`
              : ""
          }
          saving={feedbackSaving}
          error={feedbackError}
          onSubmit={submitFeedbackAndReset}
          onRestart={resetSession}
        />
      ) : (
        <>
          <MenuPage
            menu={menu}
            loading={menuLoading}
            error={menuError}
            onRetry={loadMenu}
            onAddToCart={addToCart}
            productQtyInCart={productQtyInCart}
          />

          <CheckoutPage
            tableCode={tableCode}
            guestCount={guestCount}
            cartItems={cartItems}
            cartTotal={cartTotal}
            checkoutError={checkoutError}
            submittingOrder={submittingOrder}
            lastCreatedOrder={lastCreatedOrder}
            onOpenAdjustGuests={() => setIsAdjustGuestsOpen(true)}
            onUpdateCartQty={updateCartQty}
            onUpdateCartNotes={updateCartNotes}
            onRemoveCartItem={removeCartItem}
            onSubmitOrder={submitOrder}
            onGoToTracking={goToTracking}
          />

          <OrderTrackingPage
            orderId={activeOrderId}
            guestCount={guestCount}
            tableCode={tableCode}
            clientId={clientId}
            feedbackLocked={Boolean(tableSessionId)}
          />

          <AdjustGuestsModal
            open={isAdjustGuestsOpen}
            initialGuestCount={guestCount}
            onClose={() => setIsAdjustGuestsOpen(false)}
            onSave={saveGuestCount}
          />
        </>
      )}
    </main>
  );
}
