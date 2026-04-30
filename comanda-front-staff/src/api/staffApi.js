const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function toApiError(res, fallbackMessage) {
  let detail = "";
  try {
    const payload = await res.json();
    if (typeof payload?.detail === "string") {
      detail = payload.detail;
    } else if (typeof payload?.error?.message === "string") {
      detail = payload.error.message;
    }
  } catch {
  }

  const error = new Error(detail || fallbackMessage);
  error.status = res.status;
  throw error;
}

function withOwnerPassword(headers = {}, ownerPassword) {
  const trimmed = String(ownerPassword || "").trim();
  if (!trimmed) return headers;
  return { ...headers, "X-Owner-Password": trimmed };
}

function toNetworkError(error, fallbackMessage) {
  if (error?.name === "TypeError") {
    return new Error(
      `No se pudo conectar con el backend (${API_URL}). Verifica que este levantado y responda en /health.`
    );
  }
  if (error instanceof Error) return error;
  return new Error(fallbackMessage);
}

export async function sectorLogin(payload) {
  try {
    const res = await fetch(`${API_URL}/auth/sector-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo iniciar sesion.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo iniciar sesion.");
  }
}

export async function fetchAdminOrders({ token, storeId, status }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    if (status) qs.append("status", status);
    const res = await fetch(`${API_URL}/admin/orders?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar pedidos admin.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar pedidos admin.");
  }
}

export async function fetchAdminOrderItems({ token, orderId }) {
  try {
    const res = await fetch(`${API_URL}/admin/orders/${orderId}/items`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo cargar el detalle del pedido.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el detalle del pedido.");
  }
}

export async function fetchStaffOrderItems({ token, orderId }) {
  try {
    const res = await fetch(`${API_URL}/staff/orders/${orderId}/items`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo cargar el detalle del pedido.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el detalle del pedido.");
  }
}

export async function fetchStaffBoardItems({ token, storeId, sector }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId), sector });
    const res = await fetch(`${API_URL}/staff/items/board?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar items del tablero.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar items del tablero.");
  }
}

export async function fetchTableSessions({ token, storeId, onlyWithoutOrder = false }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    if (onlyWithoutOrder) qs.append("only_without_order", "true");
    const res = await fetch(`${API_URL}/staff/table-sessions?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar las mesas ocupadas.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar las mesas ocupadas.");
  }
}

export async function fetchTables({ token, storeId }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/tables?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar las mesas del local.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar las mesas del local.");
  }
}

export async function createStaffTable({ token, storeId, payload }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/tables?${qs.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) await toApiError(res, "No se pudo crear la mesa.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear la mesa.");
  }
}

export async function fetchTableSessionConsumption(tableSessionId) {
  try {
    const res = await fetch(`${API_URL}/table/session/${tableSessionId}/consumption`);
    if (!res.ok) await toApiError(res, "No se pudo cargar el consumo de la mesa.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el consumo de la mesa.");
  }
}

export async function patchTableSessionStatus({ token, tableSessionId, toStatus }) {
  try {
    const res = await fetch(`${API_URL}/staff/table-sessions/${tableSessionId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to_status: toStatus }),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar el estado de la mesa.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar el estado de la mesa.");
  }
}

export async function moveTableSession({ token, tableSessionId, targetTableCode }) {
  try {
    const res = await fetch(`${API_URL}/staff/table-sessions/${tableSessionId}/move`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ target_table_code: targetTableCode }),
    });
    if (!res.ok) await toApiError(res, "No se pudo cambiar la mesa.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cambiar la mesa.");
  }
}

export async function confirmBarOrderPayment({ token, orderId }) {
  try {
    const res = await fetch(`${API_URL}/staff/orders/${orderId}/confirm-bar-payment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) await toApiError(res, "No se pudo confirmar el pago BAR.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo confirmar el pago BAR.");
  }
}

export async function approveOrder({ token, orderId }) {
  try {
    const res = await fetch(`${API_URL}/staff/orders/${orderId}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) await toApiError(res, "No se pudo aceptar el pedido.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo aceptar el pedido.");
  }
}

export async function rejectOrder({ token, orderId }) {
  try {
    const res = await fetch(`${API_URL}/staff/orders/${orderId}/reject`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) await toApiError(res, "No se pudo rechazar el pedido.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo rechazar el pedido.");
  }
}

export async function fetchFeedbackSummary({ token, storeId, limit = 20 }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId), limit: String(limit) });
    const res = await fetch(`${API_URL}/staff/feedback/summary?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo cargar feedback.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar feedback.");
  }
}

export async function fetchStoreClientVisibility({ token, storeId }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/client-visibility?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo cargar configuracion de visibilidad.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar configuracion de visibilidad.");
  }
}

export async function patchStoreClientVisibility({ token, storeId, showLiveTotalToClient }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/client-visibility?${qs.toString()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ show_live_total_to_client: Boolean(showLiveTotalToClient) }),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar configuracion de visibilidad.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar configuracion de visibilidad.");
  }
}

export async function fetchStorePrintMode({ token, storeId }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/print-mode?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo cargar configuracion de impresion.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar configuracion de impresion.");
  }
}

export async function patchStorePrintMode({ token, storeId, printMode }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/print-mode?${qs.toString()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ print_mode: printMode }),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar configuracion de impresion.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar configuracion de impresion.");
  }
}

export async function fetchStoreMessagingSettings({ token, storeId }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/messaging?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo cargar configuración de mensajes.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar configuración de mensajes.");
  }
}

export async function patchStoreMessagingSettings({ token, storeId, whatsappShareTemplate }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/messaging?${qs.toString()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ whatsapp_share_template: whatsappShareTemplate }),
    });
    if (!res.ok) await toApiError(res, "No se pudo guardar el mensaje.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo guardar el mensaje.");
  }
}

export async function fetchStoreProfileSettings({ token, storeId }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/profile?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo cargar el perfil del local.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el perfil del local.");
  }
}

export async function fetchStoreFloorPlan({ token, storeId }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/floor-plan?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo cargar el plano del salon.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el plano del salon.");
  }
}

export async function patchStoreFloorPlan({ token, storeId, payload }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/floor-plan?${qs.toString()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo guardar el plano del salon.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo guardar el plano del salon.");
  }
}

export async function patchStoreProfileSettings({ token, storeId, payload }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/store-settings/profile?${qs.toString()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo guardar el perfil del local.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo guardar el perfil del local.");
  }
}

export async function suggestStoreProfileTheme({ token, payload }) {
  try {
    const res = await fetch(`${API_URL}/staff/store-settings/profile/theme-suggestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo sugerir el estilo con IA.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo sugerir el estilo con IA.");
  }
}

export async function fetchActiveShift({ token, storeId }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/shifts/active?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo cargar el turno activo.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el turno activo.");
  }
}

export async function bootstrapShift({ token, storeId, label, operatorName, openingFloat, note }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/shifts/bootstrap?${qs.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        label,
        operator_name: operatorName,
        opening_float: Number(openingFloat || 0),
        note: note || null,
      }),
    });
    if (!res.ok) await toApiError(res, "No se pudo abrir el turno y la caja.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo abrir el turno y la caja.");
  }
}

export async function openCashSession({ token, storeId, openingFloat, note }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/cash/open?${qs.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ opening_float: Number(openingFloat || 0), note: note || null }),
    });
    if (!res.ok) await toApiError(res, "No se pudo abrir la caja.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo abrir la caja.");
  }
}

export async function closeCashSession({ token, storeId, declaredAmount, note }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/cash/close?${qs.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ declared_amount: Number(declaredAmount || 0), note: note || null }),
    });
    if (!res.ok) await toApiError(res, "No se pudo cerrar la caja.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cerrar la caja.");
  }
}

export async function collectOrderPayment({ token, orderId, paymentMethod, amount, note }) {
  try {
    const res = await fetch(`${API_URL}/staff/payments/orders/${orderId}/collect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        payment_method: paymentMethod,
        amount: Number(amount),
        note: note || null,
      }),
    });
    if (!res.ok) await toApiError(res, "No se pudo registrar el cobro.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo registrar el cobro.");
  }
}

export async function openShift({ token, storeId, label, operatorName }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/shifts/open?${qs.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ label, operator_name: operatorName }),
    });
    if (!res.ok) await toApiError(res, "No se pudo abrir el turno.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo abrir el turno.");
  }
}

export async function closeShift({ token, storeId }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/shifts/close?${qs.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) await toApiError(res, "No se pudo cerrar el turno.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cerrar el turno.");
  }
}

export async function fetchShiftSummaries({ token, storeId, limit = 30 }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId), limit: String(limit) });
    const res = await fetch(`${API_URL}/staff/shifts/summaries?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar los resúmenes.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar los resúmenes.");
  }
}

export async function patchItemStatus({ token, itemId, toStatus }) {
  try {
    const res = await fetch(`${API_URL}/staff/items/${itemId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to_status: toStatus }),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar el estado del item.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar el estado del item.");
  }
}

export async function closeTableSession({ token, tableCode }) {
  try {
    const res = await fetch(`${API_URL}/staff/tables/${encodeURIComponent(tableCode)}/close-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) await toApiError(res, "No se pudo cerrar la mesa.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cerrar la mesa.");
  }
}

export async function createEqualSplit({ orderId, partsCount }) {
  try {
    const res = await fetch(`${API_URL}/billing/orders/${orderId}/split-equal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parts_count: Number(partsCount) }),
    });
    if (!res.ok) await toApiError(res, "No se pudo crear la division.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear la division.");
  }
}

export async function confirmSplitPart({ token, partId }) {
  try {
    const res = await fetch(`${API_URL}/billing/split-parts/${partId}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo confirmar el pago.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo confirmar el pago.");
  }
}

export async function markOrderPrintStatus({ token, orderId, target }) {
  try {
    const res = await fetch(`${API_URL}/staff/orders/${orderId}/print-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ target }),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar estado de impresion.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar estado de impresion.");
  }
}

export async function forceConfirmOrderPayment({ token, orderId }) {
  try {
    const res = await fetch(`${API_URL}/billing/orders/${orderId}/force-confirm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) await toApiError(res, "No se pudo confirmar el pago.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo confirmar el pago.");
  }
}

export async function forceCloseTableSession({ token, tableCode }) {
  try {
    const res = await fetch(`${API_URL}/staff/tables/${encodeURIComponent(tableCode)}/force-close-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) await toApiError(res, "No se pudo forzar el cierre de la mesa.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo forzar el cierre de la mesa.");
  }
}

export async function resolveCashRequest({ token, cashRequestId }) {
  try {
    const res = await fetch(`${API_URL}/billing/cash-requests/${cashRequestId}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudo resolver el aviso de efectivo.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo resolver el aviso de efectivo.");
  }
}

export async function fetchTableSessionCashRequests({ token, tableSessionId }) {
  try {
    const res = await fetch(`${API_URL}/billing/table-sessions/${tableSessionId}/cash-requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar los llamados de mozo.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar los llamados de mozo.");
  }
}

export async function fetchAdminMenuCategories({ token, ownerPassword }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/categories`, {
      headers: withOwnerPassword({ Authorization: `Bearer ${token}` }, ownerPassword),
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar las categorías.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar las categorías.");
  }
}

export async function createAdminMenuCategory({ token, payload, ownerPassword }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/categories`, {
      method: "POST",
      headers: withOwnerPassword({
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      }, ownerPassword),
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo crear la categoría.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear la categoría.");
  }
}

export async function fetchAdminMenuProducts({ token, ownerPassword }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/products`, {
      headers: withOwnerPassword({ Authorization: `Bearer ${token}` }, ownerPassword),
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar los productos.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar los productos.");
  }
}

export async function createAdminProduct({ token, payload, ownerPassword }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/products`, {
      method: "POST",
      headers: withOwnerPassword({
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      }, ownerPassword),
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo crear el producto.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear el producto.");
  }
}

export async function patchAdminProduct({ token, productId, payload, ownerPassword }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/products/${productId}`, {
      method: "PATCH",
      headers: withOwnerPassword({
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      }, ownerPassword),
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar el producto.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar el producto.");
  }
}

export async function deleteAdminProduct({ token, productId, ownerPassword }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/products/${productId}`, {
      method: "DELETE",
      headers: withOwnerPassword({
        Authorization: `Bearer ${token}`,
      }, ownerPassword),
    });
    if (!res.ok) await toApiError(res, "No se pudo eliminar el producto.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo eliminar el producto.");
  }
}

export async function createAdminProductExtraOption({ token, productId, payload, ownerPassword }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/products/${productId}/extra-options`, {
      method: "POST",
      headers: withOwnerPassword({
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      }, ownerPassword),
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo crear el extra.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear el extra.");
  }
}

export async function patchAdminProductExtraOption({ token, extraOptionId, payload, ownerPassword }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/extra-options/${extraOptionId}`, {
      method: "PATCH",
      headers: withOwnerPassword({
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      }, ownerPassword),
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar el extra.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar el extra.");
  }
}

export async function previewMenuImport({ token, file, ownerPassword }) {
  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${API_URL}/admin/menu/import/preview`, {
      method: "POST",
      headers: withOwnerPassword({
        Authorization: `Bearer ${token}`,
      }, ownerPassword),
      body,
    });
    if (!res.ok) await toApiError(res, "No se pudo interpretar la carta.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo interpretar la carta.");
  }
}

export async function commitMenuImport({ token, items, ownerPassword }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/import/commit`, {
      method: "POST",
      headers: withOwnerPassword({
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      }, ownerPassword),
      body: JSON.stringify({ items }),
    });
    if (!res.ok) await toApiError(res, "No se pudo crear el menú importado.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear el menú importado.");
  }
}

export async function uploadMenuImage({ token, file, ownerPassword }) {
  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${API_URL}/admin/menu/images`, {
      method: "POST",
      headers: withOwnerPassword({
        Authorization: `Bearer ${token}`,
      }, ownerPassword),
      body,
    });
    if (!res.ok) await toApiError(res, "No se pudo subir la imagen.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo subir la imagen.");
  }
}

export async function fetchStaffAccounts({ token, storeId, ownerPassword }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/accounts?${qs.toString()}`, {
      headers: withOwnerPassword({ Authorization: `Bearer ${token}` }, ownerPassword),
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar los usuarios del staff.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar los usuarios del staff.");
  }
}

export async function createStaffAccount({ token, storeId, ownerPassword, payload }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/accounts?${qs.toString()}`, {
      method: "POST",
      headers: withOwnerPassword(
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        ownerPassword
      ),
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo crear el usuario.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear el usuario.");
  }
}

export async function patchStaffAccount({ token, storeId, staffId, ownerPassword, payload }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId) });
    const res = await fetch(`${API_URL}/staff/accounts/${staffId}?${qs.toString()}`, {
      method: "PATCH",
      headers: withOwnerPassword(
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        ownerPassword
      ),
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar el usuario.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar el usuario.");
  }
}

export function openStaffEvents({ storeId, sector }) {
  const qs = new URLSearchParams({ store_id: String(storeId) });
  if (sector) qs.append("sector", sector);
  return new EventSource(`${API_URL}/events/items/stream?${qs.toString()}`);
}
