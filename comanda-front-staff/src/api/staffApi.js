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

export async function fetchAdminMenuCategories({ token }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/categories`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar las categorías.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar las categorías.");
  }
}

export async function fetchAdminMenuProducts({ token }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar los productos.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar los productos.");
  }
}

export async function createAdminProduct({ token, payload }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo crear el producto.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear el producto.");
  }
}

export async function patchAdminProduct({ token, productId, payload }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/products/${productId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar el producto.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar el producto.");
  }
}

export async function createAdminProductExtraOption({ token, productId, payload }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/products/${productId}/extra-options`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo crear el extra.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear el extra.");
  }
}

export async function patchAdminProductExtraOption({ token, extraOptionId, payload }) {
  try {
    const res = await fetch(`${API_URL}/admin/menu/extra-options/${extraOptionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar el extra.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar el extra.");
  }
}

export async function uploadMenuImage({ token, file }) {
  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${API_URL}/admin/menu/images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body,
    });
    if (!res.ok) await toApiError(res, "No se pudo subir la imagen.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo subir la imagen.");
  }
}

export function openStaffEvents({ storeId, sector }) {
  const qs = new URLSearchParams({ store_id: String(storeId) });
  if (sector) qs.append("sector", sector);
  return new EventSource(`${API_URL}/events/items/stream?${qs.toString()}`);
}
