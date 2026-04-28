import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStaffTable, fetchStoreFloorPlan, patchStoreFloorPlan } from "../api/staffApi";

const SHAPE_OPTIONS = [
  { value: "SQUARE", label: "Cuadrada" },
  { value: "RECT", label: "Rectangular" },
  { value: "CIRCLE", label: "Circular" },
];

const SIZE_PRESETS = {
  SQUARE: { width: 92, height: 92 },
  RECT: { width: 128, height: 76 },
  CIRCLE: { width: 96, height: 96 },
};

const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 1100;
const GRID_SIZE = 24;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.85;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseTableNumber(code) {
  const match = String(code || "").toUpperCase().match(/^M?(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function numericLabel(tableCode) {
  const match = String(tableCode || "").toUpperCase().match(/^M?(\d+)$/);
  return match ? match[1] : String(tableCode || "");
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const diff = parseTableNumber(a.table_code) - parseTableNumber(b.table_code);
    if (diff !== 0) return diff;
    return String(a.table_code || "").localeCompare(String(b.table_code || ""));
  });
}

function clonePlan(plan) {
  return {
    zones: (plan?.zones || []).map((zone) => ({ ...zone })),
    items: (plan?.items || []).map((item) => ({ ...item })),
  };
}

function buildAutoLayout(items, activeZoneId) {
  const zoneItems = sortItems(items.filter((item) => item.zone_id === activeZoneId));
  const otherItems = items.filter((item) => item.zone_id !== activeZoneId);
  const nextZoneItems = zoneItems.map((item, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const shapeCycle = row % 3;
    const preset = shapeCycle === 0 ? SIZE_PRESETS.SQUARE : shapeCycle === 1 ? SIZE_PRESETS.RECT : SIZE_PRESETS.CIRCLE;
    return {
      ...item,
      shape: shapeCycle === 0 ? "SQUARE" : shapeCycle === 1 ? "RECT" : "CIRCLE",
      width: preset.width,
      height: preset.height,
      x: 110 + col * 250,
      y: 110 + row * 220,
    };
  });
  return [...otherItems, ...nextZoneItems];
}

function tableState(table) {
  if (table?.active_order_id) {
    return {
      label: "Pidiendo",
      fill: "#dc2626",
      stroke: "#991b1b",
      glow: "rgba(220, 38, 38, 0.34)",
    };
  }
  if (table?.active_table_session_id) {
    return {
      label: "Sentados",
      fill: "#facc15",
      stroke: "#ca8a04",
      glow: "rgba(250, 204, 21, 0.36)",
    };
  }
  return {
    label: "Libre",
    fill: "#10b981",
    stroke: "#047857",
    glow: "rgba(16, 185, 129, 0.24)",
  };
}

function formatElapsed(minutesValue) {
  const minutes = Number(minutesValue);
  if (!Number.isFinite(minutes) || minutes <= 0) return "Ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function worldToScreen(point, viewport) {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

function screenToWorld(point, viewport) {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

function getScreenPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function hitTestItem(item, point) {
  if (item.shape === "CIRCLE") {
    const radiusX = item.width / 2;
    const radiusY = item.height / 2;
    const centerX = item.x + radiusX;
    const centerY = item.y + radiusY;
    const dx = (point.x - centerX) / radiusX;
    const dy = (point.y - centerY) / radiusY;
    return dx * dx + dy * dy <= 1;
  }
  return point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height;
}

function drawCanvas(ctx, items, selectedTableCode, viewport) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#fffdf8");
  gradient.addColorStop(1, "#fffaf2");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.save();
  ctx.translate(viewport.panX, viewport.panY);
  ctx.scale(viewport.zoom, viewport.zoom);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
  ctx.lineWidth = 1 / viewport.zoom;
  for (let x = 0; x <= CANVAS_WIDTH / viewport.zoom + GRID_SIZE; x += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, -viewport.panY / viewport.zoom);
    ctx.lineTo(x, (CANVAS_HEIGHT - viewport.panY) / viewport.zoom);
    ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_HEIGHT / viewport.zoom + GRID_SIZE; y += GRID_SIZE) {
    ctx.beginPath();
    ctx.moveTo(-viewport.panX / viewport.zoom, y);
    ctx.lineTo((CANVAS_WIDTH - viewport.panX) / viewport.zoom, y);
    ctx.stroke();
  }

  items.forEach((item) => {
    const state = tableState(item.table);
    const isSelected = selectedTableCode === item.table_code;
    ctx.save();
    ctx.shadowColor = state.glow;
    ctx.shadowBlur = 28 / viewport.zoom;
    ctx.shadowOffsetY = 10 / viewport.zoom;
    ctx.fillStyle = state.fill;
    ctx.strokeStyle = state.stroke;
    ctx.lineWidth = 3 / viewport.zoom;

    if (item.shape === "CIRCLE") {
      ctx.beginPath();
      ctx.ellipse(item.x + item.width / 2, item.y + item.height / 2, item.width / 2, item.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (item.shape === "RECT") {
      drawRoundedRect(ctx, item.x, item.y, item.width, item.height, 16);
      ctx.fill();
      ctx.stroke();
    } else {
      drawRoundedRect(ctx, item.x, item.y, item.width, item.height, 12);
      ctx.fill();
      ctx.stroke();
    }

    if (isSelected) {
      ctx.strokeStyle = "rgba(255,255,255,0.94)";
      ctx.setLineDash([7 / viewport.zoom, 5 / viewport.zoom]);
      ctx.lineWidth = 2 / viewport.zoom;
      if (item.shape === "CIRCLE") {
        ctx.beginPath();
        ctx.ellipse(
          item.x + item.width / 2,
          item.y + item.height / 2,
          item.width / 2 - 6,
          item.height / 2 - 6,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      } else {
        drawRoundedRect(
          ctx,
          item.x + 5,
          item.y + 5,
          Math.max(item.width - 10, 10),
          Math.max(item.height - 10, 10),
          item.shape === "RECT" ? 14 : 10
        );
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    ctx.fillStyle = item.table?.active_table_session_id && !item.table?.active_order_id ? "#1f2937" : "#ffffff";
    ctx.font = `700 ${Math.max(26, Math.round(34 / viewport.zoom))}px Montserrat, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(numericLabel(item.table_code), item.x + item.width / 2, item.y + item.height / 2);
    ctx.restore();
  });

  ctx.restore();
}

export function SalonTablesPage({
  token,
  storeId,
  tables = [],
  loading = false,
  onSelectOrder = () => {},
  onMarkRetired = () => {},
  onMoveTableSession = async () => {},
  onTableCreated = async () => {},
  busyId = null,
}) {
  const [plan, setPlan] = useState({ zones: [], items: [] });
  const [activeZoneId, setActiveZoneId] = useState("main");
  const [selectedTableCode, setSelectedTableCode] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [viewport, setViewport] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [placingNewTable, setPlacingNewTable] = useState(false);
  const [newTableShape, setNewTableShape] = useState("SQUARE");
  const [newTableCode, setNewTableCode] = useState("");
  const [moveTargetTableCode, setMoveTargetTableCode] = useState("");
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);

  const tableMap = useMemo(
    () =>
      tables.reduce((acc, table) => {
        acc[table.table_code] = table;
        return acc;
      }, {}),
    [tables]
  );

  const loadPlan = useCallback(async () => {
    if (!token || !storeId) return;
    setPlanLoading(true);
    setError("");
    try {
      const data = await fetchStoreFloorPlan({ token, storeId });
      setPlan(clonePlan(data));
      if (data.zones?.length > 0) {
        setActiveZoneId((current) => (data.zones.some((zone) => zone.id === current) ? current : data.zones[0].id));
      }
    } catch (err) {
      setError(err.message || "No se pudo cargar el plano del salón.");
    } finally {
      setPlanLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 1800);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (editing) return;
    setPlacingNewTable(false);
  }, [editing]);

  const mergedItems = useMemo(
    () =>
      sortItems(
        plan.items.map((item) => ({
          ...item,
          table: tableMap[item.table_code] || null,
        }))
      ),
    [plan.items, tableMap]
  );

  const zones = plan.zones || [];
  const zoneItems = useMemo(() => mergedItems.filter((item) => item.zone_id === activeZoneId), [mergedItems, activeZoneId]);
  const selectedItem = mergedItems.find((item) => item.table_code === selectedTableCode) || null;
  const availableMoveTargets = useMemo(
    () =>
      [...tables]
        .filter((table) => table.table_code !== selectedTableCode && !table.active_table_session_id)
        .sort((a, b) => parseTableNumber(a.table_code) - parseTableNumber(b.table_code)),
    [tables, selectedTableCode]
  );

  useEffect(() => {
    if (!zoneItems.length) {
      setSelectedTableCode("");
      return;
    }
    if (!zoneItems.some((item) => item.table_code === selectedTableCode)) {
      setSelectedTableCode(zoneItems[0].table_code);
    }
  }, [zoneItems, selectedTableCode]);

  useEffect(() => {
    if (!availableMoveTargets.length) {
      setMoveTargetTableCode("");
      return;
    }
    if (!availableMoveTargets.some((table) => table.table_code === moveTargetTableCode)) {
      setMoveTargetTableCode(availableMoveTargets[0].table_code);
    }
  }, [availableMoveTargets, moveTargetTableCode]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    drawCanvas(ctx, zoneItems, selectedTableCode, viewport);
  }, [zoneItems, selectedTableCode, viewport]);

  const summary = mergedItems.reduce(
    (acc, item) => {
      if (item.table?.active_order_id) acc.withOrder += 1;
      else if (item.table?.active_table_session_id) acc.occupied += 1;
      else acc.free += 1;
      return acc;
    },
    { free: 0, occupied: 0, withOrder: 0 }
  );

  const updateItem = useCallback((tableCode, updater) => {
    setPlan((current) => ({
      ...current,
      items: current.items.map((item) => (item.table_code === tableCode ? updater(item) : item)),
    }));
  }, []);

  const handlePointerMove = useCallback(
    (event) => {
      const interaction = interactionRef.current;
      if (!interaction || !canvasRef.current) return;

      if (interaction.kind === "pan") {
        const point = getScreenPoint(canvasRef.current, event);
        setViewport((current) => ({
          ...current,
          panX: interaction.startPanX + (point.x - interaction.startX),
          panY: interaction.startPanY + (point.y - interaction.startY),
        }));
        return;
      }

      if (interaction.kind === "drag-table") {
        const screenPoint = getScreenPoint(canvasRef.current, event);
        const worldPoint = screenToWorld(screenPoint, interaction.viewport);
        updateItem(interaction.tableCode, (item) => ({
          ...item,
          x: clamp(Math.round(worldPoint.x - interaction.offsetX), 24, 1500),
          y: clamp(Math.round(worldPoint.y - interaction.offsetY), 24, 900),
        }));
      }
    },
    [updateItem]
  );

  const stopInteraction = useCallback(() => {
    interactionRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopInteraction);
  }, [handlePointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
    };
  }, [handlePointerMove, stopInteraction]);

  const handleCanvasWheel = (event) => {
    event.preventDefault();
    if (!canvasRef.current) return;
    const screenPoint = getScreenPoint(canvasRef.current, event);
    setViewport((current) => {
      const nextZoom = clamp(current.zoom + (event.deltaY < 0 ? 0.12 : -0.12), MIN_ZOOM, MAX_ZOOM);
      if (nextZoom === current.zoom) return current;
      const worldBefore = screenToWorld(screenPoint, current);
      return {
        zoom: nextZoom,
        panX: screenPoint.x - worldBefore.x * nextZoom,
        panY: screenPoint.y - worldBefore.y * nextZoom,
      };
    });
  };

  const handleCanvasPointerDown = (event) => {
    if (!canvasRef.current) return;

    const screenPoint = getScreenPoint(canvasRef.current, event);
    const worldPoint = screenToWorld(screenPoint, viewport);
    const hitItem = [...zoneItems].reverse().find((item) => hitTestItem(item, worldPoint)) || null;

    if (editing && placingNewTable && !hitItem) {
      void createTableAtPoint(worldPoint);
      return;
    }

    if (hitItem) {
      setSelectedTableCode(hitItem.table_code);

      if (!editing) {
        if (hitItem.table?.active_order_id) onSelectOrder(hitItem.table.active_order_id);
        return;
      }

      interactionRef.current = {
        kind: "drag-table",
        tableCode: hitItem.table_code,
        offsetX: worldPoint.x - hitItem.x,
        offsetY: worldPoint.y - hitItem.y,
        viewport,
      };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopInteraction);
      return;
    }

    if (editing) {
      interactionRef.current = {
        kind: "pan",
        startX: screenPoint.x,
        startY: screenPoint.y,
        startPanX: viewport.panX,
        startPanY: viewport.panY,
      };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopInteraction);
    } else {
      setSelectedTableCode("");
    }
  };

  const savePlan = async () => {
    if (!token || !storeId) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        zones: zones.map((zone) => ({ id: zone.id, name: zone.name })),
        items: plan.items.map((item) => ({
          table_code: item.table_code,
          zone_id: item.zone_id,
          x: Number(item.x),
          y: Number(item.y),
          width: Number(item.width),
          height: Number(item.height),
          shape: item.shape,
        })),
      };
      const data = await patchStoreFloorPlan({ token, storeId, payload });
      setPlan(clonePlan(data));
      setSuccess("Plano guardado");
    } catch (err) {
      setError(err.message || "No se pudo guardar el plano del salón.");
    } finally {
      setSaving(false);
    }
  };

  const createTableAtPoint = async (worldPoint) => {
    if (!token || !storeId) return;
    const preset = SIZE_PRESETS[newTableShape] || SIZE_PRESETS.SQUARE;
    const requestedCode = newTableCode.trim().toUpperCase();
    setCreating(true);
    setError("");
    try {
      const created = await createStaffTable({
        token,
        storeId,
        payload: requestedCode ? { table_code: requestedCode } : {},
      });
      const nextItem = {
        table_code: created.table_code,
        zone_id: activeZoneId,
        x: clamp(Math.round(worldPoint.x - preset.width / 2), 24, 1500),
        y: clamp(Math.round(worldPoint.y - preset.height / 2), 24, 900),
        width: preset.width,
        height: preset.height,
        shape: newTableShape,
      };
      const payload = {
        zones: zones.map((zone) => ({ id: zone.id, name: zone.name })),
        items: [...plan.items, nextItem].map((item) => ({
          table_code: item.table_code,
          zone_id: item.zone_id,
          x: Number(item.x),
          y: Number(item.y),
          width: Number(item.width),
          height: Number(item.height),
          shape: item.shape,
        })),
      };
      const data = await patchStoreFloorPlan({ token, storeId, payload });
      setPlan(clonePlan(data));
      setSelectedTableCode(created.table_code);
      setNewTableCode("");
      setPlacingNewTable(false);
      setSuccess(`Mesa ${created.table_code} creada`);
      await onTableCreated();
    } catch (err) {
      setError(err.message || "No se pudo crear la mesa.");
    } finally {
      setCreating(false);
    }
  };

  const changeShape = (shape) => {
    if (!selectedItem) return;
    const preset = SIZE_PRESETS[shape] || SIZE_PRESETS.SQUARE;
    updateItem(selectedItem.table_code, (item) => ({
      ...item,
      shape,
      width: preset.width,
      height: preset.height,
    }));
  };

  const changeZone = (zoneId) => {
    if (!selectedItem) return;
    updateItem(selectedItem.table_code, (item) => ({
      ...item,
      zone_id: zoneId,
      x: 100,
      y: 100,
    }));
    setActiveZoneId(zoneId);
  };

  const changeSize = (delta) => {
    if (!selectedItem) return;
    updateItem(selectedItem.table_code, (item) => ({
      ...item,
      width: clamp(item.width + delta, 68, 220),
      height: clamp(item.height + delta, 68, 220),
    }));
  };

  const applyTemplate = () => {
    setPlan((current) => ({
      ...current,
      items: buildAutoLayout(current.items, activeZoneId),
    }));
    setViewport({ zoom: 1, panX: 0, panY: 0 });
    setSuccess("Plantilla reaplicada");
  };

  const centerCanvas = () => {
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  };

  const handleMoveTable = async () => {
    if (!selectedItem?.table?.active_table_session_id || !moveTargetTableCode) return;
    setError("");
    try {
      await onMoveTableSession(selectedItem.table.active_table_session_id, moveTargetTableCode);
      setSuccess(`Mesa movida a ${moveTargetTableCode}`);
    } catch (err) {
      setError(err.message || "No se pudo cambiar la mesa.");
    }
  };

  return (
    <section className="salon-studio">
      <div className="salon-studio-head">
        <div>
          <h2>Mesas</h2>
          <p className="muted">Canvas del salón. En modo editar podés arrastrar mesas, cambiar forma y rearmar el layout.</p>
        </div>
        <div className="salon-studio-actions">
          <span className="salon-room-pill">Caja Principal</span>
          <button type="button" className="btn-secondary" onClick={applyTemplate} disabled={planLoading || saving}>
            Plantilla
          </button>
          <button
            type="button"
            className={placingNewTable ? "btn-primary" : "btn-secondary"}
            disabled={!editing || creating || saving}
            onClick={() => setPlacingNewTable((value) => !value)}
          >
            {creating ? "Creando..." : placingNewTable ? "Colocando mesa..." : "Nueva mesa"}
          </button>
          <button type="button" className={editing ? "btn-primary" : "btn-secondary"} onClick={() => setEditing((value) => !value)}>
            {editing ? "Editando" : "Editar"}
          </button>
          <button type="button" className="btn-secondary" onClick={loadPlan} disabled={planLoading || saving}>
            Recargar
          </button>
          <button type="button" className="btn-primary" onClick={savePlan} disabled={saving || planLoading}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <div className="salon-studio-tabs">
        {zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={zone.id === activeZoneId ? "salon-studio-tab salon-studio-tab-active" : "salon-studio-tab"}
            onClick={() => setActiveZoneId(zone.id)}
          >
            {zone.name}
          </button>
        ))}
      </div>

      <div className="salon-studio-canvas-card">
        {(error || planLoading || loading) && (
          <div className="salon-studio-banner">
            {error ? error : planLoading ? "Cargando plano..." : "Actualizando mesas..."}
          </div>
        )}
        {success ? <div className="salon-studio-toast">{success}</div> : null}

        <div className="salon-studio-toolbar">
          <div className="salon-studio-toolbar-group">
            <button type="button" className="btn-secondary" onClick={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom - 0.12, MIN_ZOOM, MAX_ZOOM) }))}>
              -
            </button>
            <button type="button" className="btn-secondary" onClick={() => setViewport((current) => ({ ...current, zoom: clamp(current.zoom + 0.12, MIN_ZOOM, MAX_ZOOM) }))}>
              +
            </button>
            <button type="button" className="btn-secondary" onClick={centerCanvas}>
              Centrar
            </button>
          </div>
          <div className="salon-studio-toolbar-group">
            <input
              type="text"
              value={newTableCode}
              onChange={(event) => setNewTableCode(event.target.value.toUpperCase())}
              placeholder="Codigo automatico"
              maxLength={30}
              disabled={!editing || creating}
            />
            {SHAPE_OPTIONS.map((shape) => (
              <button
                key={shape.value}
                type="button"
                className={
                  placingNewTable
                    ? newTableShape === shape.value
                      ? "salon-shape-btn salon-shape-btn-active"
                      : "salon-shape-btn"
                    : selectedItem?.shape === shape.value
                      ? "salon-shape-btn salon-shape-btn-active"
                      : "salon-shape-btn"
                }
                disabled={!editing || (!selectedItem && !placingNewTable)}
                onClick={() => (placingNewTable ? setNewTableShape(shape.value) : changeShape(shape.value))}
              >
                {shape.label}
              </button>
            ))}
          </div>
          <div className="salon-studio-zoom-pill">{Math.round(viewport.zoom * 100)}%</div>
        </div>

        <div className="salon-studio-legend">
          <span className="salon-studio-legend-item">
            <i className="salon-studio-legend-dot salon-studio-legend-dot-free" />
            Libre
          </span>
          <span className="salon-studio-legend-item">
            <i className="salon-studio-legend-dot salon-studio-legend-dot-seated" />
            Sentados
          </span>
          <span className="salon-studio-legend-item">
            <i className="salon-studio-legend-dot salon-studio-legend-dot-order" />
            Pidiendo
          </span>
        </div>

        <div className="salon-studio-canvas-shell">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className={editing ? "salon-studio-canvas salon-studio-canvas-editing" : "salon-studio-canvas"}
            onPointerDown={handleCanvasPointerDown}
            onWheel={handleCanvasWheel}
          />
        </div>
        <div className="salon-studio-editor-actions">
          <span className="muted">
            {placingNewTable
              ? "Modo nueva mesa activo: hacé click en el canvas para crearla ahí."
              : editing
                ? "Modo editar activo: arrastrá mesas o mové el canvas desde un espacio vacío."
                : "Activá editar para reordenar o agregar mesas."}
          </span>
        </div>
      </div>

      <div className="salon-studio-bottom">
        <div className="salon-studio-stats">
          <article>
            <span>Libres</span>
            <strong>{summary.free}</strong>
          </article>
          <article>
            <span>Ocupadas</span>
            <strong>{summary.occupied}</strong>
          </article>
          <article>
            <span>Con pedido</span>
            <strong>{summary.withOrder}</strong>
          </article>
        </div>

        {selectedItem ? (
          <div className="salon-studio-editor">
            <div className="salon-studio-editor-head">
              <div>
                <strong>Mesa {numericLabel(selectedItem.table_code)}</strong>
                <span>{tableState(selectedItem.table).label}</span>
              </div>
              <span className="muted">
                {selectedItem.table?.guest_count || 0} personas · {selectedItem.table?.connected_clients || 0} conectados · {formatElapsed(selectedItem.table?.elapsed_minutes || 0)}
              </span>
            </div>

            <div className="salon-studio-editor-grid">
              <label className="field">
                Zona
                <select value={selectedItem.zone_id} disabled={!editing} onChange={(event) => changeZone(event.target.value)}>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Tamaño
                <div className="salon-studio-size-row">
                  <button type="button" className="btn-secondary" disabled={!editing} onClick={() => changeSize(-12)}>
                    Reducir
                  </button>
                  <button type="button" className="btn-secondary" disabled={!editing} onClick={() => changeSize(12)}>
                    Agrandar
                  </button>
                </div>
              </label>
            </div>

            {selectedItem.table?.active_table_session_id ? (
              <div className="salon-studio-editor-grid">
                <label className="field">
                  Cambiar a mesa
                  <select
                    value={moveTargetTableCode}
                    onChange={(event) => setMoveTargetTableCode(event.target.value)}
                    disabled={busyId === selectedItem.table.active_table_session_id || availableMoveTargets.length === 0}
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
                </label>

                <label className="field">
                  Reasignacion
                  <div className="salon-studio-size-row">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={
                        busyId === selectedItem.table.active_table_session_id || !moveTargetTableCode || availableMoveTargets.length === 0
                      }
                      onClick={handleMoveTable}
                    >
                      {busyId === selectedItem.table.active_table_session_id ? "Cambiando..." : "Cambiar mesa"}
                    </button>
                  </div>
                </label>
              </div>
            ) : null}

            <div className="salon-studio-editor-actions">
              <span className="muted">{editing ? "Arrastrá la mesa o hacé drag en vacío para mover el canvas." : "Activá editar para reubicar y cambiar forma."}</span>
            </div>

            <div className="salon-studio-editor-actions">
              {selectedItem.table?.active_order_id ? (
                <button type="button" className="btn-primary" onClick={() => onSelectOrder(selectedItem.table.active_order_id)}>
                  Abrir pedido #{selectedItem.table.active_order_id}
                </button>
              ) : selectedItem.table?.active_table_session_id ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busyId === selectedItem.table.active_table_session_id}
                  onClick={() => onMarkRetired(selectedItem.table.active_table_session_id)}
                >
                  {busyId === selectedItem.table.active_table_session_id ? "Actualizando..." : "Marcar se retiraron"}
                </button>
              ) : (
                <span className="muted">Mesa lista para recibir QR y clientes.</span>
              )}
            </div>
          </div>
        ) : (
          <div className="salon-studio-editor">
            <strong>Seleccioná una mesa</strong>
            <span className="muted">Tocá una figura en el canvas para editarla u operar sobre ella.</span>
          </div>
        )}
      </div>
    </section>
  );
}

export default SalonTablesPage;
