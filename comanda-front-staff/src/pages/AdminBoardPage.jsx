import { useEffect, useMemo, useRef, useState } from "react";
import { sectorClass, sectorLabel, elapsedMinutes } from "../utils/boardMeta";

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
    value || 0
  );
}

function elapsedLabel(minutesValue) {
  const minutes = Number(minutesValue);
  if (!Number.isFinite(minutes) || minutes < 0) return "-";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem}m`;
}

function statusText(status) {
  if (status === "SIN_PEDIDO") return "Sin pedido";
  if (status === "EN_PROCESO") return "En proceso";
  if (status === "PAGO_SOLICITADO") return "Pago solicitado";
  if (status === "PAGO_TOMADO") return "Pago tomado";
  if (status === "LISTO_CUENTA") return "Listo para cobrar";
  if (status === "PAGO_REPORTADO") return "Pago reportado";
  return status;
}

function statusClass(status) {
  if (status === "SIN_PEDIDO") return "badge";
  if (status === "EN_PROCESO") return "badge badge-progress";
  if (status === "PAGO_SOLICITADO") return "badge badge-received";
  if (status === "PAGO_TOMADO") return "badge badge-done";
  if (status === "LISTO_CUENTA") return "badge badge-done";
  if (status === "PAGO_REPORTADO") return "badge badge-delivered";
  return "badge";
}

function itemStatusLabel(status) {
  if (status === "RECEIVED") return "Recibido";
  if (status === "IN_PROGRESS") return "En preparacion";
  if (status === "DONE") return "Listo";
  if (status === "DELIVERED") return "Entregado";
  if (status === "PARCIAL") return "Parcial";
  return status;
}

function itemLabelWithNotes(item) {
  const notes = String(item?.notes || "").trim();
  return notes ? `${item.qty}x ${item.item_name} (${notes})` : `${item.qty}x ${item.item_name}`;
}

function batchKeyForItem(item, fallbackOrderId) {
  const orderId = String(item?.order_id || fallbackOrderId || "0");
  const createdAt = String(item?.created_at || "");
  return `${orderId}:${createdAt}`;
}

function buildSectorLots(items = [], fallbackOrderId = null) {
  const lotsMap = items.reduce((acc, item) => {
    const key = batchKeyForItem(item, fallbackOrderId);
    if (!acc[key]) {
      acc[key] = {
        key,
        orderId: String(item?.order_id || fallbackOrderId || "0"),
        createdAt: item?.created_at || null,
        items: [],
      };
    }
    acc[key].items.push(item);
    return acc;
  }, {});

  return Object.values(lotsMap)
    .map((lot, index) => ({
      ...lot,
      state: lotStateFromItems(lot.items),
      elapsed: elapsedMinutes(lot.createdAt || lot.items[0]?.created_at),
      sequence: index + 1,
    }))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function batchLabel(createdAt) {
  if (!createdAt) return "Ingreso";
  return `Ingreso ${new Date(createdAt).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function Modal({ title, subtitle, children, onClose }) {
  return (
    <div className="staff-modal-backdrop" onClick={onClose}>
      <div className="staff-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="staff-modal-head">
          <div>
            <h4>{title}</h4>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button className="btn-secondary" onClick={onClose}>
            X
          </button>
        </div>
        <div className="staff-modal-body">{children}</div>
      </div>
    </div>
  );
}

function itemsInProcess(items = []) {
  return items.filter((item) => item.status !== "DELIVERED");
}

function lotStateFromItems(items = []) {
  const active = items.filter((item) => item.status !== "DELIVERED");
  if (active.length === 0) return "RECIBIDO";
  if (active.some((item) => item.status === "RECEIVED")) return "RECIBIDO";
  if (active.some((item) => item.status === "IN_PROGRESS")) return "EN_PROCESO";
  return "LISTO";
}

function lotButtonClass(state) {
  if (state === "RECIBIDO") return "badge badge-received";
  if (state === "EN_PROCESO") return "badge badge-progress";
  if (state === "LISTO") return "badge badge-done";
  return "badge";
}

function lotNextStatus(state, actorSector) {
  if (state === "RECIBIDO") return "IN_PROGRESS";
  if (state === "EN_PROCESO") return "DONE";
  if (state === "LISTO" && actorSector === "ADMIN") return "DELIVERED";
  return null;
}

function lotActionLabel(nextStatus) {
  if (nextStatus === "IN_PROGRESS") return "EN PROCESO";
  if (nextStatus === "DONE") return "LISTO";
  if (nextStatus === "DELIVERED") return "ENTREGAR";
  return "";
}

function nextStatusForAction({ currentStatus, itemSector, actorSector }) {
  if (actorSector === "ADMIN") {
    if (itemSector === "WAITER" && currentStatus === "RECEIVED") return "DELIVERED";
    if (currentStatus === "RECEIVED") return "IN_PROGRESS";
    if (currentStatus === "IN_PROGRESS") return "DONE";
    if (currentStatus === "DONE") return "DELIVERED";
    return null;
  }
  if (actorSector === "KITCHEN") {
    if (currentStatus === "RECEIVED") return "IN_PROGRESS";
    if (currentStatus === "IN_PROGRESS") return "DONE";
    return null;
  }
  if (actorSector === "BAR") {
    if (currentStatus === "RECEIVED") return "IN_PROGRESS";
    if (currentStatus === "IN_PROGRESS") return "DONE";
    return null;
  }
  if (actorSector === "WAITER") {
    if (itemSector === "WAITER" && currentStatus === "RECEIVED") return "DELIVERED";
    if (currentStatus === "DONE") return "DELIVERED";
    return null;
  }
  return null;
}

export function AdminBoardPage({
  rows,
  loading,
  tableSessionsRows = [],
  onRequestOrderDetail,
  onAdvanceItem,
  advancingKey = "",
  actorSector = "ADMIN",
  onCloseTableByCode = () => {},
  onForceCloseTableByCode = () => {},
  closingTable = false,
  onRequestWaiterCalls = async () => [],
  onResolveWaiterCall = async () => {},
  onConfirmReportedPayments = async () => {},
  validatingPaymentKey = "",
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalDetail, setModalDetail] = useState(null);
  const [waiterPopover, setWaiterPopover] = useState(null);
  const [waiterSignals, setWaiterSignals] = useState({});
  const [cashSignals, setCashSignals] = useState({});
  const [takingCallId, setTakingCallId] = useState(null);
  const [acceptingCashRequestId, setAcceptingCashRequestId] = useState(null);
  const [forceCloseTarget, setForceCloseTarget] = useState(null);
  const seenCashAlarmRef = useRef("");

  const tableRows = useMemo(() => {
    const groupedOrders = rows.reduce((acc, row) => {
      if (!acc[row.table_code]) {
        acc[row.table_code] = [];
      }
      acc[row.table_code].push(row);
      return acc;
    }, {});

    const sessionByTable = tableSessionsRows.reduce((acc, session) => {
      acc[session.table_code] = session;
      return acc;
    }, {});

    const tableCodes = [...new Set([...Object.keys(groupedOrders), ...Object.keys(sessionByTable)])];

    return tableCodes
      .map((tableCode) => {
        const tableOrders = [...(groupedOrders[tableCode] || [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const tableSession = sessionByTable[tableCode];
        const activeOrders = tableOrders.filter((order) => order.is_active_session);
        const effectiveOrders = activeOrders.length > 0 ? activeOrders : tableOrders;
        const leadOrder = effectiveOrders[0] || null;
        const qty = effectiveOrders.reduce((sum, order) => sum + Number(order.total_items || 0), 0);
        const delivered = effectiveOrders.reduce((sum, order) => sum + Number(order.delivered_items || 0), 0);
        const total = effectiveOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
        const hasPendingPayment = effectiveOrders.some((order) => Boolean(order.has_pending_payment));
        const cashSignal = tableSession?.table_session_id ? cashSignals[tableSession.table_session_id] : null;
        const hasPendingCashPayment = Number(cashSignal?.pending || 0) > 0;
        const hasAcceptedCashPayment = Boolean(cashSignal?.latestResolved);
        const sectorList = [
          ...new Set(
            effectiveOrders.flatMap((order) =>
              (order.sectors || [])
                .filter((sectorState) => sectorState.status !== "DELIVERED")
                .map((sectorState) => sectorState.sector)
            )
          ),
        ];
        const status =
          qty === 0
            ? "SIN_PEDIDO"
            : hasPendingCashPayment
            ? "PAGO_SOLICITADO"
            : hasPendingPayment
            ? "PAGO_REPORTADO"
            : hasAcceptedCashPayment
            ? "PAGO_TOMADO"
            : delivered < qty
            ? "EN_PROCESO"
            : "LISTO_CUENTA";
        const referenceDate = tableSession?.created_at || leadOrder?.created_at || null;

        return {
          id: tableSession?.table_session_id || `table-${tableCode}`,
          table_session_id: tableSession?.table_session_id || null,
          table_code: tableCode,
          guest_count: tableSession?.guest_count ?? leadOrder?.guest_count ?? 0,
          qty,
          delivered,
          sectors: sectorList,
          status,
          has_pending_payment: hasPendingPayment,
          has_pending_cash_payment: hasPendingCashPayment,
          total,
          elapsed_minutes:
            typeof tableSession?.elapsed_minutes === "number"
              ? tableSession.elapsed_minutes
              : referenceDate
              ? elapsedMinutes(referenceDate)
              : 0,
          latest_at: leadOrder?.created_at || tableSession?.created_at || null,
          lead_order_id: leadOrder?.order_id || null,
        };
      })
      .sort((a, b) => new Date(b.latest_at || 0).getTime() - new Date(a.latest_at || 0).getTime());
  }, [rows, tableSessionsRows, cashSignals]);

  useEffect(() => {
    let cancelled = false;
    const loadSignals = async () => {
      const rowsWithSession = (tableSessionsRows || []).filter((row) => row.table_session_id);
      if (rowsWithSession.length === 0 || typeof onRequestWaiterCalls !== "function") {
        if (!cancelled) {
          setWaiterSignals({});
          setCashSignals({});
        }
        return;
      }
      const results = await Promise.all(
        rowsWithSession.map(async (row) => {
          try {
            const requests = await onRequestWaiterCalls(row.table_session_id);
            const waiter = (requests || []).filter((request) => request.request_kind === "WAITER_CALL");
            const cash = (requests || []).filter((request) => request.request_kind === "CASH_PAYMENT");
            const pending = waiter.filter((request) => request.status === "PENDING").length;
            const pendingCash = cash.filter((request) => request.status === "PENDING");
            const resolvedCash = cash.filter((request) => request.status === "RESOLVED");
            return [
              row.table_session_id,
              {
                waiter: { pending, total: waiter.length },
                cash: {
                  pending: pendingCash.length,
                  total: cash.length,
                  latestPending: pendingCash[0] || null,
                  latestResolved: resolvedCash[0] || null,
                },
              },
            ];
          } catch {
            return [
              row.table_session_id,
              {
                waiter: { pending: 0, total: 0 },
                cash: { pending: 0, total: 0, latestPending: null, latestResolved: null },
              },
            ];
          }
        })
      );
      if (cancelled) return;
      setWaiterSignals(
        Object.fromEntries(results.map(([tableSessionId, data]) => [tableSessionId, data.waiter]))
      );
      setCashSignals(
        Object.fromEntries(results.map(([tableSessionId, data]) => [tableSessionId, data.cash]))
      );
    };
    loadSignals();
    return () => {
      cancelled = true;
    };
  }, [tableSessionsRows, onRequestWaiterCalls]);

  useEffect(() => {
    const rowWithPendingCash = tableRows.find((row) => Number(cashSignals[row.table_session_id]?.pending || 0) > 0);
    if (!rowWithPendingCash?.table_session_id) return;
    const latestPending = cashSignals[rowWithPendingCash.table_session_id]?.latestPending;
    if (!latestPending?.id) return;
    if (seenCashAlarmRef.current === String(latestPending.id)) return;
    seenCashAlarmRef.current = String(latestPending.id);
    setWaiterPopover(null);
    setActiveModal({
      kind: "CASH_REQUEST",
      row: rowWithPendingCash,
      sector: null,
    });
  }, [cashSignals, tableRows]);

  async function openModal(kind, row, sector = null) {
    setActiveModal({ kind, row, sector });
    setModalDetail(null);
    setModalError("");
    if (!row.lead_order_id || typeof onRequestOrderDetail !== "function") return;
    setModalLoading(true);
    try {
      const detail = await onRequestOrderDetail(row.lead_order_id);
      setModalDetail(detail);
    } catch (error) {
      setModalError(error?.message || "No se pudo cargar detalle de la mesa.");
    } finally {
      setModalLoading(false);
    }
  }

  async function openWaiterPopover(row) {
    setWaiterPopover({
      row,
      loading: true,
      error: "",
      requests: [],
    });
    if (!row.table_session_id || typeof onRequestWaiterCalls !== "function") {
      setWaiterPopover({
        row,
        loading: false,
        error: "",
        requests: [],
      });
      return;
    }
    try {
      const requestsResponse = await onRequestWaiterCalls(row.table_session_id);
      const requests = (requestsResponse || [])
        .filter((request) => request.request_kind === "WAITER_CALL")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setWaiterPopover({
        row,
        loading: false,
        error: "",
        requests,
      });
    } catch (error) {
      setWaiterPopover({
        row,
        loading: false,
        error: error?.message || "No se pudo cargar llamados de mozo.",
        requests: [],
      });
    }
  }

  async function acceptCashRequest(requestId, tableSessionId) {
    if (!requestId || typeof onResolveWaiterCall !== "function") return;
    setAcceptingCashRequestId(requestId);
    try {
      await onResolveWaiterCall(requestId);
      setActiveModal((current) => (current?.kind === "CASH_REQUEST" ? null : current));
      setCashSignals((current) => {
        if (!tableSessionId) return current;
        const currentSignal = current[tableSessionId] || {
          pending: 0,
          total: 0,
          latestPending: null,
          latestResolved: null,
        };
        return {
          ...current,
          [tableSessionId]: {
            ...currentSignal,
            pending: Math.max(0, Number(currentSignal.pending || 0) - 1),
            latestPending:
              currentSignal.latestPending?.id === requestId ? null : currentSignal.latestPending || null,
            latestResolved:
              currentSignal.latestPending?.id === requestId ? currentSignal.latestPending : currentSignal.latestResolved,
          },
        };
      });
    } finally {
      setAcceptingCashRequestId(null);
    }
  }

  async function confirmReportedPayments(row) {
    if (!row?.lead_order_id || typeof onConfirmReportedPayments !== "function") return;
    await onConfirmReportedPayments([row.lead_order_id]);
  }

  async function forceCloseTable(row) {
    if (!row?.table_code || typeof onForceCloseTableByCode !== "function") return;
    setForceCloseTarget(row);
  }

  async function confirmForceClose() {
    if (!forceCloseTarget?.table_code || typeof onForceCloseTableByCode !== "function") return;
    const target = forceCloseTarget;
    setForceCloseTarget(null);
    await onForceCloseTableByCode(target.table_code);
  }

  async function takeWaiterCall(requestId, tableSessionId) {
    if (!requestId || typeof onResolveWaiterCall !== "function") return;
    setTakingCallId(requestId);
    try {
      await onResolveWaiterCall(requestId);
      setWaiterPopover((current) => {
        if (!current) return current;
        const nextRequests = (current.requests || []).map((request) =>
          request.id === requestId ? { ...request, status: "RESOLVED" } : request
        );
        return { ...current, requests: nextRequests };
      });
      setWaiterSignals((current) => {
        if (!tableSessionId) return current;
        const sessionId = tableSessionId;
        const currentSignal = current[sessionId] || { pending: 0, total: 0 };
        return {
          ...current,
          [sessionId]: {
            ...currentSignal,
            pending: Math.max(0, Number(currentSignal.pending || 0) - 1),
          },
        };
      });
    } catch {
      // keep current state; error handling remains in caller panels
    } finally {
      setTakingCallId(null);
    }
  }

  async function advanceFromModal(item) {
    const toStatus = nextStatusForAction({
      currentStatus: item.status,
      itemSector: item.sector,
      actorSector,
    });
    if (!toStatus || typeof onAdvanceItem !== "function") return;
    await onAdvanceItem({
      itemId: item.item_id,
      currentStatus: item.status,
      itemSector: item.sector,
    });
    if (activeModal?.row?.lead_order_id && typeof onRequestOrderDetail === "function") {
      const detail = await onRequestOrderDetail(activeModal.row.lead_order_id);
      setModalDetail(detail);
    }
  }

  async function advanceLotFromModal(lot) {
    const target = lotNextStatus(lot.state, actorSector);
    if (!target || typeof onAdvanceItem !== "function") return;

    const updatableItems =
      target === "IN_PROGRESS"
        ? lot.items.filter((item) => item.status === "RECEIVED")
        : target === "DONE"
        ? lot.items.filter((item) => item.status === "IN_PROGRESS")
        : lot.items.filter((item) => item.status === "DONE");

    for (const item of updatableItems) {
      // eslint-disable-next-line no-await-in-loop
      await onAdvanceItem({
        itemId: item.item_id,
        currentStatus: item.status,
        itemSector: item.sector,
      });
    }

    if (activeModal?.row?.lead_order_id && typeof onRequestOrderDetail === "function") {
      const detail = await onRequestOrderDetail(activeModal.row.lead_order_id);
      setModalDetail(detail);
    }
  }

  return (
    <section className="panel ops-panel">
      <div className="section-head">
        <h3>Mesas operativas</h3>
        <span className="muted">{tableRows.length} activas</span>
      </div>
      {loading && <p className="muted">Actualizando...</p>}

      {tableRows.length === 0 ? (
        <p className="muted">No hay mesas activas para este filtro.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table admin-table-ops">
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Mozo</th>
                <th>Personas</th>
                <th>QTY</th>
                <th>Sectores</th>
                <th>Estado</th>
                <th>Tiempo</th>
                <th>Total</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    row.status === "PAGO_SOLICITADO"
                      ? "admin-row-alert"
                      : row.status === "EN_PROCESO"
                      ? "admin-row-active"
                      : ""
                  }
                >
                  <td>
                    <button className="btn-secondary btn-table-link" onClick={() => openModal("TABLE", row)}>
                      {row.table_code}
                    </button>
                  </td>
                  <td>
                    {(() => {
                      const signal = row.table_session_id ? waiterSignals[row.table_session_id] : null;
                      const pendingCalls = Number(signal?.pending || 0);
                      return (
                    <button
                        className={pendingCalls > 0 ? "btn-secondary bell-btn bell-btn-alert" : "btn-secondary bell-btn"}
                        title="Llamado mozo"
                        onClick={() => openWaiterPopover(row)}
                        disabled={!row.table_session_id}
                      >
                        🔔{pendingCalls > 0 ? <span className="bell-dot">{pendingCalls > 9 ? "9+" : pendingCalls}</span> : null}
                      </button>
                      );
                    })()}
                  </td>
                  <td>{row.guest_count}</td>
                  <td>{row.qty}</td>
                  <td>
                    <div className="sector-chip-wrap">
                      {(row.sectors || []).length === 0 ? (
                        <span className="muted">-</span>
                      ) : (
                        row.sectors.map((sector) => (
                          <button
                            key={`${row.id}:${sector}`}
                            className={sectorClass(sector)}
                            onClick={() => openModal("SECTOR", row, sector)}
                          >
                            {sectorLabel(sector)}
                          </button>
                        ))
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="status-cell">
                      <button
                        className={statusClass(row.status)}
                        onClick={() => openModal(row.status === "PAGO_SOLICITADO" ? "CASH_REQUEST" : "STATUS", row)}
                      >
                        {statusText(row.status)}
                      </button>
                    </div>
                  </td>
                  <td>{elapsedLabel(row.elapsed_minutes)}</td>
                  <td>{formatMoney(row.total)}</td>
                  <td>
                    {row.status === "PAGO_SOLICITADO" ? (
                      <button
                        className="btn-primary"
                        disabled={
                          acceptingCashRequestId === cashSignals[row.table_session_id]?.latestPending?.id
                        }
                        onClick={() =>
                          acceptCashRequest(
                            cashSignals[row.table_session_id]?.latestPending?.id,
                            row.table_session_id
                          )
                        }
                      >
                        {acceptingCashRequestId === cashSignals[row.table_session_id]?.latestPending?.id
                          ? "Aceptando..."
                          : "Aceptar pago"}
                      </button>
                    ) : row.status === "PAGO_REPORTADO" ? (
                      <div className="order-actions">
                        <button
                          className="btn-primary"
                          disabled={validatingPaymentKey === String(row.lead_order_id || "")}
                          onClick={() => confirmReportedPayments(row)}
                        >
                          {validatingPaymentKey === String(row.lead_order_id || "")
                            ? "Confirmando..."
                            : "Confirmar pago"}
                        </button>
                        <button
                          className="btn-secondary"
                          disabled={closingTable}
                          onClick={() => forceCloseTable(row)}
                        >
                          {closingTable ? "Cerrando..." : "Forzar cierre"}
                        </button>
                      </div>
                    ) : (
                      <div className="order-actions">
                        <button
                          className="btn-secondary"
                          disabled={closingTable || row.status === "EN_PROCESO"}
                          onClick={() => onCloseTableByCode(row.table_code)}
                        >
                          {closingTable ? "Cerrando..." : "Cerrar mesa"}
                        </button>
                        <button
                          className="btn-secondary"
                          disabled={closingTable}
                          onClick={() => forceCloseTable(row)}
                        >
                          {closingTable ? "Cerrando..." : "Forzar cierre"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeModal && (
        <Modal
          title={
            activeModal.kind === "CASH_REQUEST"
              ? `Mesa ${activeModal.row.table_code} solicita pagar`
              : activeModal.kind === "TABLE"
              ? `Mesa ${activeModal.row.table_code}`
              : activeModal.kind === "SECTOR"
              ? `${sectorLabel(activeModal.sector)} - Mesa ${activeModal.row.table_code}`
              : `En proceso - Mesa ${activeModal.row.table_code}`
          }
          subtitle={
            activeModal.kind === "CASH_REQUEST"
              ? "Confirma este aviso para que el cliente vea las opciones para pagar desde Mozo."
              : activeModal.kind === "TABLE"
              ? "Todo lo ya pedido en esta mesa"
              : activeModal.kind === "SECTOR"
              ? "Items del sector y tiempo de proceso"
              : "Items pendientes por entregar"
          }
          onClose={() => setActiveModal(null)}
        >
          {activeModal.kind === "CASH_REQUEST" && (
            <div className="staff-modal-list">
              {(() => {
                const cashSignal = cashSignals[activeModal.row.table_session_id] || {};
                const pendingRequest = cashSignal.latestPending;
                if (!pendingRequest) {
                  return <p className="muted">La solicitud ya fue tomada o se actualizo la mesa.</p>;
                }
                return (
                  <article className="mini-request-card">
                    <div className="mini-request-title">
                      <strong>{pendingRequest.payer_label || `Mesa ${activeModal.row.table_code}`}</strong>
                      <span className="badge badge-received">Pendiente</span>
                    </div>
                    <p>{pendingRequest.note || "Quiero pagar"}</p>
                    <span className="muted">{new Date(pendingRequest.created_at).toLocaleTimeString("es-AR")}</span>
                    <button
                      className="btn-primary"
                      disabled={acceptingCashRequestId === pendingRequest.id}
                      onClick={() => acceptCashRequest(pendingRequest.id, activeModal.row.table_session_id)}
                    >
                      {acceptingCashRequestId === pendingRequest.id ? "Aceptando..." : "Aceptar solicitud de pago"}
                    </button>
                  </article>
                );
              })()}
            </div>
          )}
          {activeModal.kind !== "CASH_REQUEST" && (
            <>
              {modalLoading && <p className="muted">Cargando detalle...</p>}
              {modalError && <p className="error-text">{modalError}</p>}
              {!modalLoading && !modalError && !modalDetail && (
                <p className="muted">Esta mesa aun no tiene pedido enviado.</p>
              )}
              {!modalLoading && !modalError && modalDetail && (
                <div className="staff-modal-list">
                  {activeModal.kind === "STATUS" && activeModal.row.status === "PAGO_REPORTADO" && (
                    <div className="order-actions">
                      <button
                        className="btn-primary"
                        disabled={validatingPaymentKey === String(activeModal.row.lead_order_id || "")}
                        onClick={() => confirmReportedPayments(activeModal.row)}
                      >
                        {validatingPaymentKey === String(activeModal.row.lead_order_id || "")
                          ? "Confirmando..."
                          : "Confirmar pago"}
                      </button>
                      <button
                        className="btn-secondary"
                        disabled={closingTable}
                        onClick={() => onCloseTableByCode(activeModal.row.table_code)}
                      >
                        {closingTable ? "Cerrando..." : "Cerrar mesa"}
                      </button>
                      <button
                        className="btn-secondary"
                        disabled={closingTable}
                        onClick={() => forceCloseTable(activeModal.row)}
                      >
                        {closingTable ? "Cerrando..." : "Forzar cierre"}
                      </button>
                    </div>
                  )}
                  {activeModal.kind === "SECTOR" ? (
                (() => {
                  const sectorItems = itemsInProcess(modalDetail.items).filter((item) => item.sector === activeModal.sector);
                  const lots = buildSectorLots(sectorItems, modalDetail.order_id);

                  return lots.map((lot) => {
                    const next = lotNextStatus(lot.state, actorSector);
                    const lotBusy = lot.items.some((item) => advancingKey.startsWith(`${item.item_id}:`));
                    const showLotAction =
                      (activeModal.sector === "KITCHEN" || activeModal.sector === "BAR") && Boolean(next);

                    return (
                      <article key={`lot-${lot.key}`} className="sector-lot-card">
                        <div className="sector-lot-head">
                          <p className="sector-lot-title">Pedido #{lot.orderId}</p>
                          <span className="muted">{batchLabel(lot.createdAt)}</span>
                        </div>
                        <div className="sector-lot-items">
                          {lot.items.map((item) => {
                            const nextStatus = nextStatusForAction({
                              currentStatus: item.status,
                              itemSector: item.sector,
                              actorSector,
                            });
                            return (
                              <div key={item.item_id} className="staff-modal-row">
                                <p className="staff-modal-item-name">{itemLabelWithNotes(item)}</p>
                                <div className="staff-modal-meta-inline">
                                  <span className={sectorClass(item.sector)}>{sectorLabel(item.sector)}</span>
                                  <span className="badge">{itemStatusLabel(item.status)}</span>
                                  <span className="muted">{elapsedLabel(elapsedMinutes(item.updated_at || item.created_at))}</span>
                                  {!showLotAction && nextStatus && (
                                    <button
                                      className="btn-primary"
                                      disabled={advancingKey === `${item.item_id}:${nextStatus}`}
                                      onClick={() => advanceFromModal(item)}
                                    >
                                      {advancingKey === `${item.item_id}:${nextStatus}` ? "..." : `Pasar a ${nextStatus}`}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="sector-lot-footer">
                          <span className={lotButtonClass(lot.state)}>{lot.state}</span>
                          {showLotAction && (
                            <button className="btn-primary" disabled={lotBusy} onClick={() => advanceLotFromModal(lot)}>
                              {lotBusy ? "..." : lotActionLabel(next)}
                            </button>
                          )}
                          <span className="muted">{elapsedLabel(lot.elapsed)}</span>
                        </div>
                      </article>
                    );
                  });
                })()
              ) : (
                (activeModal.kind === "TABLE"
                  ? modalDetail.items
                  : itemsInProcess(modalDetail.items)
                ).map((item) => (
                  <div key={item.item_id} className="staff-modal-row">
                    <p className="staff-modal-item-name">
                      {itemLabelWithNotes(item)}
                    </p>
                    <div className="staff-modal-meta-inline">
                      <span className={sectorClass(item.sector)}>{sectorLabel(item.sector)}</span>
                      <span className="badge">{itemStatusLabel(item.status)}</span>
                      <span className="muted">{elapsedLabel(elapsedMinutes(item.updated_at || item.created_at))}</span>
                      {nextStatusForAction({
                        currentStatus: item.status,
                        itemSector: item.sector,
                        actorSector,
                      }) && (
                        <button
                          className="btn-primary"
                          disabled={
                            advancingKey ===
                            `${item.item_id}:${nextStatusForAction({
                              currentStatus: item.status,
                              itemSector: item.sector,
                              actorSector,
                            })}`
                          }
                          onClick={() => advanceFromModal(item)}
                        >
                          {advancingKey ===
                          `${item.item_id}:${nextStatusForAction({
                            currentStatus: item.status,
                            itemSector: item.sector,
                            actorSector,
                          })}`
                            ? "..."
                            : `Pasar a ${nextStatusForAction({
                                currentStatus: item.status,
                                itemSector: item.sector,
                                actorSector,
                              })}`}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
              {(activeModal.kind === "TABLE"
                ? modalDetail.items
                : activeModal.kind === "SECTOR"
                ? itemsInProcess(modalDetail.items).filter((item) => item.sector === activeModal.sector)
                : itemsInProcess(modalDetail.items)
              ).length === 0 && <p className="muted">No hay items para mostrar en este estado.</p>}
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {waiterPopover && (
        <div className="mini-popover-backdrop" onClick={() => setWaiterPopover(null)}>
          <article className="mini-popover-card" onClick={(event) => event.stopPropagation()}>
            <header className="mini-popover-head">
              <h4>Mesa {waiterPopover.row.table_code} · Llamado mozo</h4>
              <button className="btn-secondary" onClick={() => setWaiterPopover(null)}>
                X
              </button>
            </header>
            {waiterPopover.loading && <p className="muted">Cargando...</p>}
            {!waiterPopover.loading && waiterPopover.error && <p className="error-text">{waiterPopover.error}</p>}
            {!waiterPopover.loading && !waiterPopover.error && waiterPopover.requests.length === 0 && (
              <p className="muted">Sin llamados activos o recientes para esta mesa.</p>
            )}
            {!waiterPopover.loading &&
              !waiterPopover.error &&
              waiterPopover.requests.map((request) => (
                <article key={request.id} className="mini-request-card">
                  <div className="mini-request-title">
                    <strong>{request.payer_label || "Cliente"}</strong>
                    {request.status === "PENDING" ? (
                      <button
                        className="btn-secondary mini-status-btn mini-status-pending"
                        disabled={takingCallId === request.id}
                        onClick={() => takeWaiterCall(request.id, waiterPopover.row.table_session_id)}
                      >
                        {takingCallId === request.id ? "Tomando..." : "Pendiente"}
                      </button>
                    ) : (
                      <span className="badge badge-delivered">Tomado</span>
                    )}
                  </div>
                  <p>{request.note || "Sin mensaje"}</p>
                  <span className="muted">{new Date(request.created_at).toLocaleTimeString("es-AR")}</span>
                </article>
              ))}
          </article>
        </div>
      )}

      {forceCloseTarget && (
        <Modal
          title={`Forzar cierre de ${forceCloseTarget.table_code}`}
          subtitle={`Esto cerrara la mesa ${forceCloseTarget.table_code} aunque tenga estados pendientes.`}
          onClose={() => setForceCloseTarget(null)}
        >
          <div className="order-actions">
            <button className="btn-secondary" onClick={() => setForceCloseTarget(null)} disabled={closingTable}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={confirmForceClose} disabled={closingTable}>
              {closingTable ? "Cerrando..." : "Aceptar y forzar cierre"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
