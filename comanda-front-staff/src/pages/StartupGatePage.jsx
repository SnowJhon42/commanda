"use client";

import { useMemo, useState } from "react";

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(
    value || 0
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}

export function StartupGatePage({
  session,
  activeShift = null,
  shiftSummary = null,
  busy = false,
  onStartShiftAndCash = () => {},
  onGoToClosure = () => {},
  onLogout = () => {},
}) {
  const defaultLabel = useMemo(() => {
    const hour = new Date().toLocaleString("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const numericHour = Number(hour);
    if (numericHour < 14) return "Turno mañana";
    if (numericHour < 20) return "Turno tarde";
    return "Turno noche";
  }, []);
  const [shiftLabel, setShiftLabel] = useState(defaultLabel);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [note, setNote] = useState("");

  const hasActiveShift = Boolean(activeShift);
  const cashSession = shiftSummary?.cashSession || null;
  const cashStatusLabel = !cashSession
    ? "Sin caja abierta"
    : cashSession.status === "OPEN"
      ? "Caja abierta"
      : "Caja cerrada";

  return (
    <main className="staff-shell">
      <section className="login-card startup-card">
        <p className="kicker">Arranque operativo</p>
        <h2>{hasActiveShift ? "Hay un turno pendiente" : "Abrir turno y caja"}</h2>
        <p className="muted">
          Usuario: <strong>{session?.staff?.display_name || session?.staff?.username || "-"}</strong>
        </p>

        {hasActiveShift ? (
          <div className="shift-login-receipt startup-summary-card">
            <strong>{activeShift.label || "Turno abierto"}</strong>
            <p className="muted">
              Operador visible: <strong>{activeShift.operator_name || "-"}</strong>
            </p>
            <p className="muted">
              Apertura: <strong>{formatDateTime(activeShift.opened_at)}</strong>
            </p>
            <p className="muted">
              Estado de caja: <strong>{cashStatusLabel}</strong>
            </p>
            <p className="muted">
              No se puede abrir un turno nuevo hasta cerrar o resolver este turno pendiente.
            </p>
            <div className="form-actions">
              <button type="button" className="btn-primary" onClick={onGoToClosure}>
                Ir a Cierres
              </button>
              <button type="button" className="btn-secondary" onClick={onLogout}>
                Cerrar sesion
              </button>
            </div>
          </div>
        ) : (
          <div className="shift-login-receipt startup-summary-card">
            <strong>Inicio del turno</strong>
            <p className="muted">Definí el turno y contá el efectivo inicial antes de empezar a operar.</p>
            <div className="login-shift-grid startup-grid-single">
              <label className="field">
                Turno
                <input value={shiftLabel} onChange={(e) => setShiftLabel(e.target.value)} placeholder="Turno mañana" />
              </label>
              <label className="field">
                Efectivo inicial
                <input
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="0"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </label>
            </div>
            <label className="field">
              Observacion opcional
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Caja inicial, cambio, comentarios..." />
            </label>
            <div className="startup-kpi-row">
              <div className="shift-stat-box">
                <span>Caja inicial</span>
                <strong>{formatMoney(Number(openingFloat || 0))}</strong>
              </div>
              <div className="shift-stat-box">
                <span>Operador</span>
                <strong>{session?.staff?.display_name || session?.staff?.username || "-"}</strong>
              </div>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  onStartShiftAndCash({
                    label: shiftLabel,
                    operatorName: session?.staff?.display_name || session?.staff?.username || "admin",
                    openingFloat,
                    note,
                  })
                }
                disabled={busy}
              >
                {busy ? "Abriendo..." : "Abrir turno y caja"}
              </button>
              <button type="button" className="btn-secondary" onClick={onLogout} disabled={busy}>
                Cerrar sesion
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default StartupGatePage;
