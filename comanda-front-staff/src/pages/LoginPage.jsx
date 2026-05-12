import { useEffect, useState } from "react";
import { sectorLogin } from "../api/staffApi";

const LOGIN_PREFS_KEY = "comanda_staff_login_prefs_v1";
const LOGIN_PIN_SESSION_KEY = "comanda_staff_login_pin_v1";
const DEFAULT_STORE_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_STORE_ID) > 0
  ? Number(process.env.NEXT_PUBLIC_DEFAULT_STORE_ID)
  : 1;

function parseStoreId(input) {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function getInitialLoginPrefs() {
  if (typeof window === "undefined") {
    return { storeId: DEFAULT_STORE_ID, username: "", pin: "" };
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const storeFromUrl = parseStoreId(params.get("store_id") || params.get("store"));
    const usernameFromUrl = String(params.get("username") || "").trim();
    const raw = window.localStorage.getItem(LOGIN_PREFS_KEY);
    const savedPin = window.sessionStorage.getItem(LOGIN_PIN_SESSION_KEY) || "";
    const saved = raw ? JSON.parse(raw) : {};
    return {
      storeId: storeFromUrl || parseStoreId(saved.storeId) || DEFAULT_STORE_ID,
      username: usernameFromUrl || String(saved.username || "").trim(),
      pin: savedPin,
    };
  } catch {
    return { storeId: DEFAULT_STORE_ID, username: "", pin: "" };
  }
}

export function LoginPage({ onLogin, closureReceipt = null }) {
  const initialPrefs = getInitialLoginPrefs();
  const [storeId, setStoreId] = useState(initialPrefs.storeId);
  const [username, setUsername] = useState(initialPrefs.username);
  const [pin, setPin] = useState(initialPrefs.pin);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        LOGIN_PREFS_KEY,
        JSON.stringify({
          storeId: parseStoreId(storeId) || DEFAULT_STORE_ID,
          username: String(username || "").trim(),
        })
      );
    } catch {
    }
  }, [storeId, username]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (pin) {
        window.sessionStorage.setItem(LOGIN_PIN_SESSION_KEY, pin);
      } else {
        window.sessionStorage.removeItem(LOGIN_PIN_SESSION_KEY);
      }
    } catch {
    }
  }, [pin]);

  const submit = async (e) => {
    e?.preventDefault?.();
    setError("");
    setSubmitting(true);
    try {
      const session = await sectorLogin({
        store_id: Number(storeId),
        username: String(username || "").trim(),
        pin: String(pin || "").trim(),
      });
      await onLogin(session);
      try {
        window.sessionStorage.removeItem(LOGIN_PIN_SESSION_KEY);
      } catch {
      }
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesion");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnterSubmit = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!submitting) {
      submit(e);
    }
  };

  return (
    <main className="staff-shell">
      <section className="login-card login-card-auth">
        <div className="login-auth-hero">
          <p className="kicker login-auth-kicker">Panel interno</p>
          <h2>Acceso del staff</h2>
          <p className="muted">
            Entrá con tu usuario y PIN del local. Si abriste el panel desde un enlace interno, el local ya debería venir
            seleccionado.
          </p>
        </div>

        {closureReceipt && (
          <div className="shift-login-receipt">
            <strong>Cierre registrado</strong>
            <p className="muted">
              {closureReceipt.label} · {closureReceipt.user}
            </p>
            <p className="muted">
              {closureReceipt.dateLabel}
            </p>
            <p className="muted">
              Disponible en Resumenes.
            </p>
          </div>
        )}

        <div className="shift-login-receipt login-flow-note">
          <strong>Ingreso operativo</strong>
          <p className="muted">Después del acceso te mostramos si corresponde abrir turno y caja o retomar un turno pendiente.</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="field">
            Local
            <input
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              onKeyDown={handleEnterSubmit}
              placeholder={String(DEFAULT_STORE_ID)}
            />
            <small className="muted">Usá el ID del local solo si no vino cargado automáticamente.</small>
          </label>
          <label className="field">
            Usuario
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleEnterSubmit}
              placeholder="agustin"
            />
            <small className="muted">Ejemplo: `admin`, `kitchen`, `bar`, `waiter` o tu usuario personalizado.</small>
          </label>
          <label className="field">
            PIN
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={handleEnterSubmit}
              placeholder="PIN personal"
              type="password"
            />
            <small className="muted">Es personal y no reemplaza la clave de dueño para cambios sensibles.</small>
          </label>
          <button className="btn-primary btn-full" type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>
    </main>
  );
}

export default LoginPage;
