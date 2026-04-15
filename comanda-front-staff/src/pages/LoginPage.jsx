import { useState } from "react";
import { sectorLogin } from "../api/staffApi";

export function LoginPage({ onLogin, closureReceipt = null, activeShift = null }) {
  const [storeId, setStoreId] = useState(1);
  const [username, setUsername] = useState("admin");
  const [pin, setPin] = useState("1234");
  const [shiftLabel, setShiftLabel] = useState("Turno noche");
  const [shiftOperator, setShiftOperator] = useState("admin");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const session = await sectorLogin({ store_id: Number(storeId), username, pin });
      onLogin(session, {
        label: String(shiftLabel || "").trim(),
        operator: String(shiftOperator || username || "").trim(),
      });
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesion");
    }
  };

  return (
    <main className="staff-shell">
      <section className="login-card">
        <p className="kicker">Acceso interno</p>
        <h2>Login Staff</h2>
        <p className="muted">Usuarios de prueba: admin, kitchen, bar, waiter (PIN 1234).</p>

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

        {!activeShift && (
          <div className="shift-login-receipt">
            <strong>Inicio de turno</strong>
            <p className="muted">Definí el turno y el nombre visible antes de entrar a operar.</p>
            <div className="login-shift-grid">
              <label className="field">
                Turno
                <input value={shiftLabel} onChange={(e) => setShiftLabel(e.target.value)} placeholder="Turno noche" />
              </label>
              <label className="field">
                Nombre
                <input value={shiftOperator} onChange={(e) => setShiftOperator(e.target.value)} placeholder="admin" />
              </label>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="login-form">
          <label className="field">
            Store ID
            <input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="1" />
          </label>
          <label className="field">
            Usuario
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
          </label>
          <label className="field">
            PIN
            <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="1234" type="password" />
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
