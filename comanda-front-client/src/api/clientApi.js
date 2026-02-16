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

  const message = detail || fallbackMessage;
  const error = new Error(message);
  error.status = res.status;
  throw error;
}

function toNetworkError(error, fallbackMessage) {
  if (error?.name === "TypeError") {
    return new Error("No se pudo conectar con el servidor.");
  }
  if (error instanceof Error) return error;
  return new Error(fallbackMessage);
}

export async function fetchMenu(storeId) {
  try {
    const res = await fetch(`${API_URL}/menu?store_id=${storeId}`);
    if (!res.ok) {
      await toApiError(res, "No se pudo cargar el menu.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el menu.");
  }
}

export async function createOrder(payload) {
  try {
    const res = await fetch(`${API_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo crear el pedido.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear el pedido.");
  }
}

export async function fetchOrder(orderId) {
  try {
    const res = await fetch(`${API_URL}/orders/${orderId}`);
    if (!res.ok) {
      await toApiError(res, "No se pudo cargar el seguimiento.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el seguimiento.");
  }
}
