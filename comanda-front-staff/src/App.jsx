"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAdminOrderItems,
  fetchAdminOrders,
  fetchFeedbackSummary,
  fetchStorePrintMode,
  fetchStaffBoardItems,
  fetchTableSessions,
  fetchTableSessionConsumption,
  fetchStaffOrderItems,
  fetchTableSessionCashRequests,
  markOrderPrintStatus,
  fetchStoreClientVisibility,
  openStaffEvents,
  closeTableSession,
  forceCloseTableSession,
  confirmSplitPart,
  forceConfirmOrderPayment,
  createEqualSplit,
  patchStoreClientVisibility,
  patchStorePrintMode,
  resolveCashRequest,
  patchItemStatus,
  patchTableSessionStatus,
} from "./api/staffApi";
import { LoginPage } from "./pages/LoginPage";
import { AdminBoardPage } from "./pages/AdminBoardPage";
import { KitchenBoardPage } from "./pages/KitchenBoardPage";
import { BarBoardPage } from "./pages/BarBoardPage";
import { WaiterBoardPage } from "./pages/WaiterBoardPage";
import { OrderDetailPanel } from "./pages/OrderDetailPanel";
import { FeedbackSummaryPage } from "./pages/FeedbackSummaryPage";
import { MenuEditorPage } from "./pages/MenuEditorPage";
import { TableSessionsPanel } from "./pages/TableSessionsPanel";
import { elapsedMinutes } from "./utils/boardMeta";
import { printFullOrderTicket, printOrderCommands } from "./utils/printTickets";

const STATUS_OPTIONS = ["", "RECEIVED", "IN_PROGRESS", "DONE", "PARCIAL", "DELIVERED"];
const ADMIN_QUEUE_OPTIONS = ["ACTIVE", "ALL", "DELIVERED"];
const ADMIN_VIEW_OPTIONS = ["BOARD", "FEEDBACK", "MENU"];
const ARG_TZ = "America/Argentina/Buenos_Aires";

function formatArgentinaClock(value) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ARG_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function getNextStatusForAction({ currentStatus, sector, actorSector }) {
  if (actorSector === "ADMIN") {
    if (sector === "WAITER" && currentStatus === "RECEIVED") return "DELIVERED";
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
    if (sector === "WAITER" && currentStatus === "RECEIVED") return "DELIVERED";
    if (currentStatus === "DONE") return "DELIVERED";
    return null;
  }
  return null;
}

function groupItemsByOrder(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.order_id;
    if (!map.has(key)) {
      map.set(key, {
        order_id: item.order_id,
        table_code: item.table_code,
        guest_count: item.guest_count,
        created_at: item.created_at,
        items: [],
      });
    }
    map.get(key).items.push(item);
  });

  return [...map.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function criticalThresholdBySector(sector) {
  if (sector === "WAITER") return 10;
  if (sector === "KITCHEN" || sector === "BAR") return 20;
  return 20;
}

function mediumThresholdBySector(sector) {
  if (sector === "WAITER") return 5;
  if (sector === "KITCHEN" || sector === "BAR") return 12;
  return 12;
}

function applyItemStatusToBoardRows(rows, itemId, nextStatus) {
  return rows
    .map((row) => {
      if (Array.isArray(row.items)) {
        const nextItems = row.items.map((item) =>
          item.item_id === itemId || item.id === itemId ? { ...item, status: nextStatus } : item
        );

        if (row.items.some((item) => item.item_id === itemId || item.id === itemId)) {
          return { ...row, items: nextItems };
        }
      }

      if (row.item_id === itemId || row.id === itemId) {
        return { ...row, status: nextStatus };
      }

      return row;
    })
    .filter((row) => {
      if (!Array.isArray(row.items)) return true;
      return row.items.length > 0;
    });
}

function applyItemStatusToDetail(detail, itemId, nextStatus) {
  if (!detail) return detail;
  if (!Array.isArray(detail.items)) return detail;
  return {
    ...detail,
    items: detail.items.map((item) =>
      item.item_id === itemId || item.id === itemId ? { ...item, status: nextStatus } : item
    ),
  };
}

export function App() {
  const [clockNow, setClockNow] = useState(() => new Date());
  const [session, setSession] = useState(null);
  const [boardRows, setBoardRows] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [adminQueueFilter, setAdminQueueFilter] = useState("ACTIVE");
  const [adminView, setAdminView] = useState("BOARD");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSummary, setFeedbackSummary] = useState(null);
  const [showLiveTotalToClient, setShowLiveTotalToClient] = useState(true);
  const [updatingClientVisibility, setUpdatingClientVisibility] = useState(false);
  const [printMode, setPrintMode] = useState("MANUAL");
  const [printModeSaving, setPrintModeSaving] = useState(false);
  const [advancingKey, setAdvancingKey] = useState("");
  const [tableSessionsRows, setTableSessionsRows] = useState([]);
  const [tableSessionsLoading, setTableSessionsLoading] = useState(false);
  const [tableSessionBusyId, setTableSessionBusyId] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [closingTable, setClosingTable] = useState(false);
  const [validatingPaymentKey, setValidatingPaymentKey] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);
  const [printingKey, setPrintingKey] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [alarmText, setAlarmText] = useState("");
  const lastDoneAlertRef = useRef("");
  const lastDelayAlertRef = useRef("");
  const lastCashAlertRef = useRef("");
  const attemptedAutoPrintRef = useRef(new Set());
  const autoPrintBusyRef = useRef(false);

  const playAlarm = useCallback((kind) => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const pattern =
        kind === "done"
          ? [
              { f: 980, d: 0.08, gap: 0.05 },
              { f: 1280, d: 0.1, gap: 0.05 },
            ]
          : [
              { f: 420, d: 0.14, gap: 0.08 },
              { f: 420, d: 0.14, gap: 0.08 },
              { f: 360, d: 0.18, gap: 0.05 },
            ];

      let t = ctx.currentTime + 0.01;
      pattern.forEach((tone) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = tone.f;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + tone.d + 0.01);
        t += tone.d + tone.gap;
      });
      setTimeout(() => ctx.close(), Math.ceil((t - ctx.currentTime + 0.1) * 1000));
    } catch {
      // no-op: sound is optional
    }
  }, [soundEnabled]);

  const staffSector = session?.staff?.sector;

  const loadBoard = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      if (session.staff.sector === "ADMIN") {
        const backendStatusFilter =
          statusFilter || (adminQueueFilter === "DELIVERED" ? "DELIVERED" : undefined);
        const data = await fetchAdminOrders({
          token: session.access_token,
          storeId: session.staff.store_id,
          status: backendStatusFilter,
        });
        setBoardRows(data.items);
      } else {
        const data = await fetchStaffBoardItems({
          token: session.access_token,
          storeId: session.staff.store_id,
          sector: session.staff.sector,
        });
        setBoardRows(groupItemsByOrder(data.items));
      }
    } catch (err) {
      setError(err.message || "No se pudieron cargar datos del tablero.");
    } finally {
      setLoading(false);
    }
  }, [session, statusFilter, adminQueueFilter]);

  const loadOrderDetail = useCallback(async () => {
    if (!selectedOrderId || !session) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      const detail =
        session.staff.sector === "ADMIN"
          ? await fetchAdminOrderItems({
              token: session.access_token,
              orderId: selectedOrderId,
            })
          : await fetchStaffOrderItems({
              token: session.access_token,
              orderId: selectedOrderId,
            });
      setSelectedOrderDetail(detail);
    } catch (err) {
      setDetailError(err.message || "No se pudo cargar detalle del pedido.");
    } finally {
      setDetailLoading(false);
    }
  }, [selectedOrderId, session]);

  const requestAdminOrderDetail = useCallback(
    async (orderId) => {
      if (!session || session.staff.sector !== "ADMIN" || !orderId) return null;
      return fetchAdminOrderItems({
        token: session.access_token,
        orderId,
      });
    },
    [session]
  );

  const requestAdminWaiterCalls = useCallback(
    async (tableSessionId) => {
      if (!session || session.staff.sector !== "ADMIN" || !tableSessionId) return [];
      return fetchTableSessionCashRequests({
        token: session.access_token,
        tableSessionId,
      });
    },
    [session]
  );

  const requestTableSessionConsumption = useCallback(
    async (tableSessionId) => {
      if (!session || session.staff.sector !== "ADMIN" || !tableSessionId) return null;
      return fetchTableSessionConsumption(tableSessionId);
    },
    [session]
  );

  const loadTableSessions = useCallback(async () => {
    if (!session) return;
    setTableSessionsLoading(true);
    try {
      const data = await fetchTableSessions({
        token: session.access_token,
        storeId: session.staff.store_id,
        onlyWithoutOrder: false,
      });
      setTableSessionsRows(data.items || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar mesas ocupadas.");
    } finally {
      setTableSessionsLoading(false);
    }
  }, [session]);

  const loadFeedback = useCallback(async () => {
    if (!session || session.staff.sector !== "ADMIN") return;
    setFeedbackLoading(true);
    setError("");
    try {
      const data = await fetchFeedbackSummary({
        token: session.access_token,
        storeId: session.staff.store_id,
        limit: 25,
      });
      setFeedbackSummary(data);
    } catch (err) {
      setError(err.message || "No se pudo cargar feedback de clientes.");
    } finally {
      setFeedbackLoading(false);
    }
  }, [session]);

  const loadStoreClientVisibility = useCallback(async () => {
    if (!session || session.staff.sector !== "ADMIN") return;
    try {
      const data = await fetchStoreClientVisibility({
        token: session.access_token,
        storeId: session.staff.store_id,
      });
      setShowLiveTotalToClient(Boolean(data.show_live_total_to_client));
    } catch (err) {
      setError(err.message || "No se pudo cargar visibilidad de total para cliente.");
    }
  }, [session]);

  const loadStorePrintMode = useCallback(async () => {
    if (!session || session.staff.sector !== "ADMIN") return;
    try {
      const data = await fetchStorePrintMode({
        token: session.access_token,
        storeId: session.staff.store_id,
      });
      setPrintMode(data.print_mode === "AUTOMATIC" ? "AUTOMATIC" : "MANUAL");
    } catch (err) {
      setError(err.message || "No se pudo cargar modo de impresion.");
    }
  }, [session]);

  const handleTogglePrintMode = useCallback(async () => {
    if (!session || session.staff.sector !== "ADMIN") return;
    const nextMode = printMode === "AUTOMATIC" ? "MANUAL" : "AUTOMATIC";
    setPrintModeSaving(true);
    setError("");
    try {
      const data = await patchStorePrintMode({
        token: session.access_token,
        storeId: session.staff.store_id,
        printMode: nextMode,
      });
      setPrintMode(data.print_mode === "AUTOMATIC" ? "AUTOMATIC" : "MANUAL");
    } catch (err) {
      setError(err.message || "No se pudo actualizar modo de impresion.");
    } finally {
      setPrintModeSaving(false);
    }
  }, [session, printMode]);

  const toggleClientTotalVisibility = useCallback(async () => {
    if (!session || session.staff.sector !== "ADMIN") return;
    setUpdatingClientVisibility(true);
    setError("");
    try {
      const data = await patchStoreClientVisibility({
        token: session.access_token,
        storeId: session.staff.store_id,
        showLiveTotalToClient: !showLiveTotalToClient,
      });
      setShowLiveTotalToClient(Boolean(data.show_live_total_to_client));
    } catch (err) {
      setError(err.message || "No se pudo actualizar visibilidad de total para cliente.");
    } finally {
      setUpdatingClientVisibility(false);
    }
  }, [session, showLiveTotalToClient]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrderDetail(null);
      setDetailError("");
      return;
    }
    loadOrderDetail();
  }, [selectedOrderId, loadOrderDetail]);

  const advanceItem = useCallback(
    async ({ itemId, currentStatus, itemSector }) => {
      if (!session) return;
      const toStatus = getNextStatusForAction({
        currentStatus,
        sector: itemSector,
        actorSector: session.staff.sector,
      });
      if (!toStatus) return;

      const key = `${itemId}:${toStatus}`;
      setAdvancingKey(key);
      setError("");

      try {
        await patchItemStatus({
          token: session.access_token,
          itemId,
          toStatus,
        });
        setBoardRows((current) => applyItemStatusToBoardRows(current, itemId, toStatus));
        setSelectedOrderDetail((current) => applyItemStatusToDetail(current, itemId, toStatus));

        const refreshTasks = [loadBoard()];
        if (selectedOrderId) {
          refreshTasks.push(loadOrderDetail());
        }
        await Promise.all(refreshTasks);
      } catch (err) {
        setError(err.message || "No se pudo actualizar el item.");
      } finally {
        setAdvancingKey("");
      }
    },
    [session, selectedOrderId, loadBoard, loadOrderDetail]
  );

  const closeTable = useCallback(async () => {
    if (!session || !selectedOrderDetail || session.staff.sector !== "ADMIN") return;
    setError("");
    setClosingTable(true);
    try {
      await closeTableSession({
        token: session.access_token,
        tableCode: selectedOrderDetail.table_code,
      });
      await loadBoard();
      await loadOrderDetail();
    } catch (err) {
      setError(err.message || "No se pudo cerrar la mesa.");
    } finally {
      setClosingTable(false);
    }
  }, [session, selectedOrderDetail, loadBoard, loadOrderDetail]);

  const closeTableByCode = useCallback(
    async (tableCode) => {
      if (!session || session.staff.sector !== "ADMIN" || !tableCode) return;
      setError("");
      setClosingTable(true);
      try {
        await closeTableSession({
          token: session.access_token,
          tableCode,
        });
        await loadBoard();
        await loadTableSessions();
        if (selectedOrderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || "No se pudo cerrar la mesa.");
      } finally {
        setClosingTable(false);
      }
    },
    [session, selectedOrderId, loadBoard, loadOrderDetail, loadTableSessions]
  );

  const forceCloseTableByCode = useCallback(
    async (tableCode) => {
      if (!session || session.staff.sector !== "ADMIN" || !tableCode) return;
      setError("");
      setClosingTable(true);
      try {
        await forceCloseTableSession({
          token: session.access_token,
          tableCode,
        });
        await loadBoard();
        await loadTableSessions();
        if (selectedOrderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || "No se pudo forzar el cierre de la mesa.");
      } finally {
        setClosingTable(false);
      }
    },
    [session, selectedOrderId, loadBoard, loadOrderDetail, loadTableSessions]
  );

  const confirmReportedPayments = useCallback(
    async (orderIds = []) => {
      if (!session || session.staff.sector !== "ADMIN") return;
      const ids = [...new Set((orderIds || []).map((id) => Number(id)).filter((id) => id > 0))];
      if (ids.length === 0) return;
      setError("");
      setValidatingPaymentKey(ids.join(","));
      try {
        for (const orderId of ids) {
          // eslint-disable-next-line no-await-in-loop
          let detail = await fetchAdminOrderItems({
            token: session.access_token,
            orderId,
          });
          let reportedParts = (detail?.bill_split?.parts || []).filter(
            (part) => part.payment_status === "REPORTED"
          );
          if (reportedParts.length > 0) {
            for (const part of reportedParts) {
              // eslint-disable-next-line no-await-in-loop
              await confirmSplitPart({ token: session.access_token, partId: part.id });
            }
          } else {
            await forceConfirmOrderPayment({ token: session.access_token, orderId });
          }
        }
        await loadBoard();
        await loadTableSessions();
        if (selectedOrderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || "No se pudo validar el pago.");
      } finally {
        setValidatingPaymentKey("");
      }
    },
    [session, selectedOrderId, loadBoard, loadOrderDetail, loadTableSessions]
  );

  const createSplit = useCallback(async () => {
    if (!selectedOrderDetail) return;
    setError("");
    setBillingBusy(true);
    try {
      await createEqualSplit({
        orderId: selectedOrderDetail.order_id,
        partsCount: Math.max(2, Number(selectedOrderDetail.guest_count || 2)),
      });
      await loadOrderDetail();
    } catch (err) {
      setError(err.message || "No se pudo crear la division.");
    } finally {
      setBillingBusy(false);
    }
  }, [selectedOrderDetail, loadOrderDetail]);

  const confirmPart = useCallback(
    async (partId) => {
      if (!session) return;
      setError("");
      setBillingBusy(true);
      try {
        await confirmSplitPart({ token: session.access_token, partId });
        await loadOrderDetail();
        await loadBoard();
        await loadTableSessions();
      } catch (err) {
        setError(err.message || "No se pudo confirmar el pago.");
      } finally {
        setBillingBusy(false);
      }
    },
    [session, loadOrderDetail, loadBoard, loadTableSessions]
  );

  const resolveCash = useCallback(
    async (cashRequestId) => {
      if (!session) return;
      setError("");
      setBillingBusy(true);
      try {
        await resolveCashRequest({ token: session.access_token, cashRequestId });
        await loadOrderDetail();
        await loadBoard();
        await loadTableSessions();
      } catch (err) {
        setError(err.message || "No se pudo resolver la solicitud de efectivo.");
      } finally {
        setBillingBusy(false);
      }
    },
    [session, loadOrderDetail, loadBoard, loadTableSessions]
  );

  const resolveWaiterCall = useCallback(
    async (cashRequestId) => {
      if (!session) return;
      await resolveCashRequest({ token: session.access_token, cashRequestId });
      await loadTableSessions();
      await loadBoard();
      if (selectedOrderId) {
        await loadOrderDetail();
      }
    },
    [session, selectedOrderId, loadTableSessions, loadBoard, loadOrderDetail]
  );

  const updateOrderPrintTracking = useCallback(
    async ({ orderId, target }) => {
      if (!session || session.staff.sector !== "ADMIN" || !orderId || !target) return;
      const key = `${orderId}:${target}`;
      setPrintingKey(key);
      setError("");
      try {
        await markOrderPrintStatus({
          token: session.access_token,
          orderId,
          target,
        });
        await loadBoard();
        await loadTableSessions();
        if (selectedOrderId === orderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || "No se pudo actualizar impresion del pedido.");
      } finally {
        setPrintingKey("");
      }
    },
    [session, selectedOrderId, loadBoard, loadTableSessions, loadOrderDetail]
  );

  const autoPrintOrder = useCallback(
    async (orderId) => {
      if (!session || session.staff.sector !== "ADMIN" || !orderId) return;
      if (autoPrintBusyRef.current) return;

      autoPrintBusyRef.current = true;
      attemptedAutoPrintRef.current.add(String(orderId));
      try {
        const detail = await fetchAdminOrderItems({
          token: session.access_token,
          orderId,
        });
        printFullOrderTicket(detail);
        await markOrderPrintStatus({
          token: session.access_token,
          orderId,
          target: "FULL",
        });
        printOrderCommands(detail);
        await markOrderPrintStatus({
          token: session.access_token,
          orderId,
          target: "COMMANDS",
        });
        await loadBoard();
        await loadTableSessions();
        if (selectedOrderId === orderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || `No se pudo imprimir automaticamente el pedido #${orderId}.`);
      } finally {
        autoPrintBusyRef.current = false;
      }
    },
    [session, selectedOrderId, loadBoard, loadTableSessions, loadOrderDetail]
  );

  const markTableSession = useCallback(
    async (tableSessionId, toStatus) => {
      if (!session || !tableSessionId) return;
      setError("");
      setTableSessionBusyId(tableSessionId);
      try {
        await patchTableSessionStatus({
          token: session.access_token,
          tableSessionId,
          toStatus,
        });
        await loadTableSessions();
        await loadBoard();
      } catch (err) {
        setError(err.message || "No se pudo actualizar la mesa.");
      } finally {
        setTableSessionBusyId(null);
      }
    },
    [session, loadTableSessions, loadBoard]
  );

  const board = useMemo(() => {
    const alertMetaByOrder = boardRows.reduce((acc, row) => {
      const mediumThreshold = mediumThresholdBySector(staffSector);
      const criticalThreshold = criticalThresholdBySector(staffSector);
      const delayed = (row.items || [])
        .map((item) => ({
          id: item.item_id,
          name: item.item_name,
          mins: elapsedMinutes(item.updated_at || item.created_at),
        }))
        .filter((item) => item.mins >= mediumThreshold)
        .sort((a, b) => b.mins - a.mins);

      const high = delayed.filter((item) => item.mins >= criticalThreshold).length;
      const medium = delayed.length - high;
      const top = delayed.slice(0, 5).map((item) => `${item.name} (${item.mins}m)`);

      acc[row.order_id] = {
        total: delayed.length,
        medium,
        high,
        severity: high > 0 ? "high" : delayed.length > 0 ? "medium" : "none",
        tooltip: top.length > 0 ? top.join(" | ") : "",
      };
      return acc;
    }, {});

    let visibleRows = [...boardRows];
    if (staffSector === "ADMIN") {
      if (adminQueueFilter === "ACTIVE") {
        visibleRows = visibleRows.filter(
          (row) =>
            row.status_aggregated !== "DELIVERED" ||
            Boolean(row.has_pending_payment) ||
            Boolean(row.is_active_session)
        );
      } else if (adminQueueFilter === "DELIVERED") {
        visibleRows = visibleRows.filter((row) => row.status_aggregated === "DELIVERED");
      }
      visibleRows.sort((a, b) => {
        const aActive =
          a.status_aggregated !== "DELIVERED" || Boolean(a.has_pending_payment) || Boolean(a.is_active_session)
            ? 1
            : 0;
        const bActive =
          b.status_aggregated !== "DELIVERED" || Boolean(b.has_pending_payment) || Boolean(b.is_active_session)
            ? 1
            : 0;
        if (aActive !== bActive) return bActive - aActive;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      const prioritizedRows = [...boardRows].sort((a, b) => {
        const am = alertMetaByOrder[a.order_id] || { high: 0, medium: 0 };
        const bm = alertMetaByOrder[b.order_id] || { high: 0, medium: 0 };
        if (bm.high !== am.high) return bm.high - am.high;
        if (bm.medium !== am.medium) return bm.medium - am.medium;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      visibleRows = alertsOnly
        ? prioritizedRows.filter((row) => (alertMetaByOrder[row.order_id]?.total || 0) > 0)
        : prioritizedRows;
    }

    const freshByOrder = visibleRows.reduce((acc, row) => {
      const ageMs = Date.now() - new Date(row.created_at).getTime();
      acc[row.order_id] = ageMs <= 3 * 60 * 1000;
      return acc;
    }, {});

    const sharedProps = {
      rows: visibleRows,
      loading,
      advancingKey,
      selectedOrderId,
      onAdvanceItem: advanceItem,
      onSelectOrder: setSelectedOrderId,
      actorSector: staffSector,
      alertMetaByOrder,
      freshByOrder,
    };

    if (staffSector === "ADMIN") {
      if (adminView === "MENU") {
        return (
          <MenuEditorPage token={session?.access_token} storeId={session?.staff?.store_id} />
        );
      }
      return (
        <AdminBoardPage
          rows={visibleRows}
          loading={loading}
          tableSessionsRows={tableSessionsRows}
          onRequestOrderDetail={requestAdminOrderDetail}
          onAdvanceItem={advanceItem}
          advancingKey={advancingKey}
          actorSector={staffSector}
          onCloseTableByCode={closeTableByCode}
          onForceCloseTableByCode={forceCloseTableByCode}
          closingTable={closingTable}
          onRequestWaiterCalls={requestAdminWaiterCalls}
          onRequestTableSessionConsumption={requestTableSessionConsumption}
          onResolveWaiterCall={resolveWaiterCall}
          onConfirmReportedPayments={confirmReportedPayments}
          validatingPaymentKey={validatingPaymentKey}
          onMarkPrint={updateOrderPrintTracking}
          printingKey={printingKey}
          printMode={printMode}
        />
      );
    }
    if (staffSector === "KITCHEN") return <KitchenBoardPage {...sharedProps} />;
    if (staffSector === "BAR") return <BarBoardPage {...sharedProps} />;
    if (staffSector === "WAITER") return <WaiterBoardPage {...sharedProps} />;
    return null;
  }, [
    boardRows,
    loading,
    advancingKey,
    selectedOrderId,
    advanceItem,
    staffSector,
    alertsOnly,
    adminQueueFilter,
    adminView,
    session,
    tableSessionsRows,
    requestAdminOrderDetail,
    requestAdminWaiterCalls,
    resolveWaiterCall,
    confirmReportedPayments,
    validatingPaymentKey,
  ]);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    const poll = async () => {
      if (session.staff.sector === "ADMIN") {
        if (adminView === "FEEDBACK") {
          await loadFeedback();
          await loadTableSessions();
          if (selectedOrderId) {
            await loadOrderDetail();
          }
          return;
        }
        if (adminView === "MENU") {
          await loadTableSessions();
          if (selectedOrderId) {
            await loadOrderDetail();
          }
          return;
        }
      }
      await loadBoard();
      await loadTableSessions();
      if (selectedOrderId) {
        await loadOrderDetail();
      }
    };
    poll();
    if (session.staff.sector === "ADMIN") {
      loadStoreClientVisibility();
      loadStorePrintMode();
    }
    const timer = setInterval(poll, 10000);
    return () => clearInterval(timer);
  }, [session, adminView, selectedOrderId, loadBoard, loadFeedback, loadTableSessions, loadOrderDetail, loadStoreClientVisibility, loadStorePrintMode]);

  useEffect(() => {
    if (!session || (session.staff.sector === "ADMIN" && adminView === "MENU")) return;

    const stream = openStaffEvents({
      storeId: session.staff.store_id,
      sector: session.staff.sector,
    });
    let refreshTimer = null;

    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        if (session.staff.sector === "ADMIN" && adminView === "FEEDBACK") {
          await loadFeedback();
        } else {
          await loadBoard();
        }
        await loadTableSessions();
        if (selectedOrderId) {
          await loadOrderDetail();
        }
      }, 250);
    };

    const handleItemChanged = (event) => {
      scheduleRefresh();
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!payload) return;
      const itemId = payload.item_id ? String(payload.item_id) : "";
      if (payload.item_status === "DONE" && (session.staff.sector === "WAITER" || session.staff.sector === "ADMIN")) {
        if (lastDoneAlertRef.current !== itemId) {
          lastDoneAlertRef.current = itemId;
          setAlarmText(`Item listo en pedido #${payload.order_id || "?"}`);
          playAlarm("done");
        }
      }
    };

    const handleCashRequested = (event) => {
      scheduleRefresh();
      if (session.staff.sector !== "ADMIN") return;

      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload || payload.request_kind !== "CASH_PAYMENT") return;

      const cashRequestId = payload.cash_request_id ? String(payload.cash_request_id) : "";
      if (!cashRequestId || lastCashAlertRef.current === cashRequestId) return;
      lastCashAlertRef.current = cashRequestId;
      setAlarmText(`Mesa ${payload.table_code || "?"} quiere pagar`);
      playAlarm("delay");
    };

    const handleCashResolved = (event) => {
      scheduleRefresh();
      if (session.staff.sector !== "ADMIN") return;

      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload || payload.request_kind !== "CASH_PAYMENT") return;
      setAlarmText(`Pago tomado en mesa ${payload.table_code || "?"}`);
    };

    stream.onopen = () => setLiveConnected(true);
    stream.onerror = () => setLiveConnected(false);
    stream.onmessage = scheduleRefresh;
    stream.addEventListener("items.changed", handleItemChanged);
    stream.addEventListener("order.created", scheduleRefresh);
    stream.addEventListener("table.session.closed", scheduleRefresh);
    stream.addEventListener("bill.split.updated", scheduleRefresh);
    stream.addEventListener("bill.cash.requested", handleCashRequested);
    stream.addEventListener("bill.cash.resolved", handleCashResolved);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      stream.close();
      setLiveConnected(false);
    };
  }, [session, adminView, selectedOrderId, loadBoard, loadFeedback, loadOrderDetail, loadTableSessions, playAlarm]);

  useEffect(() => {
    if (!session || session.staff.sector === "ADMIN") return;
    const criticalMins = criticalThresholdBySector(session.staff.sector);
    const criticalRows = boardRows.filter((row) =>
      (row.items || []).some((item) => elapsedMinutes(item.updated_at || item.created_at) >= criticalMins)
    );
    if (criticalRows.length === 0) return;

    const id = `${session.staff.sector}:${criticalRows[0].order_id}`;
    if (lastDelayAlertRef.current === id) return;
    lastDelayAlertRef.current = id;
    setAlarmText(`Demora critica en mesa ${criticalRows[0].table_code}`);
    playAlarm("delay");
  }, [boardRows, session, playAlarm]);

  useEffect(() => {
    if (!alarmText) return;
    const timer = setTimeout(() => setAlarmText(""), 5000);
    return () => clearTimeout(timer);
  }, [alarmText]);

  useEffect(() => {
    if (!session || session.staff.sector !== "ADMIN") return;
    if (adminView !== "BOARD" || printMode !== "AUTOMATIC") return;
    if (autoPrintBusyRef.current) return;

    const candidate = [...boardRows]
      .filter(
        (row) =>
          Boolean(row.is_active_session) &&
          row.print_status?.overall_status === "NONE" &&
          !attemptedAutoPrintRef.current.has(String(row.order_id))
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

    if (!candidate?.order_id) return;
    autoPrintOrder(candidate.order_id);
  }, [session, adminView, printMode, boardRows, autoPrintOrder]);

  if (!session) {
    return <LoginPage onLogin={setSession} />;
  }

  return (
    <main className="staff-shell">
      <header className="staff-hero">
        <div>
          <p className="kicker">Panel operativo</p>
          <h1>Comanda Staff</h1>
          <p className="muted">
            Usuario: <strong>{session.staff.username}</strong> | Sector: <strong>{session.staff.sector}</strong>
          </p>
          <p className={liveConnected ? "live-pill live-pill-on" : "live-pill"}>
            {liveConnected ? "Tiempo real conectado" : "Tiempo real reconectando"}
          </p>
          {alarmText && <p className="alarm-text">{alarmText}</p>}
        </div>
        <div className="hero-actions">
          <div className="hero-clock" aria-live="polite">
            <span className="hero-clock-label">Hora AR</span>
            <strong>{formatArgentinaClock(clockNow)}</strong>
          </div>
          <button className={soundEnabled ? "btn-secondary" : "btn-primary"} onClick={() => setSoundEnabled((v) => !v)}>
            {soundEnabled ? "Silenciar alarmas" : "Activar alarmas"}
          </button>
          <button className="btn-secondary" onClick={() => setSession(null)}>
            Cerrar sesion
          </button>
        </div>
      </header>

      {staffSector === "ADMIN" && (
        <section className="panel toolbar">
          <label className="field">
            Vista
            <select value={adminView} onChange={(e) => setAdminView(e.target.value)}>
              {ADMIN_VIEW_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === "BOARD"
                    ? "PEDIDOS"
                    : mode === "FEEDBACK"
                    ? "FEEDBACK CLIENTES"
                    : mode === "MENU"
                    ? "EDITOR DE MENÚ"
                    : mode}
                </option>
              ))}
            </select>
          </label>

          {adminView === "BOARD" && (
            <>
              <label className="field">
                Cola
                <select value={adminQueueFilter} onChange={(e) => setAdminQueueFilter(e.target.value)}>
                  {ADMIN_QUEUE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === "ACTIVE" ? "ACTIVOS (default)" : mode === "ALL" ? "TODOS" : "SOLO ENTREGADOS"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Filtrar por estado general
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status || "all"} value={status}>
                      {status || "TODOS"}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <button
            className="btn-primary"
            onClick={adminView === "FEEDBACK" ? loadFeedback : loadBoard}
            disabled={adminView === "FEEDBACK" ? feedbackLoading : loading}
          >
            {adminView === "FEEDBACK"
              ? feedbackLoading
                ? "Actualizando..."
                : "Actualizar feedback"
              : loading
              ? "Actualizando..."
              : "Actualizar ahora"}
          </button>

          {adminView === "BOARD" && (
            <label className="field inline-field">
              <span>Solo alertas</span>
              <input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} />
            </label>
          )}
          <label className="field inline-field">
            <span>Total visible cliente</span>
            <input
              type="checkbox"
              checked={showLiveTotalToClient}
              onChange={toggleClientTotalVisibility}
              disabled={updatingClientVisibility}
            />
          </label>
          <div className="field inline-field">
            <span>Impresion</span>
            <button className={printMode === "AUTOMATIC" ? "btn-primary" : "btn-secondary"} onClick={handleTogglePrintMode} disabled={printModeSaving}>
              {printModeSaving ? "Guardando..." : printMode === "AUTOMATIC" ? "Automatico" : "Manual"}
            </button>
          </div>
        </section>
      )}

      {staffSector !== "ADMIN" && (
        <section className="panel toolbar">
          <label className="field inline-field">
            <span>Solo alertas</span>
            <input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} />
          </label>
          <button className="btn-primary" onClick={loadBoard} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar ahora"}
          </button>
        </section>
      )}

      {error && <p className="error-text">{error}</p>}
      {!(staffSector === "ADMIN" && adminView === "BOARD") && (
        <TableSessionsPanel
          rows={tableSessionsRows}
          loading={tableSessionsLoading}
          actorSector={staffSector}
          busyId={tableSessionBusyId}
          onMarkRetired={(id) => markTableSession(id, "SE_RETIRARON")}
        />
      )}
      {staffSector === "ADMIN" && adminView === "FEEDBACK" ? (
        <FeedbackSummaryPage loading={feedbackLoading} summary={feedbackSummary} />
      ) : (
        board
      )}

      {!(staffSector === "ADMIN" && (adminView === "FEEDBACK" || adminView === "BOARD")) && (
        <OrderDetailPanel
          orderDetail={selectedOrderDetail}
          selectedOrderId={selectedOrderId}
          loading={detailLoading}
          error={detailError}
          actorSector={staffSector}
          onRefresh={loadOrderDetail}
          onAdvanceItem={advanceItem}
          advancingKey={advancingKey}
          onCloseTable={closeTable}
          onForceCloseTable={() => forceCloseTableByCode(selectedOrderDetail?.table_code)}
          closingTable={closingTable}
          onCreateSplit={createSplit}
          onConfirmPart={confirmPart}
          onResolveCashRequest={resolveCash}
          billingBusy={billingBusy}
        />
      )}
    </main>
  );
}
