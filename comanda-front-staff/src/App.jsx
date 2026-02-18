import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAdminOrderItems,
  fetchAdminOrders,
  fetchStaffBoardItems,
  fetchStaffOrderItems,
  openStaffEvents,
  closeTableSession,
  patchItemStatus,
} from "./api/staffApi";
import { LoginPage } from "./pages/LoginPage";
import { AdminBoardPage } from "./pages/AdminBoardPage";
import { KitchenBoardPage } from "./pages/KitchenBoardPage";
import { BarBoardPage } from "./pages/BarBoardPage";
import { WaiterBoardPage } from "./pages/WaiterBoardPage";
import { OrderDetailPanel } from "./pages/OrderDetailPanel";
import { elapsedMinutes } from "./utils/boardMeta";

const STATUS_OPTIONS = ["", "RECEIVED", "IN_PROGRESS", "DONE", "PARCIAL", "DELIVERED"];

function getNextStatusForAction({ currentStatus, sector, actorSector }) {
  if (actorSector === "ADMIN") {
    if (sector === "WAITER" && currentStatus === "RECEIVED") return "DELIVERED";
    if (currentStatus === "RECEIVED") return "IN_PROGRESS";
    if (currentStatus === "IN_PROGRESS") return "DONE";
    if (currentStatus === "DONE") return "DELIVERED";
    return null;
  }

  if (actorSector === "KITCHEN") {
    return currentStatus === "IN_PROGRESS" ? "DONE" : null;
  }
  if (actorSector === "BAR") {
    return currentStatus === "IN_PROGRESS" ? "DONE" : null;
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
      items: [...group.items].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    }))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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

export function App() {
  const [session, setSession] = useState(null);
  const [boardRows, setBoardRows] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [advancingKey, setAdvancingKey] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [closingTable, setClosingTable] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [alarmText, setAlarmText] = useState("");
  const lastDoneAlertRef = useRef("");
  const lastDelayAlertRef = useRef("");

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
        const data = await fetchAdminOrders({
          token: session.access_token,
          storeId: session.staff.store_id,
          status: statusFilter || undefined,
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
  }, [session, statusFilter]);

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
        await loadBoard();
        if (selectedOrderId) {
          await loadOrderDetail();
        }
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

    const prioritizedRows = [...boardRows].sort((a, b) => {
      const am = alertMetaByOrder[a.order_id] || { high: 0, medium: 0 };
      const bm = alertMetaByOrder[b.order_id] || { high: 0, medium: 0 };
      if (bm.high !== am.high) return bm.high - am.high;
      if (bm.medium !== am.medium) return bm.medium - am.medium;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const visibleRows = alertsOnly
      ? prioritizedRows.filter((row) => (alertMetaByOrder[row.order_id]?.total || 0) > 0)
      : prioritizedRows;

    const sharedProps = {
      rows: visibleRows,
      loading,
      advancingKey,
      selectedOrderId,
      onAdvanceItem: advanceItem,
      onSelectOrder: setSelectedOrderId,
      actorSector: staffSector,
      alertMetaByOrder,
    };

    if (staffSector === "ADMIN") return <AdminBoardPage {...sharedProps} />;
    if (staffSector === "KITCHEN") return <KitchenBoardPage {...sharedProps} />;
    if (staffSector === "BAR") return <BarBoardPage {...sharedProps} />;
    if (staffSector === "WAITER") return <WaiterBoardPage {...sharedProps} />;
    return null;
  }, [boardRows, loading, advancingKey, selectedOrderId, advanceItem, staffSector]);

  useEffect(() => {
    if (!session) return;
    const poll = async () => {
      await loadBoard();
    };
    poll();
    const timer = setInterval(poll, 10000);
    return () => clearInterval(timer);
  }, [session, loadBoard]);

  useEffect(() => {
    if (!session) return;

    const stream = openStaffEvents({
      storeId: session.staff.store_id,
      sector: session.staff.sector,
    });
    let refreshTimer = null;

    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        await loadBoard();
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

    stream.onopen = () => setLiveConnected(true);
    stream.onerror = () => setLiveConnected(false);
    stream.onmessage = scheduleRefresh;
    stream.addEventListener("items.changed", handleItemChanged);
    stream.addEventListener("order.created", scheduleRefresh);
    stream.addEventListener("table.session.closed", scheduleRefresh);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      stream.close();
      setLiveConnected(false);
    };
  }, [session, selectedOrderId, loadBoard, loadOrderDetail, playAlarm]);

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
            Filtrar por estado general
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status || "all"} value={status}>
                  {status || "TODOS"}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" onClick={loadBoard} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar ahora"}
          </button>
          <label className="field inline-field">
            <span>Solo alertas</span>
            <input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} />
          </label>
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
      {board}

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
        closingTable={closingTable}
      />
    </main>
  );
}
