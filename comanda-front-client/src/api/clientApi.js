const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function withTableSessionToken(headers = {}, tableSessionToken) {
  if (!tableSessionToken) return headers;
  return { ...headers, "X-Table-Session-Token": tableSessionToken };
}

function withSessionTokenQuery(url, tableSessionToken) {
  if (!tableSessionToken) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}session_token=${encodeURIComponent(tableSessionToken)}`;
}

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

export async function openTableSession(payload) {
  try {
    const res = await fetch(`${API_URL}/table/session/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo abrir la sesion de mesa.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo abrir la sesion de mesa.");
  }
}

export async function joinTableSession({ tableSessionId, clientId, alias }) {
  try {
    const res = await fetch(`${API_URL}/table/session/${tableSessionId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, alias }),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo unir a la sesion de mesa.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo unir a la sesion de mesa.");
  }
}

export async function fetchTableSessionState(tableSessionId, clientId, tableSessionToken) {
  try {
    const res = await fetch(`${API_URL}/table/session/${tableSessionId}/state`, {
      headers: withTableSessionToken({}, tableSessionToken),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo cargar estado de la mesa.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar estado de la mesa.");
  }
}

export async function submitTableSessionFeedback({ tableSessionId, clientId, rating, comment, tableSessionToken }) {
  try {
    const res = await fetch(`${API_URL}/table/session/${tableSessionId}/feedback`, {
      method: "POST",
      headers: withTableSessionToken({ "Content-Type": "application/json" }, tableSessionToken),
      body: JSON.stringify({
        client_id: clientId,
        rating: Number(rating),
        comment: comment?.trim() || undefined,
      }),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo guardar tu valoracion.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo guardar tu valoracion.");
  }
}

export async function fetchTableSessionConsumption(tableSessionId, tableSessionToken) {
  try {
    const res = await fetch(`${API_URL}/table/session/${tableSessionId}/consumption`, {
      headers: withTableSessionToken({}, tableSessionToken),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo cargar el consumo de la mesa.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el consumo de la mesa.");
  }
}

export async function upsertOrderByTable(payload, tableSessionToken) {
  try {
    const res = await fetch(`${API_URL}/orders/upsert-by-table`, {
      method: "POST",
      headers: withTableSessionToken({ "Content-Type": "application/json" }, tableSessionToken),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo actualizar el pedido compartido.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo actualizar el pedido compartido.");
  }
}

export async function fetchOrder(orderId, tableSessionToken) {
  try {
    const res = await fetch(`${API_URL}/orders/${orderId}`, {
      headers: withTableSessionToken({}, tableSessionToken),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo cargar el seguimiento.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo cargar el seguimiento.");
  }
}

export async function fetchOrderSplit(orderId, tableSessionToken) {
  try {
    const res = await fetch(`${API_URL}/billing/orders/${orderId}/split`, {
      headers: withTableSessionToken({}, tableSessionToken),
    });
    if (!res.ok) {
      await toApiError(res, "No hay division creada.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No hay division creada.");
  }
}

export async function createEqualSplit({ orderId, partsCount, tableSessionToken }) {
  try {
    const res = await fetch(`${API_URL}/billing/orders/${orderId}/split-equal`, {
      method: "POST",
      headers: withTableSessionToken({ "Content-Type": "application/json" }, tableSessionToken),
      body: JSON.stringify({ parts_count: Number(partsCount) }),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo crear la division.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear la division.");
  }
}

export async function createConsumptionSplit({ orderId, tableSessionToken }) {
  try {
    const res = await fetch(`${API_URL}/billing/orders/${orderId}/split-consumption`, {
      method: "POST",
      headers: withTableSessionToken({ "Content-Type": "application/json" }, tableSessionToken),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo crear la division por consumo.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo crear la division por consumo.");
  }
}

export async function reportSplitPartPayment({ partId, payerLabel, tableSessionToken }) {
  try {
    const res = await fetch(`${API_URL}/billing/split-parts/${partId}/report`, {
      method: "POST",
      headers: withTableSessionToken({ "Content-Type": "application/json" }, tableSessionToken),
      body: JSON.stringify({ payer_label: payerLabel }),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo reportar el pago.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo reportar el pago.");
  }
}

export async function requestCashPayment({
  orderId,
  clientId,
  payerLabel,
  note,
  requestKind = "CASH_PAYMENT",
  tableSessionToken,
}) {
  try {
    const res = await fetch(`${API_URL}/billing/orders/${orderId}/request-cash`, {
      method: "POST",
      headers: withTableSessionToken({ "Content-Type": "application/json" }, tableSessionToken),
      body: JSON.stringify({
        client_id: clientId,
        payer_label: payerLabel,
        request_kind: requestKind,
        note: note?.trim() || undefined,
      }),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo pedir asistencia para pago en efectivo.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo pedir asistencia para pago en efectivo.");
  }
}

export async function requestWaiterHelpBySession({ tableSessionId, clientId, payerLabel, note, tableSessionToken }) {
  try {
    const res = await fetch(`${API_URL}/billing/table-sessions/${tableSessionId}/request-waiter`, {
      method: "POST",
      headers: withTableSessionToken({ "Content-Type": "application/json" }, tableSessionToken),
      body: JSON.stringify({
        client_id: clientId,
        payer_label: payerLabel,
        request_kind: "WAITER_CALL",
        note: note?.trim() || undefined,
      }),
    });
    if (!res.ok) {
      await toApiError(res, "No se pudo llamar al mozo.");
    }
    return res.json();
  } catch (error) {
    throw toNetworkError(error, "No se pudo llamar al mozo.");
  }
}

export function openOrderEvents(orderId, tableSessionToken) {
  return new EventSource(withSessionTokenQuery(`${API_URL}/events/orders/${orderId}/stream`, tableSessionToken));
}

export function openTableSessionEvents(tableSessionId, tableSessionToken) {
  return new EventSource(
    withSessionTokenQuery(`${API_URL}/events/table-session/${tableSessionId}/stream`, tableSessionToken)
  );
}
