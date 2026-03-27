import { useEffect, useMemo, useRef, useState } from "react";
import { sectorClass, sectorLabel, elapsedMinutes } from "../utils/boardMeta";
import { printFullOrderTicket, printOrderCommands, printSectorCommand } from "../utils/printTickets";

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
  if (status === "EN_SERVICIO") return "En servicio";
  if (status === "PAGO_SOLICITADO") return "Solicitud de pago";
  if (status === "PAGO_REPORTADO") return "Pago reportado";
  if (status === "PAGO_CONFIRMADO") return "Pago confirmado";
  if (status === "ESPERANDO_PAGO") return "Esperando pago";
  if (status === "LISTA_PARA_CERRAR") return "Lista para cerrar";
  if (status === "CERRADA") return "Cerrada";
  return status;
}

function statusClass(status) {
  if (status === "SIN_PEDIDO") return "badge";
  if (status === "EN_SERVICIO") return "badge badge-received";
  if (status === "PAGO_SOLICITADO") return "badge badge-progress";
  if (status === "PAGO_REPORTADO") return "badge badge-progress";
  if (status === "PAGO_CONFIRMADO") return "badge badge-done";
  if (status === "ESPERANDO_PAGO") return "badge badge-received";
  if (status === "LISTA_PARA_CERRAR") return "badge badge-delivered";
  if (status === "CERRADA") return "badge badge-neutral";
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

function printStatusLabel(status) {
  if (status === "TOTAL") return "total";
  if (status === "PARTIAL") return "faltan";
  if (status === "NONE") return "ninguna";
  if (status === "PRINTED") return "impreso";
  if (status === "PENDING") return "pendiente";
  if (status === "NOT_APPLICABLE") return "no aplica";
  return status || "-";
}

function printStatusClass(status) {
  if (status === "TOTAL" || status === "PRINTED") return "badge badge-delivered";
  if (status === "PARTIAL") return "badge badge-progress";
  if (status === "NONE" || status === "PENDING") return "badge badge-received";
  return "badge";
}

function printButtonLabel({ target, status, sector }) {
  const printed = status === "PRINTED";
  if (target === "FULL") return printed ? "Ya impreso" : "Imprimir pedido completo";
  if (target === "COMMANDS") return printed ? "Ya impresas" : "Imprimir comandas";
  return printed ? `Ya impreso ${sectorLabel(sector)}` : `Imprimir ${sectorLabel(sector)}`;
}

function missingPrintTargets(printStatus) {
  const targets = [];
  if (printStatus?.full_status === "PENDING") {
    targets.push("FULL");
  }
  if (printStatus?.commands_status === "PENDING") {
    targets.push("COMMANDS");
  }
  return targets;
}

function getSectorPrintState(printStatus, sector) {
  return (printStatus?.sectors || []).find((entry) => entry.sector === sector) || null;
}

function requiredPrintSectors(printStatus) {
  return (printStatus?.sectors || []).filter((entry) => entry.required);
}

function itemLabelWithNotes(item) {
  const notes = String(item?.notes || "").trim();
  const label = item?.item_name || item?.product_name || `Item ${item?.item_id || item?.id || "-"}`;
  return notes ? `${item.qty}x ${label} (${notes})` : `${item.qty}x ${label}`;
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
  rows = [],
  loading = false,
  tableSessionsRows = [],
  onRequestOrderDetail,
  onAdvanceItem,
  advancingKey = "",
  actorSector = "ADMIN",
  onCloseTableByCode = () => {},
  onForceCloseTableByCode = () => {},
  closingTable = false,
  onRequestWaiterCalls = async () => [],
  onRequestTableSessionConsumption = async () => null,
  onResolveWaiterCall = async () => {},
  onConfirmReportedPayments = async () => {},
  validatingPaymentKey = "",
  onMarkPrint = async () => {},
  printingKey = "",
  printMode = "MANUAL",
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalDetail, setModalDetail] = useState(null);
  const [modalSessionConsumption, setModalSessionConsumption] = useState(null);
  const [waiterPopover, setWaiterPopover] = useState(null);
  const [waiterSignals, setWaiterSignals] = useState({});
  const [cashSignals, setCashSignals] = useState({});
  const [takingCallId, setTakingCallId] = useState(null);
  const [acceptingCashRequestId, setAcceptingCashRequestId] = useState(null);
  const [forceCloseTarget, setForceCloseTarget] = useState(null);
  const seenCashAlarmRef = useRef("");
  const autoPrintModalRef = useRef("");

  const tableRows = useMemo(() => {
    const sessionByTable = tableSessionsRows.reduce((acc, session) => {
      acc[session.table_code] = session;
      return acc;
    }, {});

    const groupedOrders = rows.reduce((acc, row) => {
      if (!acc[row.table_code]) {
        acc[row.table_code] = [];
      }
      acc[row.table_code].push(row);
      return acc;
    }, {});

    const tableCodes = Object.keys(sessionByTable);

    return tableCodes
      .map((tableCode) => {
        const tableOrders = [...(groupedOrders[tableCode] || [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const tableSession = sessionByTable[tableCode];
        const sessionOrders = tableOrders.filter((order) => order.is_active_session);
        const effectiveOrders = sessionOrders.length > 0 ? sessionOrders : tableOrders;
        const liveOrders = effectiveOrders.filter(
          (order) => Number(order.delivered_items || 0) < Number(order.total_items || 0)
        );
        const pendingOrders = effectiveOrders.filter((order) => !order.payment_confirmed);
        const visibleOrders =
          liveOrders.length > 0 ? liveOrders : pendingOrders.length > 0 ? pendingOrders : effectiveOrders;
        const leadOrder = visibleOrders[0] || effectiveOrders[0] || null;
        const qty = visibleOrders.reduce((sum, order) => sum + Number(order.total_items || 0), 0);
        const delivered = visibleOrders.reduce((sum, order) => sum + Number(order.delivered_items || 0), 0);
        const total = visibleOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
        const hasPendingPayment = effectiveOrders.some((order) => Boolean(order.has_pending_payment));
        const hasConfirmedPayment =
          effectiveOrders.length > 0 && effectiveOrders.every((order) => Boolean(order.payment_confirmed));
        const cashSignal = tableSession?.table_session_id ? cashSignals[tableSession.table_session_id] : null;
        const hasPendingCashPayment = Number(cashSignal?.pending || 0) > 0;
        const hasAcceptedCashPayment = Boolean(cashSignal?.latestResolved);
        const sectorList = [
          ...new Set(
            visibleOrders.flatMap((order) =>
              (order.sectors || [])
                .filter((sectorState) => sectorState.status !== "DELIVERED")
                .map((sectorState) => sectorState.sector)
            )
          ),
        ];
        const sessionOpen = tableSession?.status !== "CLOSED";
        const hasItems = qty > 0;
        const allDelivered = hasItems && delivered >= qty;
        const status =
          !hasItems
            ? "SIN_PEDIDO"
            : !sessionOpen
            ? "CERRADA"
            : hasPendingCashPayment
            ? "PAGO_SOLICITADO"
            : hasPendingPayment
            ? "PAGO_REPORTADO"
            : hasConfirmedPayment && allDelivered
            ? "LISTA_PARA_CERRAR"
            : hasConfirmedPayment
            ? "PAGO_CONFIRMADO"
            : allDelivered
            ? "ESPERANDO_PAGO"
            : "EN_SERVICIO";
        const printStatuses = visibleOrders.map((order) => order.print_status?.overall_status || "NONE");
        const printStatus = printStatuses.every((value) => value === "TOTAL")
          ? "TOTAL"
          : printStatuses.every((value) => value === "NONE")
          ? "NONE"
          : "PARTIAL";
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
          all_delivered: allDelivered,
          payment_confirmed: hasConfirmedPayment,
          total,
          print_status: printStatus,
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
      .filter((row) => row.table_session_id)
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
    setModalSessionConsumption(null);
    setModalError("");
    setModalLoading(true);
    try {
      const results = await Promise.allSettled([
        row.lead_order_id && typeof onRequestOrderDetail === "function"
          ? onRequestOrderDetail(row.lead_order_id)
          : Promise.resolve(null),
        kind === "TABLE" && row.table_session_id && typeof onRequestTableSessionConsumption === "function"
          ? onRequestTableSessionConsumption(row.table_session_id)
          : Promise.resolve(null),
      ]);
      const detail = results[0]?.status === "fulfilled" ? results[0].value : null;
      const sessionConsumption = results[1]?.status === "fulfilled" ? results[1].value : null;
      setModalDetail(detail);
      setModalSessionConsumption(sessionConsumption);
      if (!detail && !sessionConsumption) {
        const detailError = results[0]?.status === "rejected" ? results[0].reason : null;
        const sessionError = results[1]?.status === "rejected" ? results[1].reason : null;
        throw new Error(
          detailError?.message || sessionError?.message || "No se pudo cargar detalle de la mesa."
        );
      }
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

  const hasTableConsumption = activeModal?.kind === "TABLE" && Boolean(modalSessionConsumption);
  const modalItems =
    activeModal?.kind === "TABLE"
      ? modalSessionConsumption?.items || modalDetail?.items || []
      : activeModal?.kind === "SECTOR"
      ? itemsInProcess(modalDetail?.items || []).filter((item) => item.sector === activeModal.sector)
      : itemsInProcess(modalDetail?.items || []);
  const modalConsumptionTotal =
    activeModal?.kind === "TABLE"
      ? modalItems.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.qty || 0), 0)
      : 0;
  const modalTableElapsedLabel =
    activeModal?.kind === "TABLE" ? elapsedLabel(activeModal?.row?.elapsed_minutes || 0) : "-";

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

  async function handlePrintAction(detail, target) {
    if (!detail?.order_id) return;
    setModalError("");
    try {
      if (target === "FULL") {
        printFullOrderTicket(detail);
        await onMarkPrint({ orderId: detail.order_id, target: "FULL" });
        return;
      }
      if (target === "COMMANDS") {
        printOrderCommands(detail);
        await onMarkPrint({ orderId: detail.order_id, target: "COMMANDS" });
        return;
      }
      printSectorCommand(detail, target);
      await onMarkPrint({ orderId: detail.order_id, target });
    } catch (error) {
      setModalError(error?.message || "No se pudo imprimir el pedido.");
    }
  }

  async function handlePrintMissing(detail) {
    const targets = missingPrintTargets(detail?.print_status);
    if (targets.length === 0) {
      setModalError("No hay faltantes de impresion para este pedido.");
      return;
    }
    for (const target of targets) {
      // eslint-disable-next-line no-await-in-loop
      await handlePrintAction(detail, target);
    }
  }

  useEffect(() => {
    if (printMode !== "AUTOMATIC") return;
    if (activeModal?.kind !== "TABLE") return;
    if (!modalDetail?.order_id) return;
    if (missingPrintTargets(modalDetail.print_status).length === 0) return;

    const key = `${activeModal.kind}:${modalDetail.order_id}:${modalDetail.print_status?.overall_status}`;
    if (autoPrintModalRef.current === key) return;
    autoPrintModalRef.current = key;
    handlePrintMissing(modalDetail);
  }, [printMode, activeModal, modalDetail]);

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
                <th>Impresion</th>
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
                    <span className={printStatusClass(row.print_status)}>{printStatusLabel(row.print_status)}</span>
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
                    {row.status === "CERRADA" ? (
                      <span className="muted">Mesa cerrada</span>
                    ) : (
                      <div className="order-actions">
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
                          <button
                            className="btn-primary"
                            disabled={validatingPaymentKey === String(row.lead_order_id || "")}
                            onClick={() => confirmReportedPayments(row)}
                          >
                            {validatingPaymentKey === String(row.lead_order_id || "")
                              ? "Confirmando..."
                              : "Confirmar pago"}
                          </button>
                        ) : row.status === "LISTA_PARA_CERRAR" ? (
                          <button
                            className="btn-secondary"
                            disabled={closingTable}
                            onClick={() => onCloseTableByCode(row.table_code)}
                          >
                            {closingTable ? "Cerrando..." : "Cerrar mesa"}
                          </button>
                        ) : row.status === "PAGO_CONFIRMADO" ? (
                          <span className="muted">Pago listo. Falta entrega para cerrar.</span>
                        ) : row.status === "ESPERANDO_PAGO" ? (
                          <span className="muted">Todo entregado. Falta pago.</span>
                        ) : (
                          <span className="muted">Servicio en curso</span>
                        )}
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
              {!modalLoading && !modalError && !modalDetail && !hasTableConsumption && (
                <p className="muted">Esta mesa aun no tiene pedido enviado.</p>
              )}
              {!modalLoading && !modalError && (modalDetail || hasTableConsumption) && (
                <div className="staff-modal-list">
                  {activeModal.kind === "TABLE_PRINT" && <article className="detail-card">
                    <h4>Impresion</h4>
                    <div className="sector-list">
                      <div className="sector-row">
                        <span>Estado general</span>
                        <span className={printStatusClass(modalDetail.print_status?.overall_status)}>
                          {printStatusLabel(modalDetail.print_status?.overall_status)}
                        </span>
                        {missingPrintTargets(modalDetail.print_status).length > 0 ? (
                          <button
                            className="btn-primary"
                            disabled={Boolean(printingKey)}
                            onClick={() => handlePrintMissing(modalDetail)}
                          >
                            {printingKey ? "..." : "Reimprimir faltantes"}
                          </button>
                        ) : (
                          <span className="muted">
                            Mesa {modalDetail.table_code} · Pedido #{modalDetail.order_id}
                          </span>
                        )}
                      </div>
                      <div className="sector-row">
                        <span>Pedido completo</span>
                        <span className={printStatusClass(modalDetail.print_status?.full_status)}>
                          {printStatusLabel(modalDetail.print_status?.full_status)}
                        </span>
                        <button
                          className="btn-secondary"
                          disabled={printingKey === `${modalDetail.order_id}:FULL`}
                          onClick={() => handlePrintAction(modalDetail, "FULL")}
                        >
                          {printingKey === `${modalDetail.order_id}:FULL`
                            ? "..."
                            : printButtonLabel({
                                target: "FULL",
                                status: modalDetail.print_status?.full_status,
                              })}
                        </button>
                      </div>
                      <div className="sector-row">
                        <span>Comandas</span>
                        <span className={printStatusClass(modalDetail.print_status?.commands_status)}>
                          {printStatusLabel(modalDetail.print_status?.commands_status)}
                        </span>
                        <button
                          className="btn-secondary"
                          disabled={printingKey === `${modalDetail.order_id}:COMMANDS`}
                          onClick={() => handlePrintAction(modalDetail, "COMMANDS")}
                        >
                          {printingKey === `${modalDetail.order_id}:COMMANDS`
                            ? "..."
                            : printButtonLabel({
                                target: "COMMANDS",
                                status: modalDetail.print_status?.commands_status,
                              })}
                        </button>
                      </div>
                      {(modalDetail.print_status?.sectors || []).map((sectorState) => (
                        <div className="sector-row" key={`print-${sectorState.sector}`}>
                          <span>{sectorLabel(sectorState.sector)}</span>
                          <span className={printStatusClass(sectorState.status)}>
                            {printStatusLabel(sectorState.status)}
                          </span>
                          {sectorState.required ? (
                            <button
                              className="btn-secondary"
                              disabled={printingKey === `${modalDetail.order_id}:${sectorState.sector}`}
                              onClick={() => handlePrintAction(modalDetail, sectorState.sector)}
                            >
                              {printingKey === `${modalDetail.order_id}:${sectorState.sector}`
                                ? "..."
                                : printButtonLabel({
                                    target: sectorState.sector,
                                    status: sectorState.status,
                                    sector: sectorState.sector,
                                  })}
                            </button>
                          ) : (
                            <span className="muted">No aplica</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </article>}
                  {activeModal.kind === "SECTOR" && (
                    <div className="sector-row">
                      <span>Comanda</span>
                      <span
                        className={printStatusClass(
                          getSectorPrintState(modalDetail.print_status, activeModal.sector)?.status
                        )}
                      >
                        {printStatusLabel(getSectorPrintState(modalDetail.print_status, activeModal.sector)?.status)}
                      </span>
                      <span className="muted">
                        {getSectorPrintState(modalDetail.print_status, activeModal.sector)?.status === "PRINTED"
                          ? "La comanda del sector ya fue impresa."
                          : "La comanda del sector sigue pendiente."}
                      </span>
                    </div>
                  )}
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
                        onClick={() => forceCloseTable(activeModal.row)}
                      >
                        {closingTable ? "Cerrando..." : "Forzar cierre"}
                      </button>
                      <span className="muted">Cerrar mesa queda habilitado recien despues de confirmar el pago.</span>
                    </div>
                  )}
                  {activeModal.kind === "STATUS" && activeModal.row.status === "PAGO_CONFIRMADO" && (
                    <div className="order-actions">
                      <span className="muted">Pago confirmado. La mesa sigue abierta hasta terminar la entrega.</span>
                      <button
                        className="btn-secondary"
                        disabled={closingTable}
                        onClick={() => forceCloseTable(activeModal.row)}
                      >
                        {closingTable ? "Cerrando..." : "Forzar cierre"}
                      </button>
                    </div>
                  )}
                  {activeModal.kind === "STATUS" && activeModal.row.status === "ESPERANDO_PAGO" && (
                    <div className="order-actions">
                      <span className="muted">Todo esta entregado, pero todavia falta confirmar el pago.</span>
                      <button
                        className="btn-secondary"
                        disabled={closingTable}
                        onClick={() => forceCloseTable(activeModal.row)}
                      >
                        {closingTable ? "Cerrando..." : "Forzar cierre"}
                      </button>
                    </div>
                  )}
                  {activeModal.kind === "STATUS" && activeModal.row.status === "LISTA_PARA_CERRAR" && (
                    <div className="order-actions">
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
                      <span className="muted">Todo entregado y pago confirmado. Ya podes cerrar la mesa.</span>
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
                modalItems.map((item) => (
                  <div key={item.item_id} className="staff-modal-row">
                    <p className="staff-modal-item-name">
                      {itemLabelWithNotes(item)}
                    </p>
                    <div className="staff-modal-meta-inline">
                      <span className={sectorClass(item.sector)}>{sectorLabel(item.sector)}</span>
                      <span className="badge">{itemStatusLabel(item.status)}</span>
                      <span className="muted">{elapsedLabel(elapsedMinutes(item.updated_at || item.created_at))}</span>
                      {activeModal.kind === "TABLE" && <strong>{formatMoney(Number(item.unit_price || 0) * Number(item.qty || 0))}</strong>}
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
              {modalItems.length === 0 && <p className="muted">No hay items para mostrar en este estado.</p>}
                  {activeModal.kind === "TABLE" && (
                    <article className="detail-card">
                      <div className="sector-row" style={{ justifyContent: "flex-end" }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: "0.2rem",
                          }}
                        >
                          <span className="muted">
                            Tiempo mesa: <strong>{modalTableElapsedLabel}</strong>
                          </span>
                          <span>
                            Total consumo: <strong>{formatMoney(modalConsumptionTotal)}</strong>
                          </span>
                        </div>
                      </div>
                    </article>
                  )}
                  {activeModal.kind === "TABLE" && <article className="detail-card">
                    <h4>Impresion</h4>
                    <div className="sector-list">
                      <div className="sector-row">
                        <span>Estado general</span>
                        <span className={printStatusClass(modalDetail.print_status?.overall_status)}>
                          {printStatusLabel(modalDetail.print_status?.overall_status)}
                        </span>
                        {missingPrintTargets(modalDetail.print_status).length > 0 ? (
                          <button
                            className="btn-primary"
                            disabled={Boolean(printingKey)}
                            onClick={() => handlePrintMissing(modalDetail)}
                          >
                            {printingKey ? "..." : "Reimprimir faltantes"}
                          </button>
                        ) : (
                          <span className="muted">
                            Mesa {modalDetail.table_code} · Pedido #{modalDetail.order_id}
                          </span>
                        )}
                      </div>
                      <div className="sector-row">
                        <span>Pedido completo</span>
                        <span className={printStatusClass(modalDetail.print_status?.full_status)}>
                          {printStatusLabel(modalDetail.print_status?.full_status)}
                        </span>
                        <button
                          className="btn-secondary"
                          disabled={printingKey === `${modalDetail.order_id}:FULL`}
                          onClick={() => handlePrintAction(modalDetail, "FULL")}
                        >
                          {printingKey === `${modalDetail.order_id}:FULL`
                            ? "..."
                            : printButtonLabel({
                                target: "FULL",
                                status: modalDetail.print_status?.full_status,
                              })}
                        </button>
                      </div>
                      {requiredPrintSectors(modalDetail.print_status).length > 1 && (
                        <div className="sector-row">
                          <span>Comandas</span>
                          <span className={printStatusClass(modalDetail.print_status?.commands_status)}>
                            {printStatusLabel(modalDetail.print_status?.commands_status)}
                          </span>
                          <button
                            className="btn-secondary"
                            disabled={printingKey === `${modalDetail.order_id}:COMMANDS`}
                            onClick={() => handlePrintAction(modalDetail, "COMMANDS")}
                          >
                            {printingKey === `${modalDetail.order_id}:COMMANDS`
                              ? "..."
                              : printButtonLabel({
                                  target: "COMMANDS",
                                  status: modalDetail.print_status?.commands_status,
                                })}
                          </button>
                        </div>
                      )}
                      {requiredPrintSectors(modalDetail.print_status).map((sectorState) => (
                        <div className="sector-row" key={`print-bottom-${sectorState.sector}`}>
                          <span>{sectorLabel(sectorState.sector)}</span>
                          <span className={printStatusClass(sectorState.status)}>
                            {printStatusLabel(sectorState.status)}
                          </span>
                          <button
                            className="btn-secondary"
                            disabled={printingKey === `${modalDetail.order_id}:${sectorState.sector}`}
                            onClick={() => handlePrintAction(modalDetail, sectorState.sector)}
                          >
                            {printingKey === `${modalDetail.order_id}:${sectorState.sector}`
                              ? "..."
                              : printButtonLabel({
                                  target: sectorState.sector,
                                  status: sectorState.status,
                                  sector: sectorState.sector,
                                })}
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>}
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
export default AdminBoardPage;
