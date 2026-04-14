"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStoreMessagingSettings, patchStoreMessagingSettings } from "../api/staffApi";

const DEFAULT_TEMPLATE = "Estuve en COMANDA y la pasé muy bien.";

export function StoreMessagingPage({ token, storeId }) {
  const [restaurantName, setRestaurantName] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStoreMessagingSettings({ token, storeId });
      setRestaurantName(data.restaurant_name || "");
      setTemplate(data.whatsapp_share_template || DEFAULT_TEMPLATE);
    } catch (err) {
      setError(err.message || "No se pudo cargar el mensaje.");
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const preview = useMemo(() => String(template || DEFAULT_TEMPLATE), [template]);

  const save = useCallback(async () => {
    const nextValue = String(template || "").trim();
    if (!nextValue) {
      setError("El mensaje no puede quedar vacío.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await patchStoreMessagingSettings({
        token,
        storeId,
        whatsappShareTemplate: nextValue,
      });
      setRestaurantName(data.restaurant_name || "");
      setTemplate(data.whatsapp_share_template || DEFAULT_TEMPLATE);
      setMessage("Mensaje guardado.");
    } catch (err) {
      setError(err.message || "No se pudo guardar el mensaje.");
    } finally {
      setSaving(false);
    }
  }, [template, token, storeId]);

  return (
    <section className="ops-panel menu-admin-shell">
      <div className="menu-admin-hero">
        <div>
          <p className="kicker menu-admin-kicker">Configuración del restaurante</p>
          <h3>Mensaje para compartir</h3>
          <p className="muted">
            Definí el texto que sale cuando un cliente comparte el local desde su celular.
          </p>
        </div>
      </div>

      <div className="menu-admin-layout">
        <div className="menu-admin-editor">
          <div className="menu-editor-card menu-editor-card-accent">
            <div className="section-head">
              <div>
                <h4>Plantilla de WhatsApp</h4>
                <p className="muted">Escribí exactamente el mensaje que querés que el cliente comparta.</p>
              </div>
            </div>
          </div>

          <div className="menu-editor-card">
            <div className="section-head">
              <div>
                <h4>Mensaje editable</h4>
                <p className="muted">Escribilo como querés que lo vea el cliente antes de compartir.</p>
              </div>
            </div>

            {loading ? (
              <p className="muted">Cargando...</p>
            ) : (
              <label className="field">
                Texto
                <textarea
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                  placeholder={DEFAULT_TEMPLATE}
                  rows={8}
                />
              </label>
            )}

            <div className="form-actions">
              <button className="btn-primary" type="button" onClick={save} disabled={saving || loading}>
                {saving ? "Guardando..." : "Guardar mensaje"}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setTemplate(DEFAULT_TEMPLATE)} disabled={saving || loading}>
                Restaurar base
              </button>
            </div>

            {message && <p className="success-text">{message}</p>}
            {error && <p className="error-text">{error}</p>}
          </div>
        </div>

        <aside className="menu-admin-side">
          <div className="menu-editor-card">
            <div className="section-head">
              <div>
                <h4>Vista previa</h4>
                <p className="muted">Así se arma el mensaje que recibe el share del cliente.</p>
              </div>
            </div>
            <div className="detail-card">
              <strong>{restaurantName || "Tu restaurante"}</strong>
              <p className="muted" style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>{preview}</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default StoreMessagingPage;
