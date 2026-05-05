"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bootstrapShift,
  fetchAdminOrderItems,
  fetchAdminOrders,
  fetchFeedbackSummary,
  fetchStorePrintMode,
  fetchActiveShift,
  openCashSession,
  closeCashSession,
  collectOrderPayment,
  fetchStaffBoardItems,
  fetchShiftSummaries,
  fetchTables,
  fetchTableSessions,
  fetchTableSessionConsumption,
  fetchStaffOrderItems,
  fetchTableSessionCashRequests,
  markOrderPrintStatus,
  fetchStoreClientVisibility,
  openStaffEvents,
  closeTableSession,
  forceCloseTableSession,
  closeShift,
  confirmBarOrderPayment,
  approveOrder,
  confirmSplitPart,
  forceConfirmOrderPayment,
  createEqualSplit,
  patchStoreClientVisibility,
  patchStorePrintMode,
  resolveCashRequest,
  rejectOrder,
  moveTableSession,
  patchItemStatus,
  patchTableSessionStatus,
  enableRestaurantCheckout,
} from "./api/staffApi";
import { LoginPage } from "./pages/LoginPage";
import { AdminBoardPage } from "./pages/AdminBoardPage";
import { KitchenBoardPage } from "./pages/KitchenBoardPage";
import { BarBoardPage } from "./pages/BarBoardPage";
import { WaiterBoardPage } from "./pages/WaiterBoardPage";
import { OrderDetailPanel } from "./pages/OrderDetailPanel";
import { FeedbackSummaryPage } from "./pages/FeedbackSummaryPage";
import { MenuEditorPage } from "./pages/MenuEditorPage";
import { StoreProfilePage } from "./pages/StoreProfilePage";
import { StoreMessagingPage } from "./pages/StoreMessagingPage";
import { ShiftClosurePage } from "./pages/ShiftClosurePage";
import { ShiftSummariesPage } from "./pages/ShiftSummariesPage";
import { SalonTablesPage } from "./pages/SalonTablesPage";
import { TableSessionsPanel } from "./pages/TableSessionsPanel";
import { TableQrPage } from "./pages/TableQrPage";
import { StartupGatePage } from "./pages/StartupGatePage";
import { elapsedMinutes } from "./utils/boardMeta";
import { printFullOrderTicket, printOrderCommands } from "./utils/printTickets";

const STATUS_OPTIONS = ["", "RECEIVED", "IN_PROGRESS", "DONE", "PARCIAL", "DELIVERED"];
const ADMIN_QUEUE_OPTIONS = ["ACTIVE", "ALL", "DELIVERED"];
const ADMIN_VIEW_OPTIONS = ["BOARD", "SALON", "BAR", "FEEDBACK", "PROFILE", "MENU", "QR", "MESSAGING", "CLOSURE", "SUMMARIES"];
const ADMIN_TABS_STORAGE_KEY = "comanda_staff_admin_tabs_v1";
const ARG_TZ = "America/Argentina/Buenos_Aires";

function normalizeAdminViewOrder(value) {
  const movable = ADMIN_VIEW_OPTIONS.filter((mode) => mode !== "BOARD");
  const incoming = Array.isArray(value) ? value.filter((mode) => movable.includes(mode)) : [];
  const ordered = [...new Set(incoming)];
  const missing = movable.filter((mode) => !ordered.includes(mode));
  return ["BOARD", ...ordered, ...missing];
}

function adminViewLabel(mode) {
  if (mode === "BOARD") return "PEDIDOS";
  if (mode === "SALON") return "SALON";
  if (mode === "BAR") return "QR BAR";
  if (mode === "FEEDBACK") return "FEEDBACK CLIENTES";
  if (mode === "MENU") return "EDITOR DE MENÚ";
  if (mode === "QR") return "QR RESTAURANTE";
  if (mode === "PROFILE") return "MI LOCAL";
  if (mode === "MESSAGING") return "MENSAJES";
  if (mode === "CLOSURE") return "CIERRE";
  if (mode === "SUMMARIES") return "RESUMENES";
  return mode;
}

function formatArgentinaClock(value) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ARG_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function toShiftSummary(summary) {
  const paymentTotals = Array.isArray(summary?.payment_totals)
    ? summary.payment_totals.map((entry) => ({
        paymentMethod: entry.payment_method,
        totalAmount: Number(entry.total_amount || 0),
        paymentsCount: Number(entry.payments_count || 0),
      }))
    : [];
  const pendingOrders = Array.isArray(summary?.pending_orders)
    ? summary.pending_orders.map((entry) => ({
        orderId: entry.order_id,
        tableCode: entry.table_code,
        guestCount: Number(entry.guest_count || 0),
        totalAmount: Number(entry.total_amount || 0),
        paidAmount: Number(entry.paid_amount || 0),
        balanceDue: Number(entry.balance_due || 0),
        createdAt: entry.created_at,
      }))
    : [];

  return {
    closedCovers: Number(summary?.closed_covers || 0),
    closedTables: Number(summary?.closed_tables || 0),
    totalRevenue: Number(summary?.total_revenue || 0),
    collectedTotal: Number(summary?.collected_total || 0),
    avgDurationMinutes: Number(summary?.avg_duration_minutes || 0),
    avgRating: Number(summary?.avg_rating || 0),
    feedbackCount: Number(summary?.feedback_count || 0),
    closedTableDetails: Array.isArray(summary?.closed_table_details)
      ? summary.closed_table_details.map((entry) => ({
          tableCode: entry.table_code,
          guestCount: Number(entry.guest_count || 0),
          totalAmount: Number(entry.total_amount || 0),
          durationMinutes: Number(entry.duration_minutes || 0),
          closedAt: entry.closed_at,
        }))
      : [],
    paymentTotals,
    pendingOrders,
    pendingOrdersCount: Number(summary?.pending_orders_count || pendingOrders.length || 0),
    historicalServiceTimes: {
      avgTableDurationMinutes: Number(summary?.historical_service_times?.avg_table_duration_minutes || 0),
      closedTablesCount: Number(summary?.historical_service_times?.closed_tables_count || 0),
      sectorAverages: Array.isArray(summary?.historical_service_times?.sector_averages)
        ? summary.historical_service_times.sector_averages.map((entry) => ({
            sector: entry.sector,
            casesCount: Number(entry.cases_count || 0),
            avgDurationMinutes: Number(entry.avg_duration_minutes || 0),
          }))
        : [],
    },
    cashSession: summary?.cash_session
        ? {
            id: summary.cash_session.id,
            status: summary.cash_session.status,
            openingFloat: Number(summary.cash_session.opening_float || 0),
            collectedAmount: Number(summary.cash_session.collected_amount || 0),
            cashCollectedAmount: Number(summary.cash_session.cash_collected_amount || 0),
            expectedAmount: Number(summary.cash_session.expected_amount || 0),
            declaredAmount:
              summary.cash_session.declared_amount === null || summary.cash_session.declared_amount === undefined
              ? null
              : Number(summary.cash_session.declared_amount),
          differenceAmount: Number(summary.cash_session.difference_amount || 0),
          note: summary.cash_session.note || "",
          openedAt: summary.cash_session.opened_at,
          closedAt: summary.cash_session.closed_at,
        }
      : null,
  };
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

function applyItemEventPayloadToBoardRows(rows, payload) {
  if (!payload?.item_id || !payload?.item_status) return rows;
  return applyItemStatusToBoardRows(rows, payload.item_id, payload.item_status);
}

function applyItemEventPayloadToDetail(detail, payload) {
  if (!payload?.item_id || !payload?.item_status) return detail;
  return applyItemStatusToDetail(detail, payload.item_id, payload.item_status);
}

function SalonOrderModal({
  open = false,
  onClose = () => {},
  orderDetail,
  selectedOrderId,
  loading = false,
  error = "",
  advancingKey = "",
  closingTableCode = "",
  billingBusy = false,
  onRefresh = () => {},
  onAdvanceItem = () => {},
  onCloseTable = () => {},
  onForceCloseTable = () => {},
  onCreateSplit = () => {},
  onConfirmPart = () => {},
  onApproveOrder = () => {},
  onRejectOrder = () => {},
  onResolveCashRequest = () => {},
  availableTables = [],
  busyId = null,
  onMoveTableSession = async () => {},
}) {
  const [moveTargetTableCode, setMoveTargetTableCode] = useState("");

  if (!open) return null;

  const title = orderDetail?.table_code
    ? `Mesa ${orderDetail.table_code} · Pedido #${orderDetail.order_id || selectedOrderId || "-"}`
    : `Pedido #${selectedOrderId || "-"}`;
  const subtitle = orderDetail
    ? `${orderDetail.guest_count || 0} personas · ${orderDetail.total_items || 0} items`
    : "Detalle operativo del pedido abierto desde el salon.";
  const availableMoveTargets = (availableTables || []).filter(
    (table) => table.table_code !== orderDetail?.table_code && !table.active_table_session_id
  );
  const tableSessionId = orderDetail?.table_session_id || null;

  useEffect(() => {
    if (!availableMoveTargets.length) {
      setMoveTargetTableCode("");
      return;
    }
    if (!availableMoveTargets.some((table) => table.table_code === moveTargetTableCode)) {
      setMoveTargetTableCode(availableMoveTargets[0].table_code);
    }
  }, [availableMoveTargets, moveTargetTableCode]);

  return (
    <div className="staff-modal-backdrop" onClick={onClose}>
      <div className="staff-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="staff-modal-head">
          <div>
            <h4>{title}</h4>
            <p className="muted">{subtitle}</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            X
          </button>
        </div>
        <div className="staff-modal-body">
          {tableSessionId ? (
            <div className="detail-card" style={{ marginBottom: 14 }}>
              <h4>Cambiar mesa</h4>
              <div className="order-actions">
                <select
                  value={moveTargetTableCode}
                  onChange={(event) => setMoveTargetTableCode(event.target.value)}
                  disabled={busyId === tableSessionId || availableMoveTargets.length === 0}
                >
                  {availableMoveTargets.length === 0 ? (
                    <option value="">No hay mesas libres</option>
                  ) : (
                    availableMoveTargets.map((table) => (
                      <option key={table.table_code} value={table.table_code}>
                        {table.table_code}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busyId === tableSessionId || !moveTargetTableCode || availableMoveTargets.length === 0}
                  onClick={() => onMoveTableSession(tableSessionId, moveTargetTableCode)}
                >
                  {busyId === tableSessionId ? "Cambiando..." : "Cambiar mesa"}
                </button>
              </div>
            </div>
          ) : null}
          <OrderDetailPanel
            orderDetail={orderDetail}
            selectedOrderId={selectedOrderId}
            loading={loading}
            error={error}
            actorSector="ADMIN"
            onRefresh={onRefresh}
            onAdvanceItem={onAdvanceItem}
            advancingKey={advancingKey}
            onCloseTable={onCloseTable}
            onForceCloseTable={onForceCloseTable}
            closingTableCode={closingTableCode}
            onCreateSplit={onCreateSplit}
            onConfirmPart={onConfirmPart}
            onApproveOrder={onApproveOrder}
            onRejectOrder={onRejectOrder}
            onResolveCashRequest={onResolveCashRequest}
            billingBusy={billingBusy}
          />
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [clockNow, setClockNow] = useState(() => new Date());
  const [session, setSession] = useState(null);
  const [recentClosedShift, setRecentClosedShift] = useState(null);
  const [boardRows, setBoardRows] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [adminQueueFilter, setAdminQueueFilter] = useState("ACTIVE");
  const [adminView, setAdminView] = useState("BOARD");
  const [adminViewOrder, setAdminViewOrder] = useState(() => normalizeAdminViewOrder(ADMIN_VIEW_OPTIONS));
  const [draggingAdminView, setDraggingAdminView] = useState("");
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
  const [tablesRows, setTablesRows] = useState([]);
  const [tableSessionsLoading, setTableSessionsLoading] = useState(false);
  const [tableSessionBusyId, setTableSessionBusyId] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [closingTableCode, setClosingTableCode] = useState("");
  const [validatingPaymentKey, setValidatingPaymentKey] = useState("");
  const [confirmingBarPaymentKey, setConfirmingBarPaymentKey] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);
  const [printingKey, setPrintingKey] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [alarmText, setAlarmText] = useState("");
  const [recentOrderActivity, setRecentOrderActivity] = useState({});
  const [activeShift, setActiveShift] = useState(null);
  const [shiftSummary, setShiftSummary] = useState(() => toShiftSummary(null));
  const [adminStartupGate, setAdminStartupGate] = useState(null);
  const [startupBusy, setStartupBusy] = useState(false);
  const [shiftSummaries, setShiftSummaries] = useState([]);
  const [cashBusy, setCashBusy] = useState(false);
  const [collectingPaymentKey, setCollectingPaymentKey] = useState("");
  const lastDoneAlertRef = useRef("");
  const lastDelayAlertRef = useRef("");
  const lastCashAlertRef = useRef("");
  const lastIncomingOrderAlertRef = useRef("");
  const adminOrderSnapshotRef = useRef({});
  const adminOrderSnapshotReadyRef = useRef(false);
  const attemptedAutoPrintRef = useRef(new Set());
  const autoPrintBusyRef = useRef(false);
  const boardRefreshInFlightRef = useRef(false);

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

  const activeCovers = useMemo(
    () => (tableSessionsRows || []).reduce((sum, row) => sum + Number(row.guest_count || 0), 0),
    [tableSessionsRows]
  );

  const loadBoard = useCallback(async ({ silent = false } = {}) => {
    if (!session) return;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      if (session.staff.sector === "ADMIN") {
        const backendStatusFilter =
          statusFilter || (adminQueueFilter === "DELIVERED" ? "DELIVERED" : undefined);
        const data = await fetchAdminOrders({
          token: session.access_token,
          storeId: session.staff.store_id,
          status: backendStatusFilter,
        });
        const nextItems = data.items || [];
        const previousSnapshot = adminOrderSnapshotRef.current;
        const changedRows = nextItems
          .filter((row) => {
            const previous = previousSnapshot[row.order_id];
            if (!previous) return false;
            const nextTime = new Date(row.updated_at || row.created_at || 0).getTime();
            const prevTime = new Date(previous.updated_at || previous.created_at || 0).getTime();
            return (
              nextTime > prevTime ||
              Number(row.total_items || 0) > Number(previous.total_items || 0) ||
              Number(row.total_amount || 0) > Number(previous.total_amount || 0)
            );
          })
          .sort(
            (a, b) =>
              new Date(b.updated_at || b.created_at || 0).getTime() -
              new Date(a.updated_at || a.created_at || 0).getTime()
          );

        if (adminOrderSnapshotReadyRef.current && changedRows.length > 0) {
          const leadChanged = changedRows[0];
          const alertKey = `poll:${leadChanged.order_id}:${leadChanged.updated_at || leadChanged.created_at || ""}`;
          if (lastIncomingOrderAlertRef.current !== alertKey) {
            lastIncomingOrderAlertRef.current = alertKey;
            setAlarmText(`Mesa ${leadChanged.table_code || "?"} tuvo actividad nueva`);
            playAlarm("delay");
            setRecentOrderActivity((current) => {
              const previous = current[leadChanged.order_id] || { at: 0, count: 0 };
              return {
                ...current,
                [leadChanged.order_id]: {
                  at: Date.now(),
                  count: Number(previous.count || 0) + 1,
                },
              };
            });
            if ((adminView === "SALON" || adminView === "BOARD") && leadChanged.order_id) {
              setSelectedOrderId(leadChanged.order_id);
            }
          }
        }

        adminOrderSnapshotRef.current = Object.fromEntries(nextItems.map((row) => [row.order_id, row]));
        adminOrderSnapshotReadyRef.current = true;
        setBoardRows(nextItems);
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
      if (!silent) {
        setLoading(false);
      }
    }
  }, [session, statusFilter, adminQueueFilter, adminView, playAlarm]);

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

  const loadTables = useCallback(async () => {
    if (!session) return;
    try {
      const data = await fetchTables({
        token: session.access_token,
        storeId: session.staff.store_id,
      });
      setTablesRows(data.items || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las mesas del local.");
    }
  }, [session]);

  const loadShiftState = useCallback(async () => {
    if (!session) return;
    try {
      const data = await fetchActiveShift({
        token: session.access_token,
        storeId: session.staff.store_id,
      });
      setActiveShift(data.active_shift || null);
      setShiftSummary(toShiftSummary(data.summary));
    } catch (err) {
      setError(err.message || "No se pudo cargar el turno activo.");
    }
  }, [session]);

  const loadShiftSummaries = useCallback(async () => {
    if (!session || session.staff.sector !== "ADMIN") return;
    try {
      const data = await fetchShiftSummaries({
        token: session.access_token,
        storeId: session.staff.store_id,
      });
      setShiftSummaries(data.items || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los resúmenes.");
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
      if (!activeShift) {
        setError("No hay turno abierto. Un encargado debe abrir turno y caja primero.");
        return;
      }
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
    [session, activeShift, selectedOrderId, loadBoard, loadOrderDetail]
  );

  const closeTable = useCallback(async () => {
    if (!session || !selectedOrderDetail || session.staff.sector !== "ADMIN") return;
    const tableCode = selectedOrderDetail.table_code;
    setError("");
    setClosingTableCode(tableCode);
    try {
      await closeTableSession({
        token: session.access_token,
        tableCode,
      });
      const refreshTasks = [loadBoard(), loadTableSessions()];
      refreshTasks.push(loadShiftState());
      if (selectedOrderId) {
        refreshTasks.push(loadOrderDetail());
      }
      await Promise.all(refreshTasks);
    } catch (err) {
      setError(err.message || "No se pudo cerrar la mesa.");
    } finally {
      setClosingTableCode("");
    }
  }, [session, selectedOrderDetail, selectedOrderId, loadBoard, loadOrderDetail, loadTableSessions, loadShiftState]);

  const closeTableByCode = useCallback(
    async (tableCode) => {
      if (!session || session.staff.sector !== "ADMIN" || !tableCode) return;
      setError("");
      setClosingTableCode(tableCode);
      try {
        await closeTableSession({
          token: session.access_token,
          tableCode,
        });
        const refreshTasks = [loadBoard(), loadTableSessions()];
        refreshTasks.push(loadShiftState());
        if (selectedOrderId) {
          refreshTasks.push(loadOrderDetail());
        }
        await Promise.all(refreshTasks);
      } catch (err) {
        setError(err.message || "No se pudo cerrar la mesa.");
      } finally {
        setClosingTableCode("");
      }
    },
    [session, selectedOrderId, loadBoard, loadOrderDetail, loadTableSessions, loadShiftState]
  );

  const forceCloseTableByCode = useCallback(
    async (tableCode) => {
      if (!session || session.staff.sector !== "ADMIN" || !tableCode) return;
      setError("");
      setClosingTableCode(tableCode);
      try {
        await forceCloseTableSession({
          token: session.access_token,
          tableCode,
        });
        const refreshTasks = [loadBoard(), loadTableSessions()];
        refreshTasks.push(loadShiftState());
        if (selectedOrderId) {
          refreshTasks.push(loadOrderDetail());
        }
        await Promise.all(refreshTasks);
      } catch (err) {
        setError(err.message || "No se pudo forzar el cierre de la mesa.");
      } finally {
        setClosingTableCode("");
      }
    },
    [session, selectedOrderId, loadBoard, loadOrderDetail, loadTableSessions, loadShiftState]
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

  const confirmBarPayment = useCallback(
    async (orderId) => {
      if (!session || session.staff.sector !== "ADMIN" || !orderId) return;
      setError("");
      setConfirmingBarPaymentKey(String(orderId));
      try {
        await confirmBarOrderPayment({
          token: session.access_token,
          orderId,
        });
        await loadBoard();
        await loadTableSessions();
        if (selectedOrderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || "No se pudo confirmar el pago BAR.");
      } finally {
        setConfirmingBarPaymentKey("");
      }
    },
    [session, selectedOrderId, loadBoard, loadOrderDetail, loadTableSessions]
  );

  const approvePendingOrder = useCallback(
    async (orderId) => {
      if (!session || session.staff.sector !== "ADMIN" || !orderId) return;
      setError("");
      setConfirmingBarPaymentKey(`approve:${orderId}`);
      try {
        await approveOrder({
          token: session.access_token,
          orderId,
        });
        await loadBoard();
        await loadTableSessions();
        if (selectedOrderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || "No se pudo aceptar el pedido.");
      } finally {
        setConfirmingBarPaymentKey("");
      }
    },
    [session, selectedOrderId, loadBoard, loadOrderDetail, loadTableSessions]
  );

  const rejectPendingOrder = useCallback(
    async (orderId) => {
      if (!session || session.staff.sector !== "ADMIN" || !orderId) return;
      setError("");
      setConfirmingBarPaymentKey(`reject:${orderId}`);
      try {
        await rejectOrder({
          token: session.access_token,
          orderId,
        });
        if (selectedOrderId === orderId) {
          setSelectedOrderId(null);
        }
        await loadBoard();
        await loadTableSessions();
      } catch (err) {
        setError(err.message || "No se pudo rechazar el pedido.");
      } finally {
        setConfirmingBarPaymentKey("");
      }
    },
    [session, selectedOrderId, loadBoard, loadTableSessions]
  );

  const enableCheckoutForTableSession = useCallback(
    async (tableSessionId) => {
      if (!session || session.staff.sector !== "ADMIN" || !tableSessionId) return;
      setError("");
      setConfirmingBarPaymentKey(`checkout:${tableSessionId}`);
      try {
        await enableRestaurantCheckout({
          token: session.access_token,
          tableSessionId,
        });
        await loadBoard();
        await loadTableSessions();
        if (selectedOrderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || "No se pudo habilitar el cierre.");
      } finally {
        setConfirmingBarPaymentKey("");
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
      if (!activeShift) {
        setError("No hay turno abierto. Un encargado debe abrir turno y caja primero.");
        return;
      }
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
    [session, activeShift, loadOrderDetail, loadBoard, loadTableSessions]
  );

  const resolveWaiterCall = useCallback(
    async (cashRequestId) => {
      if (!session) return;
      if (!activeShift) {
        setError("No hay turno abierto. Un encargado debe abrir turno y caja primero.");
        return;
      }
      await resolveCashRequest({ token: session.access_token, cashRequestId });
      await loadTableSessions();
      await loadBoard({ silent: true });
      if (selectedOrderId) {
        await loadOrderDetail();
      }
    },
    [session, activeShift, selectedOrderId, loadTableSessions, loadBoard, loadOrderDetail]
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
      if (!activeShift) {
        setError("No hay turno abierto. Un encargado debe abrir turno y caja primero.");
        return;
      }
      setError("");
      setTableSessionBusyId(tableSessionId);
      try {
        await patchTableSessionStatus({
          token: session.access_token,
          tableSessionId,
          toStatus,
        });
        await Promise.all([loadTableSessions(), loadBoard(), loadShiftState()]);
      } catch (err) {
        setError(err.message || "No se pudo actualizar la mesa.");
      } finally {
        setTableSessionBusyId(null);
      }
    },
    [session, activeShift, loadTableSessions, loadBoard, loadShiftState]
  );

  const moveActiveTableSession = useCallback(
    async (tableSessionId, targetTableCode) => {
      if (!session || session.staff.sector !== "ADMIN" || !tableSessionId || !targetTableCode) return;
      setError("");
      setTableSessionBusyId(tableSessionId);
      try {
        await moveTableSession({
          token: session.access_token,
          tableSessionId,
          targetTableCode,
        });
        await Promise.all([loadTables(), loadTableSessions(), loadBoard(), loadShiftState()]);
        if (selectedOrderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || "No se pudo cambiar la mesa.");
        throw err;
      } finally {
        setTableSessionBusyId(null);
      }
    },
    [session, selectedOrderId, loadTables, loadTableSessions, loadBoard, loadShiftState, loadOrderDetail]
  );

  const handleCloseShiftPreview = useCallback(async () => {
    if (!session || session.staff.sector !== "ADMIN") return;
    try {
      const data = await closeShift({
        token: session.access_token,
        storeId: session.staff.store_id,
      });
      const closedShift = data.closed_shift;
      const dateLabel = new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: ARG_TZ,
      }).format(new Date(closedShift.closed_at || new Date()));
      setRecentClosedShift({
        label: closedShift.label || "Turno actual",
        user: closedShift.operator_name || session?.staff?.display_name || session?.staff?.username || "admin",
        dateLabel,
      });
      setAdminStartupGate(null);
      setActiveShift(null);
      setShiftSummary(toShiftSummary(null));
      setSession(null);
    } catch (err) {
      setError(err.message || "No se pudo cerrar el turno.");
    }
  }, [session]);

  const handleOpenCashSession = useCallback(
    async ({ openingFloat, note }) => {
      if (!session || session.staff.sector !== "ADMIN") return;
      setCashBusy(true);
      try {
        const data = await openCashSession({
          token: session.access_token,
          storeId: session.staff.store_id,
          openingFloat,
          note,
        });
        setShiftSummary(toShiftSummary(data.summary));
      } catch (err) {
        setError(err.message || "No se pudo abrir la caja.");
      } finally {
        setCashBusy(false);
      }
    },
    [session]
  );

  const handleCloseCashSession = useCallback(
    async ({ declaredAmount, note }) => {
      if (!session || session.staff.sector !== "ADMIN") return;
      setCashBusy(true);
      try {
        const data = await closeCashSession({
          token: session.access_token,
          storeId: session.staff.store_id,
          declaredAmount,
          note,
        });
        setShiftSummary(toShiftSummary(data.summary));
      } catch (err) {
        setError(err.message || "No se pudo cerrar la caja.");
      } finally {
        setCashBusy(false);
      }
    },
    [session]
  );

  const handleCollectOrderPayment = useCallback(
    async ({ orderId, paymentMethod, amount, note }) => {
      if (!session || session.staff.sector !== "ADMIN") return;
      setCollectingPaymentKey(String(orderId));
      try {
        await collectOrderPayment({
          token: session.access_token,
          orderId,
          paymentMethod,
          amount,
          note,
        });
        await Promise.all([loadShiftState(), loadBoard(), loadTableSessions()]);
        if (selectedOrderId === orderId) {
          await loadOrderDetail();
        }
      } catch (err) {
        setError(err.message || "No se pudo registrar el cobro.");
      } finally {
        setCollectingPaymentKey("");
      }
    },
    [session, loadShiftState, loadBoard, loadTableSessions, selectedOrderId, loadOrderDetail]
  );

  const resetOperationalSession = useCallback(() => {
    setSession(null);
    setActiveShift(null);
    setShiftSummary(toShiftSummary(null));
    setAdminStartupGate(null);
    setStartupBusy(false);
  }, []);

  const handleLoginWithShift = useCallback(
    async (nextSession) => {
      try {
        const activeData = await fetchActiveShift({
          token: nextSession.access_token,
          storeId: nextSession.staff.store_id,
        });
        setActiveShift(activeData.active_shift || null);
        setShiftSummary(toShiftSummary(activeData.summary));
        setAdminStartupGate(
          nextSession?.staff?.sector === "ADMIN"
            ? activeData?.active_shift
              ? "PENDING"
              : "OPEN"
            : null
        );
      } catch (err) {
        setError(err.message || "No se pudo cargar el estado operativo.");
        throw err;
      }
      setRecentClosedShift(null);
      setSession(nextSession);
    },
    []
  );

  const handleBootstrapShift = useCallback(
    async ({ label, operatorName, openingFloat, note }) => {
      if (!session || session.staff.sector !== "ADMIN") return;
      setStartupBusy(true);
      setError("");
      try {
        const data = await bootstrapShift({
          token: session.access_token,
          storeId: session.staff.store_id,
          label,
          operatorName,
          openingFloat,
          note,
        });
        setActiveShift(data.active_shift || null);
        setShiftSummary(toShiftSummary(data.summary));
        setAdminView("BOARD");
        setAdminStartupGate("READY");
      } catch (err) {
        setError(err.message || "No se pudo abrir el turno y la caja.");
      } finally {
        setStartupBusy(false);
      }
    },
    [session]
  );

  const handleResolvePendingShift = useCallback(() => {
    setAdminView("CLOSURE");
    setAdminStartupGate("READY");
  }, []);

  const acknowledgeRecentOrderActivity = useCallback((orderId) => {
    if (!orderId) return;
    setRecentOrderActivity((current) => {
      if (!current[orderId]) return current;
      const next = { ...current };
      delete next[orderId];
      return next;
    });
  }, []);

  const moveAdminViewTab = useCallback((fromMode, toMode) => {
    if (!fromMode || !toMode || fromMode === toMode) return;
    if (fromMode === "BOARD" || toMode === "BOARD") return;
    setAdminViewOrder((current) => {
      const ordered = normalizeAdminViewOrder(current);
      const fromIndex = ordered.indexOf(fromMode);
      const toIndex = ordered.indexOf(toMode);
      if (fromIndex < 0 || toIndex < 0) return ordered;
      const next = [...ordered];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromMode);
      return normalizeAdminViewOrder(next);
    });
  }, []);

  const board = useMemo(() => {
    const readOnlyReason =
      staffSector !== "ADMIN" && !activeShift
        ? "No hay turno abierto. El encargado debe abrir turno y caja antes de operar."
        : "";
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
        const recentDiff =
          Number(recentOrderActivity[b.order_id]?.at || 0) - Number(recentOrderActivity[a.order_id]?.at || 0);
        if (recentDiff !== 0) return recentDiff;
        return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
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
      const ageMs = Date.now() - new Date(row.updated_at || row.created_at).getTime();
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
      readOnlyReason,
    };

    if (staffSector === "ADMIN") {
      if (adminView === "SALON") {
        return (
          <SalonTablesPage
            token={session?.access_token}
            storeId={session?.staff?.store_id}
            tables={tablesRows}
            loading={tableSessionsLoading}
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
            onMarkRetired={(tableSessionId) => markTableSession(tableSessionId, "SE_RETIRARON")}
            onMoveTableSession={moveActiveTableSession}
            onTableCreated={loadTables}
            busyId={tableSessionBusyId}
          />
        );
      }
      if (adminView === "MENU") {
        return (
          <MenuEditorPage
            token={session?.access_token}
            storeId={session?.staff?.store_id}
            staffDisplayName={session?.staff?.display_name || session?.staff?.username}
          />
        );
      }
      if (adminView === "PROFILE") {
        return (
          <StoreProfilePage
            token={session?.access_token}
            storeId={session?.staff?.store_id}
            sessionStaffId={session?.staff?.id}
            staffDisplayName={session?.staff?.display_name || session?.staff?.username}
          />
        );
      }
      if (adminView === "MESSAGING") {
        return <StoreMessagingPage token={session?.access_token} storeId={session?.staff?.store_id} />;
      }
      if (adminView === "BAR") {
        const barRows = visibleRows.filter(
          (row) =>
            row.service_mode === "BAR" ||
            (row.items || []).some((item) => item.sector === "BAR")
        );
        const barTableSessionsRows = (tableSessionsRows || []).filter((row) => row.service_mode === "BAR");
        return (
          <div style={{ display: "grid", gap: 18 }}>
            <AdminBoardPage
              rows={barRows}
              loading={loading}
              tableSessionsRows={barTableSessionsRows}
              onRequestOrderDetail={requestAdminOrderDetail}
              onAdvanceItem={advanceItem}
              advancingKey={advancingKey}
              actorSector={staffSector}
              onCloseTableByCode={closeTableByCode}
              onForceCloseTableByCode={forceCloseTableByCode}
              closingTableCode={closingTableCode}
              onRequestWaiterCalls={requestAdminWaiterCalls}
              onRequestTableSessionConsumption={requestTableSessionConsumption}
              onResolveWaiterCall={resolveWaiterCall}
              onApproveOrder={approvePendingOrder}
              onRejectOrder={rejectPendingOrder}
              onEnableRestaurantCheckout={enableCheckoutForTableSession}
              onConfirmReportedPayments={confirmReportedPayments}
              validatingPaymentKey={validatingPaymentKey}
              onConfirmBarPayment={confirmBarPayment}
              confirmingBarPaymentKey={confirmingBarPaymentKey}
              onMarkPrint={updateOrderPrintTracking}
              printingKey={printingKey}
              printMode={printMode}
              recentOrderActivity={recentOrderActivity}
              onAcknowledgeRecentOrderActivity={acknowledgeRecentOrderActivity}
            />
            <TableQrPage
              storeId={session?.staff?.store_id}
              initialServiceMode="BAR"
              title="QR BAR"
            />
          </div>
        );
      }
      if (adminView === "QR") {
        const restaurantRows = visibleRows.filter((row) => row.service_mode !== "BAR");
        const restaurantTableSessionsRows = (tableSessionsRows || []).filter((row) => row.service_mode !== "BAR");
        return (
          <div style={{ display: "grid", gap: 18 }}>
            <AdminBoardPage
              rows={restaurantRows}
              loading={loading}
              tableSessionsRows={restaurantTableSessionsRows}
              onRequestOrderDetail={requestAdminOrderDetail}
              onAdvanceItem={advanceItem}
              advancingKey={advancingKey}
              actorSector={staffSector}
              onCloseTableByCode={closeTableByCode}
              onForceCloseTableByCode={forceCloseTableByCode}
              closingTableCode={closingTableCode}
              onRequestWaiterCalls={requestAdminWaiterCalls}
              onRequestTableSessionConsumption={requestTableSessionConsumption}
              onResolveWaiterCall={resolveWaiterCall}
              onApproveOrder={approvePendingOrder}
              onRejectOrder={rejectPendingOrder}
              onEnableRestaurantCheckout={enableCheckoutForTableSession}
              onConfirmReportedPayments={confirmReportedPayments}
              validatingPaymentKey={validatingPaymentKey}
              onConfirmBarPayment={confirmBarPayment}
              confirmingBarPaymentKey={confirmingBarPaymentKey}
              onMarkPrint={updateOrderPrintTracking}
              printingKey={printingKey}
              printMode={printMode}
              recentOrderActivity={recentOrderActivity}
              onAcknowledgeRecentOrderActivity={acknowledgeRecentOrderActivity}
            />
            <TableQrPage
              storeId={session?.staff?.store_id}
              initialServiceMode="RESTAURANTE"
              title="QR RESTAURANTE"
            />
          </div>
        );
      }
      if (adminView === "CLOSURE") {
        return (
          <ShiftClosurePage
            session={session}
            activeShift={activeShift}
            shiftSummary={shiftSummary}
            cashBusy={cashBusy}
            collectingPaymentKey={collectingPaymentKey}
            onOpenCashSession={handleOpenCashSession}
            onCloseCashSession={handleCloseCashSession}
            onCollectOrderPayment={handleCollectOrderPayment}
            onConfirmCloseShift={handleCloseShiftPreview}
            onBackToBoard={() => setAdminView("BOARD")}
          />
        );
      }
      if (adminView === "SUMMARIES") {
        return <ShiftSummariesPage items={shiftSummaries} />;
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
          closingTableCode={closingTableCode}
          onRequestWaiterCalls={requestAdminWaiterCalls}
          onRequestTableSessionConsumption={requestTableSessionConsumption}
          onResolveWaiterCall={resolveWaiterCall}
          onApproveOrder={approvePendingOrder}
          onRejectOrder={rejectPendingOrder}
          onEnableRestaurantCheckout={enableCheckoutForTableSession}
          onConfirmReportedPayments={confirmReportedPayments}
          validatingPaymentKey={validatingPaymentKey}
          onConfirmBarPayment={confirmBarPayment}
          confirmingBarPaymentKey={confirmingBarPaymentKey}
          onMarkPrint={updateOrderPrintTracking}
          printingKey={printingKey}
          printMode={printMode}
          recentOrderActivity={recentOrderActivity}
          onAcknowledgeRecentOrderActivity={acknowledgeRecentOrderActivity}
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
    tablesRows,
    requestAdminOrderDetail,
    requestAdminWaiterCalls,
    resolveWaiterCall,
    approvePendingOrder,
    rejectPendingOrder,
    confirmReportedPayments,
    confirmBarPayment,
    confirmingBarPaymentKey,
    validatingPaymentKey,
    activeShift,
    shiftSummary,
    shiftSummaries,
    cashBusy,
    collectingPaymentKey,
    recentOrderActivity,
    handleCloseShiftPreview,
    handleOpenCashSession,
    handleCloseCashSession,
    handleCollectOrderPayment,
    markTableSession,
    tableSessionsLoading,
    tableSessionBusyId,
  ]);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(ADMIN_TABS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setAdminViewOrder(normalizeAdminViewOrder(parsed));
    } catch {
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ADMIN_TABS_STORAGE_KEY, JSON.stringify(normalizeAdminViewOrder(adminViewOrder)));
    } catch {
    }
  }, [adminViewOrder]);

  const runBoardRefresh = useCallback(async () => {
    if (!session || boardRefreshInFlightRef.current) return;
    boardRefreshInFlightRef.current = true;
    try {
      if (session.staff.sector === "ADMIN" && adminStartupGate && adminStartupGate !== "READY") {
        await loadShiftState();
        return;
      }
      if (session.staff.sector === "ADMIN") {
        await loadTables();
        if (adminView === "FEEDBACK") {
          await loadFeedback();
          await loadTableSessions();
          await loadShiftState();
          if (selectedOrderId) {
            await loadOrderDetail();
          }
          return;
        }
        if (
          adminView === "SALON" ||
          adminView === "MENU" ||
          adminView === "QR" ||
          adminView === "PROFILE" ||
          adminView === "MESSAGING" ||
          adminView === "CLOSURE" ||
          adminView === "SUMMARIES"
        ) {
          await loadTableSessions();
          await loadShiftState();
          if (adminView === "SUMMARIES") {
            await loadShiftSummaries();
          }
          if (selectedOrderId) {
            await loadOrderDetail();
          }
          return;
        }
      }
      await loadBoard();
      await loadTableSessions();
      if (session.staff.sector === "ADMIN") {
        await loadShiftState();
      }
      if (selectedOrderId) {
        await loadOrderDetail();
      }
    } finally {
      boardRefreshInFlightRef.current = false;
    }
  }, [
    session,
    adminStartupGate,
    adminView,
    selectedOrderId,
    loadBoard,
    loadFeedback,
    loadTableSessions,
    loadOrderDetail,
    loadShiftState,
    loadShiftSummaries,
    loadTables,
  ]);

  useEffect(() => {
    if (!session) return;
    const poll = async () => {
      await runBoardRefresh();
    };
    poll();
    if (session.staff.sector === "ADMIN" && adminStartupGate && adminStartupGate !== "READY") {
      loadShiftState();
    } else if (session.staff.sector === "ADMIN") {
      loadTables();
      loadStoreClientVisibility();
      loadStorePrintMode();
      loadShiftState();
      loadShiftSummaries();
    }
    const timer = setInterval(poll, 10000);
    return () => clearInterval(timer);
  }, [session, adminStartupGate, loadStoreClientVisibility, loadStorePrintMode, loadShiftState, loadShiftSummaries, loadTables, runBoardRefresh]);

  useEffect(() => {
    if (
      !session ||
      (session.staff.sector === "ADMIN" && adminStartupGate && adminStartupGate !== "READY") ||
      (session.staff.sector === "ADMIN" &&
        (adminView === "MENU" ||
          adminView === "QR" ||
          adminView === "PROFILE" ||
          adminView === "MESSAGING" ||
          adminView === "CLOSURE" ||
          adminView === "SUMMARIES"))
    ) return;

    const stream = openStaffEvents({
      storeId: session.staff.store_id,
      sector: session.staff.sector,
    });
    let refreshTimer = null;

    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        await runBoardRefresh();
      }, 1200);
    };

    const handleItemChanged = (event) => {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!payload) return;
      setBoardRows((current) => applyItemEventPayloadToBoardRows(current, payload));
      setSelectedOrderDetail((current) => applyItemEventPayloadToDetail(current, payload));
      scheduleRefresh();
      const eventId = String(event?.lastEventId || "");
      const incomingReason = String(payload.reason || "").toLowerCase();
      const isIncomingOrderSignal =
        session.staff.sector === "ADMIN" &&
        (incomingReason === "items_appended" || incomingReason === "order_created");

      if (isIncomingOrderSignal) {
        const incomingKey = eventId || `${payload.order_id || "?"}:${incomingReason}:${payload.table_code || "?"}`;
        if (lastIncomingOrderAlertRef.current !== incomingKey) {
          lastIncomingOrderAlertRef.current = incomingKey;
          setAlarmText(
            incomingReason === "items_appended"
              ? `Mesa ${payload.table_code || "?"} agrego items nuevos`
              : `Nuevo pedido en mesa ${payload.table_code || "?"}`
          );
          playAlarm("delay");
          if ((adminView === "SALON" || adminView === "BOARD") && payload.order_id) {
            setSelectedOrderId(payload.order_id);
          }
        }
      }

      const itemId = payload.item_id ? String(payload.item_id) : "";
      if (payload.item_status === "DONE" && (session.staff.sector === "WAITER" || session.staff.sector === "ADMIN")) {
        if (lastDoneAlertRef.current !== itemId) {
          lastDoneAlertRef.current = itemId;
          setAlarmText(`Item listo en pedido #${payload.order_id || "?"}`);
          playAlarm("done");
        }
      }
    };

    const handleOrderCreated = (event) => {
      scheduleRefresh();
      if (session.staff.sector !== "ADMIN") return;

      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload) return;

      const eventId = String(event?.lastEventId || "");
      const incomingKey = eventId || `created:${payload.order_id || "?"}:${payload.table_code || "?"}`;
      if (lastIncomingOrderAlertRef.current === incomingKey) return;
      lastIncomingOrderAlertRef.current = incomingKey;
      setAlarmText(`Nuevo pedido en mesa ${payload.table_code || "?"}`);
      playAlarm("delay");
      if ((adminView === "SALON" || adminView === "BOARD") && payload.order_id) {
        setSelectedOrderId(payload.order_id);
      }
    };

    const handleTableSessionUpdated = (event) => {
      scheduleRefresh();
      if (session.staff.sector !== "ADMIN") return;

      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload?.active_order_id || payload.status !== "CON_PEDIDO") return;

      const eventId = String(event?.lastEventId || "");
      const incomingKey = eventId || `table-session:${payload.table_session_id || "?"}:${payload.active_order_id}`;
      if (lastIncomingOrderAlertRef.current === incomingKey) return;
      lastIncomingOrderAlertRef.current = incomingKey;
      setAlarmText(`Mesa ${payload.table_code || "?"} tuvo actividad nueva`);
      playAlarm("delay");
      if ((adminView === "SALON" || adminView === "BOARD") && payload.active_order_id) {
        setSelectedOrderId(payload.active_order_id);
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
    stream.addEventListener("order.created", handleOrderCreated);
    stream.addEventListener("table.session.updated", handleTableSessionUpdated);
    stream.addEventListener("table.session.closed", scheduleRefresh);
    stream.addEventListener("table.session.checkout_requested", scheduleRefresh);
    stream.addEventListener("table.session.checkout_ready", scheduleRefresh);
    stream.addEventListener("bill.split.updated", scheduleRefresh);
    stream.addEventListener("bill.cash.requested", handleCashRequested);
    stream.addEventListener("bill.cash.resolved", handleCashResolved);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      stream.close();
      setLiveConnected(false);
    };
  }, [session, adminView, adminStartupGate, selectedOrderId, loadBoard, loadFeedback, loadOrderDetail, loadTableSessions, loadShiftState, loadShiftSummaries, playAlarm, loadTables, runBoardRefresh]);

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
    return <LoginPage onLogin={handleLoginWithShift} closureReceipt={recentClosedShift} />;
  }

  if (staffSector === "ADMIN" && adminStartupGate && adminStartupGate !== "READY") {
    return (
      <StartupGatePage
        session={session}
        activeShift={activeShift}
        shiftSummary={shiftSummary}
        busy={startupBusy}
        onStartShiftAndCash={handleBootstrapShift}
        onGoToClosure={handleResolvePendingShift}
        onLogout={resetOperationalSession}
      />
    );
  }

  return (
    <main className="staff-shell">
      <header className="staff-hero">
        <div>
          <p className="kicker">Panel operativo</p>
          <h1>Comanda Staff</h1>
          <p className="muted">
            Usuario: <strong>{session.staff.display_name || session.staff.username}</strong> | Sector: <strong>{session.staff.sector}</strong>
          </p>
          {staffSector === "ADMIN" && (
            <p className="muted">
              Turno: <strong>{activeShift?.label || "-"}</strong> | Nombre: <strong>{activeShift?.operator_name || session.staff.display_name || session.staff.username}</strong>
            </p>
          )}
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
          <button className="btn-secondary" onClick={resetOperationalSession}>
            Cerrar sesion
          </button>
        </div>
      </header>

      {staffSector === "ADMIN" && (
        <section className="panel toolbar">
          <div className="admin-view-tabs" role="tablist" aria-label="Vistas admin">
            {adminViewOrder.map((mode) => (
              <button
                key={mode}
                type="button"
                className={adminView === mode ? "btn-primary admin-view-tab" : "btn-secondary admin-view-tab"}
                onClick={() => setAdminView(mode)}
                draggable={mode !== "BOARD"}
                onDragStart={(event) => {
                  if (mode === "BOARD") return;
                  setDraggingAdminView(mode);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", mode);
                }}
                onDragOver={(event) => {
                  if (!draggingAdminView || mode === "BOARD" || draggingAdminView === mode) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceMode = event.dataTransfer.getData("text/plain") || draggingAdminView;
                  moveAdminViewTab(sourceMode, mode);
                  setDraggingAdminView("");
                }}
                onDragEnd={() => setDraggingAdminView("")}
              >
                {adminViewLabel(mode)}
              </button>
            ))}
          </div>

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
            onClick={
              adminView === "FEEDBACK"
                ? loadFeedback
                : adminView === "SALON" || adminView === "QR"
                ? loadTables
                : loadBoard
            }
            disabled={adminView === "FEEDBACK" ? feedbackLoading : loading}
          >
            {adminView === "FEEDBACK"
              ? feedbackLoading
                ? "Actualizando..."
                : "Actualizar feedback"
              : adminView === "SALON"
              ? "Actualizar salon"
              : adminView === "QR"
              ? "Actualizar qr"
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

      {staffSector === "ADMIN" && adminView === "BOARD" && (
        <section className="shift-quick-strip">
          <article className="shift-quick-card">
            <span>Cubiertos activos</span>
            <strong>{activeCovers}</strong>
          </article>
          <article className="shift-quick-card">
            <span>Cubiertos cerrados</span>
            <strong>{shiftSummary.closedCovers}</strong>
          </article>
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
        {!(staffSector === "ADMIN" && (adminView === "BOARD" || adminView === "SALON" || adminView === "BAR" || adminView === "MENU" || adminView === "QR" || adminView === "PROFILE" || adminView === "MESSAGING" || adminView === "CLOSURE" || adminView === "SUMMARIES")) && (
          <TableSessionsPanel
            rows={tableSessionsRows}
            loading={tableSessionsLoading}
            actorSector={staffSector}
            busyId={tableSessionBusyId}
            readOnlyReason={staffSector !== "ADMIN" && !activeShift ? "No hay turno abierto. Espera al encargado." : ""}
            onMarkRetired={(id) => markTableSession(id, "SE_RETIRARON")}
        />
      )}
      {staffSector === "ADMIN" && adminView === "FEEDBACK" ? (
        <FeedbackSummaryPage loading={feedbackLoading} summary={feedbackSummary} />
      ) : (
        board
      )}

      {staffSector === "ADMIN" && adminView === "SALON" && selectedOrderId ? (
        <SalonOrderModal
          open={Boolean(selectedOrderId)}
          onClose={() => setSelectedOrderId(null)}
          orderDetail={selectedOrderDetail}
          selectedOrderId={selectedOrderId}
          loading={detailLoading}
          error={detailError}
          advancingKey={advancingKey}
          closingTableCode={closingTableCode}
          billingBusy={billingBusy}
          onRefresh={loadOrderDetail}
          onAdvanceItem={advanceItem}
          onCloseTable={closeTable}
          onForceCloseTable={() => forceCloseTableByCode(selectedOrderDetail?.table_code)}
          onCreateSplit={createSplit}
          onConfirmPart={confirmPart}
          onResolveCashRequest={resolveCash}
          onApproveOrder={approvePendingOrder}
          onRejectOrder={rejectPendingOrder}
          availableTables={tablesRows}
          busyId={tableSessionBusyId}
          onMoveTableSession={moveActiveTableSession}
        />
      ) : null}

        {!(staffSector === "ADMIN" && (adminView === "FEEDBACK" || adminView === "BOARD" || adminView === "SALON" || adminView === "MENU" || adminView === "QR" || adminView === "PROFILE" || adminView === "MESSAGING" || adminView === "CLOSURE" || adminView === "SUMMARIES")) && (
          <OrderDetailPanel
            orderDetail={selectedOrderDetail}
            selectedOrderId={selectedOrderId}
            loading={detailLoading}
            error={detailError}
            actorSector={staffSector}
            onRefresh={loadOrderDetail}
            onAdvanceItem={advanceItem}
            advancingKey={advancingKey}
            readOnlyReason={staffSector !== "ADMIN" && !activeShift ? "No hay turno abierto. Espera al encargado." : ""}
            onCloseTable={closeTable}
            onForceCloseTable={() => forceCloseTableByCode(selectedOrderDetail?.table_code)}
            closingTableCode={closingTableCode}
            onCreateSplit={createSplit}
            onConfirmPart={confirmPart}
            onResolveCashRequest={resolveCash}
            onApproveOrder={approvePendingOrder}
            onRejectOrder={rejectPendingOrder}
            billingBusy={billingBusy}
        />
      )}
    </main>
  );
}
