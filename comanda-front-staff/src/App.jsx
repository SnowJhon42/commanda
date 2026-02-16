import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAdminOrders, fetchOrderDetail, fetchStaffOrders, patchSectorStatus } from "./api/staffApi";
import { LoginPage } from "./pages/LoginPage";
import { AdminBoardPage } from "./pages/AdminBoardPage";
import { KitchenBoardPage } from "./pages/KitchenBoardPage";
import { BarBoardPage } from "./pages/BarBoardPage";
import { WaiterBoardPage } from "./pages/WaiterBoardPage";
import { OrderDetailPanel } from "./pages/OrderDetailPanel";

const STATUS_OPTIONS = ["", "RECEIVED", "IN_PROGRESS", "DONE", "DELIVERED"];

function nextStatus(currentStatus) {
  if (currentStatus === "RECEIVED") return "IN_PROGRESS";
  if (currentStatus === "IN_PROGRESS") return "DONE";
  if (currentStatus === "DONE") return "DELIVERED";
  return null;
}

function aggregateStatusFromSectors(sectors) {
  if (!sectors || sectors.length === 0) return "RECEIVED";
  if (sectors.every((s) => s.status === "DELIVERED")) return "DELIVERED";
  if (sectors.every((s) => s.status === "DONE" || s.status === "DELIVERED")) return "DONE";
  if (sectors.some((s) => s.status === "IN_PROGRESS")) return "IN_PROGRESS";
  return "RECEIVED";
}

export function App() {
  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [advancingKey, setAdvancingKey] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const staffSector = session?.staff?.sector;

  const loadOrders = useCallback(async () => {
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
        setOrders(data.items);
      } else {
        const data = await fetchStaffOrders({
          token: session.access_token,
          storeId: session.staff.store_id,
          sector: session.staff.sector,
          status: statusFilter || undefined,
        });
        setOrders(data.items);
      }
    } catch (err) {
      setError(err.message || "No se pudieron cargar pedidos.");
    } finally {
      setLoading(false);
    }
  }, [session, statusFilter]);

  const loadOrderDetail = useCallback(async () => {
    if (!selectedOrderId) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      const detail = await fetchOrderDetail(selectedOrderId);
      setSelectedOrderDetail(detail);
    } catch (err) {
      setDetailError(err.message || "No se pudo cargar detalle del pedido.");
    } finally {
      setDetailLoading(false);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrderDetail(null);
      setDetailError("");
      return;
    }
    loadOrderDetail();
  }, [selectedOrderId, loadOrderDetail]);

  const advanceSector = useCallback(
    async ({ orderId, sector, currentStatus }) => {
      if (!session) return;
      const toStatus = nextStatus(currentStatus);
      if (!toStatus) return;
      const key = `${orderId}:${sector}`;

      let rollbackOrders = null;
      let rollbackDetail = null;
      setOrders((current) => {
        rollbackOrders = current;
        if (session.staff.sector === "ADMIN") {
          return current.map((order) => {
            if (order.order_id !== orderId) return order;
            const sectors = order.sectors.map((row) =>
              row.sector === sector ? { ...row, status: toStatus } : row
            );
            return {
              ...order,
              sectors,
              status_aggregated: aggregateStatusFromSectors(sectors),
            };
          });
        }
        return current.map((order) =>
          order.order_id === orderId ? { ...order, sector_status: toStatus } : order
        );
      });

      setSelectedOrderDetail((current) => {
        if (!current || current.id !== orderId) return current;
        rollbackDetail = current;
        const sectors = current.sectors.map((row) =>
          row.sector === sector ? { ...row, status: toStatus } : row
        );
        return {
          ...current,
          sectors,
          status_aggregated: aggregateStatusFromSectors(sectors),
        };
      });

      setAdvancingKey(key);
      setError("");
      try {
        await patchSectorStatus({
          token: session.access_token,
          orderId,
          sector,
          toStatus,
        });
        await loadOrders();
        await loadOrderDetail();
      } catch (err) {
        if (rollbackOrders) setOrders(rollbackOrders);
        if (rollbackDetail) setSelectedOrderDetail(rollbackDetail);
        setError(err.message || "No se pudo actualizar estado.");
      } finally {
        setAdvancingKey("");
      }
    },
    [session, loadOrders, loadOrderDetail]
  );

  const board = useMemo(() => {
    const boardProps = {
      orders,
      loading,
      onAdvanceSector: advanceSector,
      advancingKey,
      onSelectOrder: setSelectedOrderId,
      selectedOrderId,
    };

    if (staffSector === "ADMIN") return <AdminBoardPage {...boardProps} />;
    if (staffSector === "KITCHEN") return <KitchenBoardPage {...boardProps} />;
    if (staffSector === "BAR") return <BarBoardPage {...boardProps} />;
    if (staffSector === "WAITER") return <WaiterBoardPage {...boardProps} />;
    return null;
  }, [orders, staffSector, loading, advanceSector, advancingKey, selectedOrderId]);

  useEffect(() => {
    if (!session) return;
    const poll = async () => {
      await loadOrders();
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [session, loadOrders]);

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
        </div>
        <button className="btn-secondary" onClick={() => setSession(null)}>
          Cerrar sesion
        </button>
      </header>

      <section className="panel toolbar">
        <label className="field">
          Filtrar por estado
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map((status) => (
              <option key={status || "all"} value={status}>
                {status || "TODOS"}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary" onClick={loadOrders} disabled={loading}>
          {loading ? "Actualizando..." : "Actualizar ahora"}
        </button>
      </section>

      {error && <p className="error-text">{error}</p>}
      {board}

      <OrderDetailPanel
        orderDetail={selectedOrderDetail}
        selectedOrderId={selectedOrderId}
        loading={detailLoading}
        error={detailError}
        onRefresh={loadOrderDetail}
      />
    </main>
  );
}
