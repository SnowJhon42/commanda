"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEqualSplit,
  fetchOrder,
  fetchOrderSplit,
  fetchMenu,
  joinTableSession,
  openTableSession,
  openTableSessionEvents,
  reportSplitPartPayment,
  requestCashPayment,
  requestWaiterHelpBySession,
  submitTableSessionFeedback,
  fetchTableSessionState,
  upsertOrderByTable,
} from "./api/clientApi";
import { MenuPage } from "./views/MenuPage";
import { CheckoutPage } from "./views/CheckoutPage";
import { OrderTrackingPage } from "./views/OrderTrackingPage";
import { SessionClosedFeedbackPage } from "./views/SessionClosedFeedbackPage";
import { EntryGatePage } from "./views/EntryGatePage";
import { AdjustGuestsModal } from "./views/AdjustGuestsModal";

const DEFAULT_STORE_ID = 1;
const SESSION_STATE_KEY = "comanda_client_session_state_v3";
const MIN_GUESTS = 1;
const MAX_GUESTS = 20;
const CLIENT_TABS = {
  MENU: "MENU",
  NOTIFICATIONS: "NOTIFICATIONS",
  TABLE: "TABLE",
  WAITER: "WAITER",
};

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

function cartKey(productId, variantId, extraOptionIds = []) {
  const extrasKey = [...new Set(extraOptionIds)].sort((a, b) => a - b).join(",");
  return `${productId}:${variantId ?? "none"}:${extrasKey || "noextras"}`;
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

function paymentStatusMessageFromSplit(split) {
  if (!split) return "";
  const parts = split.parts || [];
  if (split.status === "CLOSED") return "Pago confirmado por el staff.";
  if (parts.length > 0 && parts.every((part) => part.payment_status === "CONFIRMED")) {
    return "Pago confirmado por el staff.";
  }
  if (parts.some((part) => part.payment_status === "REPORTED")) {
    return "El pago ya fue reportado. Falta validacion del staff.";
  }
  return "";
}

export function App() {
  const [storeId] = useState(DEFAULT_STORE_ID);
  const [clientId] = useState(getStableClientId);
  const [tableCode, setTableCode] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [entryValidated, setEntryValidated] = useState(false);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entryErrors, setEntryErrors] = useState({ table: "", guests: "" });
  const [activeTab, setActiveTab] = useState(CLIENT_TABS.MENU);
  const [menuResetSignal, setMenuResetSignal] = useState(0);
  const [hasTrackingAlert, setHasTrackingAlert] = useState(false);
  const [waiterBusy, setWaiterBusy] = useState(false);
  const [waiterNote, setWaiterNote] = useState("");
  const [waiterMessage, setWaiterMessage] = useState("");
  const [waiterAlertMessage, setWaiterAlertMessage] = useState("");
  const [hasWaiterAlert, setHasWaiterAlert] = useState(false);

  const [menu, setMenu] = useState(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");

  const [cartItems, setCartItems] = useState([]);
  const [checkoutError, setCheckoutError] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [lastCreatedOrder, setLastCreatedOrder] = useState(null);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [activeOrderDetail, setActiveOrderDetail] = useState(null);
  const [mesaActionBusy, setMesaActionBusy] = useState(false);
  const [mesaActionMessage, setMesaActionMessage] = useState("");
  const [mesaPaymentStateMessage, setMesaPaymentStateMessage] = useState("");
  const [tableSessionId, setTableSessionId] = useState(null);
  const [sessionJoinedAt, setSessionJoinedAt] = useState(null);
  const [connectedClients, setConnectedClients] = useState(1);
  const [uiToast, setUiToast] = useState("");
  const [closedSession, setClosedSession] = useState(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [isAdjustGuestsOpen, setIsAdjustGuestsOpen] = useState(false);
  const previousTableSessionIdRef = useRef(null);
  const hasPendingToSend = cartItems.length > 0;

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
      if (Number(saved.sessionJoinedAt) > 0) setSessionJoinedAt(Number(saved.sessionJoinedAt));
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
      sessionJoinedAt,
      activeOrderId,
      connectedClients,
      closedSession,
    };
    try {
      window.localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(payload));
    } catch {
    }
  }, [tableCode, guestCount, tableSessionId, sessionJoinedAt, activeOrderId, connectedClients, closedSession]);

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
  const showLiveTotalToClient = Boolean(menu?.show_live_total_to_client ?? true);
  const committedItems = useMemo(() => {
    const items = activeOrderDetail?.items || [];
    return items.filter((item) => {
      if (item.created_by_client_id !== clientId) return false;
      if (!sessionJoinedAt) return true;
      const createdTs = item.created_at ? new Date(item.created_at).getTime() : 0;
      return createdTs >= sessionJoinedAt;
    });
  }, [activeOrderDetail, clientId, sessionJoinedAt]);
  const committedItemsForMesa = useMemo(() => {
    const isPreviousDeliveredOrder =
      activeOrderDetail?.status_aggregated === "DELIVERED" && cartItems.length > 0;
    return isPreviousDeliveredOrder ? [] : committedItems;
  }, [activeOrderDetail?.status_aggregated, cartItems.length, committedItems]);
  const committedTotal = useMemo(
    () =>
      committedItemsForMesa.reduce(
        (acc, item) => acc + Number(item.unit_price || 0) * Number(item.qty || 0),
        0
      ),
    [committedItemsForMesa]
  );
  // "Total mesa" must only reflect confirmed consumption, not draft items.
  const mesaGrandTotal = committedTotal;

  useEffect(() => {
    if (!activeOrderId) {
      setActiveOrderDetail(null);
      setMesaPaymentStateMessage("");
      return;
    }
    let mounted = true;

    const loadActiveOrder = async () => {
      try {
        const payload = await fetchOrder(activeOrderId);
        if (!mounted) return;
        setActiveOrderDetail(payload);
      } catch {
      }
    };

    loadActiveOrder();
    const timer = setInterval(loadActiveOrder, 9000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [activeOrderId]);

  useEffect(() => {
    const previous = previousTableSessionIdRef.current;
    const current = tableSessionId;
    if (previous !== null && current && previous !== current) {
      // New table session: clear stale order pointers from previous session.
      setActiveOrderId(null);
      setActiveOrderDetail(null);
      setMesaPaymentStateMessage("");
      setLastCreatedOrder(null);
    }
    previousTableSessionIdRef.current = current;
  }, [tableSessionId]);

  useEffect(() => {
    if (!activeOrderId) {
      setMesaPaymentStateMessage("");
      return;
    }
    let mounted = true;
    const loadSplitState = async () => {
      try {
        const split = await fetchOrderSplit(activeOrderId);
        if (!mounted) return;
        setMesaPaymentStateMessage(paymentStatusMessageFromSplit(split));
      } catch (error) {
        if (!mounted) return;
        if (error?.status === 404) {
          setMesaPaymentStateMessage("");
        }
      }
    };
    loadSplitState();
    const timer = setInterval(loadSplitState, 7000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [activeOrderId]);

  const productQtyInCart = useMemo(() => {
    const map = {};
    cartItems.forEach((item) => {
      map[item.product_id] = (map[item.product_id] || 0) + item.qty;
    });
    return map;
  }, [cartItems]);

  const addToCart = ({ product, variant, qty, notes, extraOptionIds = [], extraOptionLabels = [] }) => {
    setCheckoutError("");
    const quantity = Number(qty);
    if (!quantity || quantity < 1) return;

    const extra = variant ? Number(variant.extra_price) : 0;
    const selectedExtras = (product.extra_options || []).filter((option) =>
      extraOptionIds.includes(option.id)
    );
    const extrasPrice = selectedExtras.reduce((acc, option) => acc + Number(option.extra_price || 0), 0);
    const price = Number(product.base_price) + extra + extrasPrice;
    const extrasLabel =
      (extraOptionLabels || [])
        .filter(Boolean)
        .map((label) => String(label).trim())
        .filter(Boolean)
        .join(", ") || selectedExtras.map((option) => option.name).join(", ");
    const cleanNotes = String(notes || "").trim();
    const mergedNotes = [cleanNotes, extrasLabel ? `Extras: ${extrasLabel}` : ""]
      .filter(Boolean)
      .join(" | ");
    const key = cartKey(product.id, variant?.id, extraOptionIds);

    setCartItems((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) =>
          item.key === key
            ? {
                ...item,
                qty: item.qty + quantity,
                notes: item.notes || mergedNotes,
              }
            : item
        );
      }
      return [
        ...current,
        {
          key,
          product_id: product.id,
          variant_id: variant?.id ?? null,
          extra_option_ids: [...new Set(extraOptionIds)].sort((a, b) => a - b),
          product_name: product.name,
          variant_name: variant?.name ?? null,
          unit_price: price,
          qty: quantity,
          notes: mergedNotes,
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

  useEffect(() => {
    if (!hasTrackingAlert) return;
    if (typeof window === "undefined") return;
    if (typeof window.navigator?.vibrate !== "function") return;
    window.navigator.vibrate(160);
  }, [hasTrackingAlert]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    if (tab !== CLIENT_TABS.TABLE) {
      setMesaActionMessage("");
    }
    if (tab === CLIENT_TABS.NOTIFICATIONS) {
      setHasTrackingAlert(false);
    }
    if (tab === CLIENT_TABS.WAITER) {
      setHasWaiterAlert(false);
    }
  };

  const updateCartQty = (key, qty) => {
    const quantity = Number(qty);
    if (!Number.isFinite(quantity)) return;
    setCartItems((current) => {
      if (quantity <= 0) {
        return current.filter((item) => item.key !== key);
      }
      return current.map((item) => (item.key === key ? { ...item, qty: quantity } : item));
    });
  };

  const updateCartNotes = (key, notes) => {
    setCartItems((current) => current.map((item) => (item.key === key ? { ...item, notes } : item)));
  };

  const removeCartItem = (key) => {
    setCartItems((current) => current.filter((item) => item.key !== key));
  };

  const incrementCartItem = (key) => {
    setCartItems((current) =>
      current.map((item) => (item.key === key ? { ...item, qty: Math.min(99, Number(item.qty || 0) + 1) } : item))
    );
  };

  const decrementCartItem = (key) => {
    setCartItems((current) =>
      current
        .map((item) =>
          item.key === key ? { ...item, qty: Math.max(0, Number(item.qty || 0) - 1) } : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const incrementProductInCart = (productId) => {
    if (!productId) return;
    setCartItems((current) => {
      const index = current.findIndex((item) => item.product_id === productId);
      if (index < 0) return current;
      const next = [...current];
      const target = next[index];
      next[index] = { ...target, qty: Math.min(99, Number(target.qty || 0) + 1) };
      return next;
    });
  };

  const decrementProductInCart = (productId) => {
    if (!productId) return;
    setCartItems((current) => {
      const index = current.findIndex((item) => item.product_id === productId);
      if (index < 0) return current;
      const next = [...current];
      const target = next[index];
      const nextQty = Math.max(0, Number(target.qty || 0) - 1);
      if (nextQty <= 0) {
        next.splice(index, 1);
      } else {
        next[index] = { ...target, qty: nextQty };
      }
      return next;
    });
  };

  const removeProductFromCart = (productId) => {
    if (!productId) return;
    setCartItems((current) => current.filter((item) => item.product_id !== productId));
  };

  const submitOrder = async () => {
    if (submittingOrder) return;
    setCheckoutError("");
    setMesaActionMessage("");
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
          extra_option_ids: item.extra_option_ids || [],
          qty: item.qty,
          notes: item.notes?.trim() || undefined,
        })),
      });

      setLastCreatedOrder(created);
      setActiveOrderId(created.order_id);
      if (activeTab !== CLIENT_TABS.NOTIFICATIONS) {
        setHasTrackingAlert(true);
      }
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
        const state = await fetchTableSessionState(tableSessionId, clientId);
        if (state.status === "CLOSED") {
          setClosedSession({
            tableSessionId: state.table_session_id,
            tableCode: state.table_code,
          });
          setFeedbackError("");
          setTableSessionId(null);
          setSessionJoinedAt(null);
          setConnectedClients(1);
          setActiveOrderId(null);
          setMesaPaymentStateMessage("");
          setHasTrackingAlert(false);
          setHasWaiterAlert(false);
          setWaiterAlertMessage("");
          setCartItems([]);
          return;
        }
        setConnectedClients(state.connected_clients || 1);
        const nextWaiterMessage = state.assistance_message || "";
        setWaiterAlertMessage(nextWaiterMessage);
        if (!nextWaiterMessage) {
          setHasWaiterAlert(false);
        }
        if (nextWaiterMessage && activeTab !== CLIENT_TABS.WAITER) {
          setHasWaiterAlert(true);
        }
        if (state.active_order_id) {
          if (activeTab !== CLIENT_TABS.NOTIFICATIONS) {
            setHasTrackingAlert(true);
          }
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
    stream.addEventListener("bill.cash.requested", refreshState);
    stream.addEventListener("bill.cash.resolved", refreshState);

    return () => {
      clearInterval(timer);
      stream.close();
    };
  }, [tableSessionId, activeTab, clientId]);

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
        setSessionJoinedAt(Date.now());
        setActiveOrderId(null);
        setActiveOrderDetail(null);
        setLastCreatedOrder(null);
        setMesaPaymentStateMessage("");
        setCartItems([]);
        setClosedSession(null);
        setEntryValidated(true);
        setActiveTab(CLIENT_TABS.MENU);
        setMenuResetSignal((current) => current + 1);
        setHasTrackingAlert(false);
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
    selectTab(CLIENT_TABS.NOTIFICATIONS);
  };
  const showSessionHeader = entryValidated && !closedSession;

  const requestWaiterHelp = async () => {
    if (waiterBusy) return;
    if (!tableSessionId) {
      setWaiterMessage("Primero registra la mesa.");
      return;
    }
    setWaiterBusy(true);
    setWaiterMessage("");
    const payerLabel = tableCode ? `Mesa ${tableCode}` : `Cliente ${clientId.slice(-4) || "anon"}`;
    try {
      await requestWaiterHelpBySession({
        tableSessionId,
        clientId,
        payerLabel,
        note: waiterNote || "Asistencia general",
      });
      setWaiterMessage("Llamado enviado. Esperando confirmacion del staff.");
      setWaiterNote("");
    } catch (error) {
      setWaiterMessage(error.message || "No se pudo llamar al mozo.");
    } finally {
      setWaiterBusy(false);
    }
  };

  const requestTableBill = async () => {
    if (mesaActionBusy) return;
    if (!activeOrderId) {
      setMesaActionMessage("Primero envia un pedido para pedir la cuenta.");
      return;
    }
    setMesaActionBusy(true);
    setMesaActionMessage("");
    const payerLabel = tableCode ? `Mesa ${tableCode}` : `Cliente ${clientId.slice(-4) || "anon"}`;
    try {
      await requestCashPayment({
        orderId: activeOrderId,
        clientId,
        payerLabel,
        requestKind: "CASH_PAYMENT",
        note: "Pedir cuenta",
      });
      setMesaActionMessage("Pedido enviado. Esperando confirmacion del staff.");
    } catch (error) {
      setMesaActionMessage(error.message || "No se pudo pedir la cuenta.");
    } finally {
      setMesaActionBusy(false);
    }
  };

  const payAllFromTable = async () => {
    if (mesaActionBusy) return;
    if (!activeOrderId) {
      setMesaActionMessage("Primero envia un pedido para pagar.");
      return;
    }
    setMesaActionBusy(true);
    setMesaActionMessage("");
    try {
      let activeSplit = null;
      try {
        activeSplit = await fetchOrderSplit(activeOrderId);
      } catch {
      }
      if (!activeSplit) {
        activeSplit = await createEqualSplit({ orderId: activeOrderId, partsCount: 1 });
      }
      const allConfirmed =
        (activeSplit.parts || []).length > 0 &&
        (activeSplit.parts || []).every((part) => part.payment_status === "CONFIRMED");
      if (activeSplit.status === "CLOSED" || allConfirmed) {
        setMesaActionMessage("Pago confirmado por el staff.");
        setMesaPaymentStateMessage("Pago confirmado por el staff.");
        return;
      }
      const pendingPart = (activeSplit.parts || []).find((part) => part.payment_status === "PENDING");
      if (!pendingPart) {
        const hasReported = (activeSplit.parts || []).some((part) => part.payment_status === "REPORTED");
        setMesaActionMessage(
          hasReported
            ? "El pago ya fue reportado. Falta validacion del staff."
            : "El pago ya fue confirmado por el staff."
        );
        setMesaPaymentStateMessage(paymentStatusMessageFromSplit(activeSplit));
        return;
      }
      const payerLabel = tableCode ? `Mesa ${tableCode}` : `Cliente ${clientId.slice(-4) || "anon"}`;
      await reportSplitPartPayment({ partId: pendingPart.id, payerLabel });
      setMesaActionMessage("Pago total reportado. El staff lo valida y cierra la mesa.");
      setMesaPaymentStateMessage("El pago ya fue reportado. Falta validacion del staff.");
    } catch (error) {
      setMesaActionMessage(error.message || "No se pudo reportar el pago total.");
    } finally {
      setMesaActionBusy(false);
    }
  };

  const resetSession = () => {
    setClosedSession(null);
    setTableCode("");
    setGuestCount(2);
    setEntryValidated(false);
    setEntryErrors({ table: "", guests: "" });
    setActiveOrderId(null);
    setActiveTab(CLIENT_TABS.MENU);
    setMenuResetSignal((current) => current + 1);
    setHasTrackingAlert(false);
    setWaiterNote("");
    setWaiterMessage("");
    setWaiterAlertMessage("");
    setHasWaiterAlert(false);
    setTableSessionId(null);
    setSessionJoinedAt(null);
    setConnectedClients(1);
    setCartItems([]);
    setCheckoutError("");
    setFeedbackError("");
    setActiveOrderDetail(null);
    setMesaActionMessage("");
    setMesaPaymentStateMessage("");
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
      <header className={showSessionHeader ? "hero hero-compact" : "hero"}>
        <p className="kicker">Mesa digital</p>
        <h1>Comanda Cliente</h1>
        {showSessionHeader ? (
          <div className="hero-table-meta">
            <p className="hero-table-row">
              <strong>Mesa {tableCode.trim().toUpperCase() || "-"}</strong>
            </p>
            <p className="hero-table-row">
              Personas: <strong>{guestCount}</strong> | Sesion:{" "}
              <strong>{tableSessionId ? `#${tableSessionId}` : "-"}</strong> | Conectados:{" "}
              <strong>{connectedClients}</strong>
            </p>
            <p className="hero-table-row">
              Consumo cargado: <strong>{committedItemsForMesa.reduce((acc, item) => acc + (item.qty || 0), 0)} items</strong>
            </p>
          </div>
        ) : (
          <p className="muted">Hace tu pedido por mesa y segui el estado en vivo.</p>
        )}
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
          {activeTab === CLIENT_TABS.MENU && (
            <MenuPage
              menu={menu}
              loading={menuLoading}
              error={menuError}
              onRetry={loadMenu}
              onAddToCart={addToCart}
              onDecrementProductInCart={decrementProductInCart}
              productQtyInCart={productQtyInCart}
              resetToCategoriesSignal={menuResetSignal}
            />
          )}
          {activeTab === CLIENT_TABS.TABLE && (
            <>
              <CheckoutPage
                tableCode={tableCode}
                guestCount={guestCount}
                cartItems={cartItems}
                cartTotal={cartTotal}
                committedItems={committedItemsForMesa}
                committedTotal={committedTotal}
                mesaGrandTotal={mesaGrandTotal}
                checkoutError={checkoutError}
                submittingOrder={submittingOrder}
                lastCreatedOrder={lastCreatedOrder}
                onOpenAdjustGuests={() => setIsAdjustGuestsOpen(true)}
                onUpdateCartQty={updateCartQty}
                onUpdateCartNotes={updateCartNotes}
                onRemoveCartItem={removeCartItem}
                onIncrementCartItem={incrementCartItem}
                onDecrementCartItem={decrementCartItem}
                onIncrementProductInCart={incrementProductInCart}
                onDecrementProductInCart={decrementProductInCart}
                onRemoveProductFromCart={removeProductFromCart}
                onSubmitOrder={submitOrder}
                onGoToTracking={goToTracking}
                onRequestTableBill={requestTableBill}
                onPayAllFromTable={payAllFromTable}
                mesaActionBusy={mesaActionBusy}
                mesaActionMessage={mesaActionMessage}
                mesaPaymentStateMessage={mesaPaymentStateMessage}
                showLiveTotal={showLiveTotalToClient}
                showSessionContext={false}
              />
            </>
          )}
          {activeTab === CLIENT_TABS.NOTIFICATIONS && (
            <OrderTrackingPage orderId={activeOrderId} />
          )}
          {activeTab === CLIENT_TABS.WAITER && (
            <section className="panel">
              <h2>Llamar al mozo</h2>
              <p className="muted">Pedi ayuda para recomendaciones, dudas o pago en efectivo.</p>
              <label className="field">
                Nota (opcional)
                <input
                  type="text"
                  maxLength="250"
                  value={waiterNote}
                  onChange={(e) => setWaiterNote(e.target.value)}
                  placeholder="Ej: necesito ayuda con el menu"
                />
              </label>
              <button className="btn-primary btn-full" onClick={requestWaiterHelp} disabled={waiterBusy}>
                {waiterBusy ? "Enviando..." : "Llamar al mozo"}
              </button>
              {waiterAlertMessage && <p className="toast-ok">{waiterAlertMessage}</p>}
              {waiterMessage && <p className="muted">{waiterMessage}</p>}
            </section>
          )}

          <nav className="client-bottom-nav" aria-label="Navegacion cliente">
            <button
              className={activeTab === CLIENT_TABS.MENU ? "client-nav-btn client-nav-btn-active" : "client-nav-btn"}
              onClick={() => selectTab(CLIENT_TABS.MENU)}
            >
              <span className="client-nav-icon">☰</span>
              <span>Menu</span>
            </button>
            <button
              className={
                activeTab === CLIENT_TABS.NOTIFICATIONS ? "client-nav-btn client-nav-btn-active" : "client-nav-btn"
              }
              onClick={() => selectTab(CLIENT_TABS.NOTIFICATIONS)}
            >
              <span className="client-nav-icon client-nav-bell-wrap">
                🔔
                {hasTrackingAlert && <span className="client-nav-dot" />}
              </span>
              <span>Notis</span>
            </button>
            <button
              className={
                [
                  "client-nav-btn",
                  activeTab === CLIENT_TABS.TABLE ? "client-nav-btn-active" : "",
                  hasPendingToSend ? "client-nav-btn-cta" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onClick={() => selectTab(CLIENT_TABS.TABLE)}
            >
              <span className="client-nav-icon">🪑</span>
              <span>Mesa</span>
            </button>
            <button
              className={
                [
                  "client-nav-btn",
                  activeTab === CLIENT_TABS.WAITER ? "client-nav-btn-active" : "",
                  hasWaiterAlert ? "client-nav-btn-cta" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onClick={() => selectTab(CLIENT_TABS.WAITER)}
            >
              <span className="client-nav-icon">🔔</span>
              <span>Mozo</span>
            </button>
          </nav>

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
