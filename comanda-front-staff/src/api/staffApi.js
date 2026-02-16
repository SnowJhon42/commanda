const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
    return new Error("No se pudo conectar con el backend.");
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

export async function fetchStaffOrders({ token, storeId, sector, status }) {
  try {
    const qs = new URLSearchParams({ store_id: String(storeId), sector });
    if (status) qs.append("status", status);
    const res = await fetch(`${API_URL}/staff/orders?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await toApiError(res, "No se pudieron cargar pedidos del sector.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudieron cargar pedidos del sector.");
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

export async function patchSectorStatus({ token, orderId, sector, toStatus }) {
  try {
    const res = await fetch(`${API_URL}/staff/orders/${orderId}/sectors/${sector}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to_status: toStatus }),
    });
    if (!res.ok) await toApiError(res, "No se pudo actualizar el estado.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar el estado.");
  }
}

export async function fetchOrderDetail(orderId) {
  try {
    const res = await fetch(`${API_URL}/orders/${orderId}`);
    if (!res.ok) await toApiError(res, "No se pudo cargar el detalle del pedido.");
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el detalle del pedido.");
  }
}
