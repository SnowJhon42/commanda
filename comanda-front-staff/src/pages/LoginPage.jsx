import { useEffect, useState } from "react";
import { sectorLogin } from "../api/staffApi";

const LOGIN_PREFS_KEY = "comanda_staff_login_prefs_v1";
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
    return { storeId: DEFAULT_STORE_ID, username: "" };
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const storeFromUrl = parseStoreId(params.get("store_id") || params.get("store"));
    const usernameFromUrl = String(params.get("username") || "").trim();
    const raw = window.localStorage.getItem(LOGIN_PREFS_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return {
      storeId: storeFromUrl || DEFAULT_STORE_ID,
      username: usernameFromUrl || String(saved.username || "").trim(),
    };
  } catch {
    return { storeId: DEFAULT_STORE_ID, username: "" };
  }
}

export function LoginPage({ onLogin, closureReceipt = null }) {
  const initialPrefs = getInitialLoginPrefs();
  const [storeId, setStoreId] = useState(initialPrefs.storeId);
  const [username, setUsername] = useState(initialPrefs.username);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        LOGIN_PREFS_KEY,
        JSON.stringify({
          username: String(username || "").trim(),
        })
      );
    } catch {
    }
  }, [username]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const session = await sectorLogin({ store_id: Number(storeId), username, pin });
      onLogin(session);
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesion");
    }
  };

  return (
    <main className="staff-shell">
      <section className="login-card">
        <p className="kicker">Acceso interno</p>
        <h2>Login Staff</h2>
        <p className="muted">Usa tu usuario de staff y tu PIN personal. Si no llega por URL, se abre con el store por defecto.</p>

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

        <div className="shift-login-receipt">
          <strong>Ingreso unico</strong>
          <p className="muted">Despues del login, el sistema te muestra si tenes que abrir turno y caja o resolver un turno pendiente.</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="field">
            Store ID
            <input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder={String(DEFAULT_STORE_ID)} />
          </label>
          <label className="field">
            Usuario
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="agustin" />
          </label>
          <label className="field">
            PIN
            <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN personal" type="password" />
          </label>
          <button className="btn-primary btn-full" type="submit">
            Ingresar
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </section>
    </main>
  );
}

export default LoginPage;
