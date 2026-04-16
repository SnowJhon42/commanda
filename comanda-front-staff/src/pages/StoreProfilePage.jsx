"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchStoreProfileSettings,
  patchStoreProfileSettings,
  suggestStoreProfileTheme,
  uploadMenuImage,
} from "../api/staffApi";

const THEME_OPTIONS = [
  { value: "CLASSIC", label: "Clásico", text: "Claro, simple y directo." },
  { value: "MODERN", label: "Moderno", text: "Más visual, con portada protagonista." },
  { value: "PREMIUM", label: "Premium", text: "Elegante, oscuro y más de noche." },
];

const COLOR_OPTIONS = [
  { value: "ROJO", label: "Rojo", swatch: "#b3261e" },
  { value: "VERDE", label: "Verde", swatch: "#1f7a4d" },
  { value: "DORADO", label: "Dorado", swatch: "#b8872d" },
  { value: "AZUL", label: "Azul", swatch: "#2563eb" },
  { value: "NEGRO", label: "Negro", swatch: "#1f2937" },
];

const EMPTY_PROFILE = {
  restaurant_name: "",
  logo_url: "",
  cover_image_url: "",
  theme_preset: "CLASSIC",
  accent_color: "ROJO",
  show_watermark_logo: false,
};

function normalizeProfile(data) {
  return {
    restaurant_name: data?.restaurant_name || "",
    logo_url: data?.logo_url || "",
    cover_image_url: data?.cover_image_url || "",
    theme_preset: data?.theme_preset || "CLASSIC",
    accent_color: data?.accent_color || "ROJO",
    show_watermark_logo: Boolean(data?.show_watermark_logo),
  };
}

function hasInvalidBlobUrl(value) {
  return String(value || "").trim().startsWith("blob:");
}

export function StoreProfilePage({ token, storeId }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [uploadingKey, setUploadingKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStoreProfileSettings({ token, storeId });
      setProfile(normalizeProfile(data));
    } catch (err) {
      setError(err.message || "No se pudo cargar el perfil del local.");
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedColor = useMemo(
    () => COLOR_OPTIONS.find((option) => option.value === profile.accent_color) || COLOR_OPTIONS[0],
    [profile.accent_color]
  );

  const updateProfile = (key, value) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setMessage("");
    setError("");
  };

  const handleUpload = async (key, file) => {
    if (!file) return;
    setUploadingKey(key);
    setError("");
    setMessage("");
    try {
      const data = await uploadMenuImage({ token, file });
      updateProfile(key, data.image_url || "");
      setMessage("Imagen subida. Guardá el perfil para aplicarla al cliente.");
    } catch (err) {
      setError(err.message || "No se pudo subir la imagen.");
    } finally {
      setUploadingKey("");
    }
  };

  const suggestTheme = async () => {
    if (!profile.restaurant_name.trim()) {
      setError("Primero cargá el nombre del restaurante.");
      return;
    }
    setSuggesting(true);
    setError("");
    setMessage("");
    try {
      const data = await suggestStoreProfileTheme({
        token,
        payload: {
          restaurant_name: profile.restaurant_name,
          logo_url: profile.logo_url || null,
          cover_image_url: profile.cover_image_url || null,
        },
      });
      setProfile((current) => ({
        ...current,
        theme_preset: data.theme_preset,
        accent_color: data.accent_color,
        show_watermark_logo: Boolean(data.show_watermark_logo),
      }));
      setMessage(data.reason || "Sugerencia aplicada. Revisá y guardá para publicarla.");
    } catch (err) {
      setError(err.message || "No se pudo sugerir el estilo con IA.");
    } finally {
      setSuggesting(false);
    }
  };

  const save = async () => {
    if (!unlocked) {
      setError("Desbloqueá la edición con la contraseña de dueño.");
      return;
    }
    if (!ownerPassword.trim()) {
      setError("Ingresá la contraseña de dueño.");
      return;
    }
    if (!profile.restaurant_name.trim()) {
      setError("El nombre del restaurante es obligatorio.");
      return;
    }
    if (hasInvalidBlobUrl(profile.logo_url) || hasInvalidBlobUrl(profile.cover_image_url)) {
      setError("No pegues URLs blob. Subí el archivo desde el botón o pegá una URL https pública.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await patchStoreProfileSettings({
        token,
        storeId,
        payload: {
          owner_password: ownerPassword,
          restaurant_name: profile.restaurant_name.trim(),
          logo_url: profile.logo_url.trim() || null,
          cover_image_url: profile.cover_image_url.trim() || null,
          theme_preset: profile.theme_preset,
          accent_color: profile.accent_color,
          show_watermark_logo: profile.show_watermark_logo,
        },
      });
      setProfile(normalizeProfile(data));
      setMessage("Perfil del local guardado. El cliente lo verá al recargar.");
    } catch (err) {
      setError(err.message || "No se pudo guardar el perfil del local.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ops-panel menu-admin-shell">
      <div className="menu-admin-hero">
        <div>
          <p className="kicker menu-admin-kicker">Mi local</p>
          <h3>Identidad del restaurante</h3>
          <p className="muted">Nombre, imágenes y estilo que ve el cliente en el menú digital.</p>
        </div>
      </div>

      <div className="menu-admin-layout">
        <div className="menu-admin-editor">
          <div className="menu-editor-card menu-editor-card-accent">
            <div className="section-head">
              <div>
                <h4>Edición protegida</h4>
                <p className="muted">Solo el dueño puede cambiar la identidad pública del local.</p>
              </div>
              <button
                type="button"
                className={unlocked ? "btn-primary" : "btn-secondary"}
                onClick={() => setUnlocked((current) => !current)}
              >
                {unlocked ? "Edición desbloqueada" : "Desbloquear edición"}
              </button>
            </div>
            {unlocked && (
              <label className="field">
                Contraseña de dueño
                <input
                  type="password"
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                  placeholder="Contraseña"
                />
              </label>
            )}
          </div>

          <div className="menu-editor-card">
            <div className="section-head">
              <div>
                <h4>Datos visibles</h4>
                <p className="muted">Estos datos reemplazan la marca genérica en el cliente.</p>
              </div>
            </div>

            {loading ? (
              <p className="muted">Cargando...</p>
            ) : (
              <>
                <label className="field">
                  Nombre del restaurante
                  <input
                    value={profile.restaurant_name}
                    disabled={!unlocked}
                    onChange={(event) => updateProfile("restaurant_name", event.target.value)}
                    placeholder="Ej: Barra Centro"
                  />
                </label>

                <div className="form-grid">
                  <label className="field">
                    Logo
                    <input
                      value={profile.logo_url}
                      disabled={!unlocked}
                      onChange={(event) => updateProfile("logo_url", event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <label className="field">
                    Subir logo
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!unlocked || uploadingKey === "logo_url"}
                      onChange={(event) => handleUpload("logo_url", event.target.files?.[0])}
                    />
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    Imagen de portada
                    <input
                      value={profile.cover_image_url}
                      disabled={!unlocked}
                      onChange={(event) => updateProfile("cover_image_url", event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <label className="field">
                    Subir portada
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!unlocked || uploadingKey === "cover_image_url"}
                      onChange={(event) => handleUpload("cover_image_url", event.target.files?.[0])}
                    />
                  </label>
                </div>
              </>
            )}
          </div>

          <div className="menu-editor-card">
            <div className="section-head">
              <div>
                <h4>Estilo del menú digital</h4>
                <p className="muted">Opciones cerradas para que se vea personalizado sin romper legibilidad.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={suggestTheme} disabled={!unlocked || suggesting}>
                {suggesting ? "Sugiriendo..." : "Sugerir con IA"}
              </button>
            </div>

            <div className="store-style-options">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={!unlocked}
                  className={
                    profile.theme_preset === option.value
                      ? "store-style-card store-style-card-active"
                      : "store-style-card"
                  }
                  onClick={() => updateProfile("theme_preset", option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.text}</span>
                </button>
              ))}
            </div>

            <div className="store-color-row">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={!unlocked}
                  className={
                    profile.accent_color === option.value ? "store-color-btn store-color-btn-active" : "store-color-btn"
                  }
                  onClick={() => updateProfile("accent_color", option.value)}
                >
                  <span style={{ background: option.swatch }} />
                  {option.label}
                </button>
              ))}
            </div>

            <label className="field inline-field">
              <span>Usar logo como marca de agua</span>
              <input
                type="checkbox"
                checked={profile.show_watermark_logo}
                disabled={!unlocked}
                onChange={(event) => updateProfile("show_watermark_logo", event.target.checked)}
              />
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-primary" type="button" onClick={save} disabled={saving || loading}>
              {saving ? "Guardando..." : "Guardar Mi local"}
            </button>
            <button className="btn-secondary" type="button" onClick={loadData} disabled={saving || loading}>
              Recargar
            </button>
          </div>

          {message && <p className="success-text">{message}</p>}
          {error && <p className="error-text">{error}</p>}
        </div>

        <aside className="menu-admin-side">
          <div className="menu-editor-card">
            <div className="section-head">
              <div>
                <h4>Vista previa cliente</h4>
                <p className="muted">Referencia rápida de portada, logo y estilo.</p>
              </div>
            </div>
            <div className={`store-profile-preview store-profile-preview-${profile.theme_preset.toLowerCase()}`}>
              {profile.cover_image_url ? (
                <img className="store-profile-preview-cover" src={profile.cover_image_url} alt="" />
              ) : (
                <div className="store-profile-preview-cover store-profile-preview-empty">Portada</div>
              )}
              {profile.show_watermark_logo && profile.logo_url ? (
                <img className="store-profile-preview-watermark" src={profile.logo_url} alt="" />
              ) : null}
              <div className="store-profile-preview-body">
                {profile.logo_url ? <img className="store-profile-preview-logo" src={profile.logo_url} alt="" /> : null}
                <span className="store-profile-preview-pill" style={{ borderColor: selectedColor.swatch }}>
                  {selectedColor.label}
                </span>
                <strong>{profile.restaurant_name || "Tu restaurante"}</strong>
                <p>Menú digital para pedir desde la mesa.</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default StoreProfilePage;
