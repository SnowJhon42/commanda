import { useEffect, useState } from "react";

const MIN_GUESTS = 1;
const MAX_GUESTS = 20;

export function AdjustGuestsModal({ open, initialGuestCount, onClose, onSave }) {
  const [value, setValue] = useState(String(initialGuestCount ?? 2));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValue(String(initialGuestCount ?? 2));
    setError("");
  }, [open, initialGuestCount]);

  if (!open) return null;

  const save = () => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      setError("Ingresa una cantidad entera de personas.");
      return;
    }
    if (parsed < MIN_GUESTS || parsed > MAX_GUESTS) {
      setError(`La cantidad debe estar entre ${MIN_GUESTS} y ${MAX_GUESTS}.`);
      return;
    }
    onSave(parsed);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Ajustar cantidad de personas">
      <div className="modal-card">
        <h3>Ajustar cantidad de personas</h3>
        <p className="muted">Este cambio aplica a proximos pedidos.</p>

        <label className="field">
          Personas
          <input
            type="number"
            min="1"
            max="20"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={save}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
