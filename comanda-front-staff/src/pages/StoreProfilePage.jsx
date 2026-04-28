"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createStaffAccount,
  fetchStaffAccounts,
  fetchStoreProfileSettings,
  patchStaffAccount,
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

const THEME_TONE = {
  CLASSIC: {
    surface: "#fffaf3",
    surfaceStrong: "#fff0df",
    text: "#24190f",
    muted: "#6b5f56",
    nav: "rgba(255, 248, 239, 0.94)",
  },
  MODERN: {
    surface: "#f8fbff",
    surfaceStrong: "#eaf3ff",
    text: "#132033",
    muted: "#536274",
    nav: "rgba(244, 249, 255, 0.94)",
  },
  PREMIUM: {
    surface: "#162030",
    surfaceStrong: "#1f2c40",
    text: "#f7f3ec",
    muted: "#c7d1df",
    nav: "rgba(15, 23, 42, 0.92)",
  },
};

const EMPTY_PROFILE = {
  restaurant_name: "",
  owner_password_configured: false,
  logo_url: "",
  cover_image_url: "",
  theme_preset: "CLASSIC",
  accent_color: "ROJO",
  background_color: "ROJO",
  background_image_url: "",
  show_watermark_logo: false,
};

const EMPTY_STAFF_FORM = {
  display_name: "",
  username: "",
  pin: "",
  sector: "ADMIN",
};

function normalizeProfile(data) {
  return {
    restaurant_name: data?.restaurant_name || "",
    owner_password_configured: Boolean(data?.owner_password_configured),
    logo_url: data?.logo_url || "",
    cover_image_url: data?.cover_image_url || "",
    theme_preset: data?.theme_preset || "CLASSIC",
    accent_color: data?.accent_color || "ROJO",
    background_color: data?.background_color || data?.accent_color || "ROJO",
    background_image_url: data?.background_image_url || "",
    show_watermark_logo: Boolean(data?.show_watermark_logo),
  };
}

function hasInvalidBlobUrl(value) {
  return String(value || "").trim().startsWith("blob:");
}

export function StoreProfilePage({ token, storeId, sessionStaffId = null, staffDisplayName = "" }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const [staffPins, setStaffPins] = useState({});
  const [ownerPassword, setOwnerPassword] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [staffSaving, setStaffSaving] = useState(false);
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

  const loadStaffAccounts = useCallback(async () => {
    if (!ownerPassword.trim()) return;
    setStaffLoading(true);
    setError("");
    try {
      const data = await fetchStaffAccounts({ token, storeId, ownerPassword });
      setStaffAccounts(data.items || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los usuarios del staff.");
    } finally {
      setStaffLoading(false);
    }
  }, [ownerPassword, storeId, token]);

  useEffect(() => {
    if (!unlocked || !ownerPassword.trim()) return;
    loadStaffAccounts();
  }, [loadStaffAccounts, ownerPassword, unlocked]);

  const selectedColor = useMemo(
    () => COLOR_OPTIONS.find((option) => option.value === profile.accent_color) || COLOR_OPTIONS[0],
    [profile.accent_color]
  );
  const selectedBackgroundColor = useMemo(
    () => COLOR_OPTIONS.find((option) => option.value === profile.background_color) || COLOR_OPTIONS[0],
    [profile.background_color]
  );
  const selectedTheme = useMemo(
    () => THEME_OPTIONS.find((option) => option.value === profile.theme_preset) || THEME_OPTIONS[0],
    [profile.theme_preset]
  );
  const previewTone = THEME_TONE[profile.theme_preset] || THEME_TONE.CLASSIC;

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
      const data = await uploadMenuImage({ token, file, ownerPassword });
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
        background_color: data.accent_color,
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
    if (newOwnerPassword.trim() && newOwnerPassword.trim().length < 4) {
      setError("La nueva contraseña debe tener al menos 4 caracteres.");
      return;
    }
    if (
      hasInvalidBlobUrl(profile.logo_url) ||
      hasInvalidBlobUrl(profile.cover_image_url) ||
      hasInvalidBlobUrl(profile.background_image_url)
    ) {
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
          new_owner_password: newOwnerPassword.trim() || null,
          restaurant_name: profile.restaurant_name.trim(),
          logo_url: profile.logo_url.trim() || null,
          cover_image_url: profile.cover_image_url.trim() || null,
          theme_preset: profile.theme_preset,
          accent_color: profile.accent_color,
          background_color: profile.background_color,
          background_image_url: profile.background_image_url.trim() || null,
          show_watermark_logo: profile.show_watermark_logo,
        },
      });
      setProfile(normalizeProfile(data));
      setNewOwnerPassword("");
      setMessage("Perfil del local guardado. El cliente lo verá al recargar.");
    } catch (err) {
      setError(err.message || "No se pudo guardar el perfil del local.");
    } finally {
      setSaving(false);
    }
  };

  const saveStaffAccount = async () => {
    if (!unlocked) {
      setError("Desbloqueá la edición con la contraseña de dueño.");
      return;
    }
    if (!ownerPassword.trim()) {
      setError("Ingresá la contraseña de dueño.");
      return;
    }
    if (!staffForm.display_name.trim() || !staffForm.username.trim() || !staffForm.pin.trim()) {
      setError("Completá nombre, usuario y PIN del staff.");
      return;
    }
    setStaffSaving(true);
    setError("");
    setMessage("");
    try {
      await createStaffAccount({
        token,
        storeId,
        ownerPassword,
        payload: {
          display_name: staffForm.display_name.trim(),
          username: staffForm.username.trim(),
          pin: staffForm.pin.trim(),
          sector: staffForm.sector,
          active: true,
        },
      });
      setStaffForm(EMPTY_STAFF_FORM);
      setMessage("Usuario del staff creado.");
      await loadStaffAccounts();
    } catch (err) {
      setError(err.message || "No se pudo crear el usuario.");
    } finally {
      setStaffSaving(false);
    }
  };

  const updateStaffStatus = async (staff) => {
    setStaffSaving(true);
    setError("");
    setMessage("");
    try {
      await patchStaffAccount({
        token,
        storeId,
        staffId: staff.id,
        ownerPassword,
        payload: { active: !staff.active },
      });
      setMessage("Estado del usuario actualizado.");
      await loadStaffAccounts();
    } catch (err) {
      setError(err.message || "No se pudo actualizar el usuario.");
    } finally {
      setStaffSaving(false);
    }
  };

  const updateStaffPin = async (staff) => {
    const pin = String(staffPins[staff.id] || "").trim();
    if (!pin) {
      setError("Ingresá un PIN nuevo para actualizar ese usuario.");
      return;
    }
    setStaffSaving(true);
    setError("");
    setMessage("");
    try {
      await patchStaffAccount({
        token,
        storeId,
        staffId: staff.id,
        ownerPassword,
        payload: { pin },
      });
      setStaffPins((current) => ({ ...current, [staff.id]: "" }));
      setMessage("PIN actualizado.");
      await loadStaffAccounts();
    } catch (err) {
      setError(err.message || "No se pudo actualizar el PIN.");
    } finally {
      setStaffSaving(false);
    }
  };

  if (!unlocked) {
    return (
      <section className="ops-panel menu-admin-shell store-profile-page">
        <div className="menu-admin-hero">
          <div>
            <p className="kicker menu-admin-kicker">Perfil, identidad y usuarios</p>
            <h3>Mi local</h3>
            <p className="muted">
              La configuracion del local, los usuarios del staff y los cambios sensibles requieren clave de dueno.
            </p>
          </div>
        </div>

        <div className="menu-editor-card store-owner-card">
          <div className="section-head">
            <div>
              <h4>Desbloquear edicion sensible</h4>
              <p className="muted">
                Usuario actual: <strong>{staffDisplayName || "ADMIN"}</strong>.
              </p>
            </div>
          </div>
          <label className="field">
            Clave de dueno
            <input
              type="password"
              value={ownerPassword}
              onChange={(event) => setOwnerPassword(event.target.value)}
              placeholder="Clave de dueno"
            />
          </label>
          <div className="form-actions">
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                if (!ownerPassword.trim()) {
                  setError("Ingresa la clave de dueno para editar Mi local.");
                  return;
                }
                setUnlocked(true);
                setError("");
              }}
            >
              Desbloquear
            </button>
          </div>
          {message && <p className="success-text">{message}</p>}
          {error && <p className="error-text">{error}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="ops-panel menu-admin-shell store-profile-page">
      <div className="menu-admin-hero">
        <div>
          <p className="kicker menu-admin-kicker">Mi local</p>
          <h3>Diseñá cómo quiere verse tu restaurante</h3>
          <p className="muted">
            Definí dirección visual, color, imágenes y una vista previa cercana a la experiencia real del cliente.
          </p>
        </div>
      </div>

      <div className="menu-admin-layout">
        <div className="menu-admin-editor">
          <div className="menu-editor-card store-profile-vision-card">
            <div className="section-head">
              <div>
                <h4>Dirección visual</h4>
                <p className="muted">Elegí el tono general del cliente.</p>
              </div>
            </div>

            <div className="store-style-options store-style-options-rich">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={!unlocked}
                  className={
                    profile.theme_preset === option.value
                      ? "store-style-card store-style-card-rich store-style-card-active"
                      : "store-style-card store-style-card-rich"
                  }
                  onClick={() => updateProfile("theme_preset", option.value)}
                >
                  <div className={`store-style-card-preview store-style-card-preview-${option.value.toLowerCase()}`}>
                    <div className="store-style-card-preview-top" style={{ background: selectedColor.swatch }} />
                    <div className="store-style-card-preview-body">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                  <strong>{option.label}</strong>
                  <span>{option.text}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="menu-editor-card store-profile-color-card">
            <div className="section-head">
              <div>
                <h4>Color principal</h4>
                <p className="muted">Botones, CTA y badges.</p>
              </div>
            </div>

            <div className="store-color-row store-color-row-grid">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={!unlocked}
                  className={
                    profile.accent_color === option.value
                      ? "store-color-btn store-color-btn-card store-color-btn-active"
                      : "store-color-btn store-color-btn-card"
                  }
                  onClick={() => updateProfile("accent_color", option.value)}
                >
                  <span style={{ background: option.swatch }} />
                  <strong>{option.label}</strong>
                  <small>Botones y acciones</small>
                </button>
              ))}
            </div>
          </div>

          <div className="menu-editor-card store-profile-background-card">
            <div className="section-head">
              <div>
                <h4>Fondo del cliente</h4>
                <p className="muted">Clima general del cliente, separado del color principal.</p>
              </div>
            </div>

            <div className="store-color-row store-color-row-grid">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={!unlocked}
                  className={
                    profile.background_color === option.value
                      ? "store-color-btn store-color-btn-card store-color-btn-active"
                      : "store-color-btn store-color-btn-card"
                  }
                  onClick={() => updateProfile("background_color", option.value)}
                >
                  <span style={{ background: option.swatch }} />
                  <strong>{option.label}</strong>
                  <small>Base ambiental</small>
                </button>
              ))}
            </div>

            <div className="store-background-grid">
              <div className="store-background-preview" style={{ "--store-background-base": selectedBackgroundColor.swatch }}>
                {profile.background_image_url ? <img src={profile.background_image_url} alt="" /> : <span>Sin imagen de fondo</span>}
              </div>
              <div className="store-background-controls">
                <label className="field">
                  URL imagen de fondo
                  <input
                    value={profile.background_image_url}
                    disabled={!unlocked}
                    onChange={(event) => updateProfile("background_image_url", event.target.value)}
                    placeholder="https://..."
                  />
                </label>
                <label className="field">
                  Subir imagen de fondo
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!unlocked || uploadingKey === "background_image_url"}
                    onChange={(event) => handleUpload("background_image_url", event.target.files?.[0])}
                  />
                </label>
                <p className="muted">
                  Si cargás una imagen, se usa como atmósfera general del cliente. Si no, queda solo el color de fondo.
                </p>
              </div>
            </div>
          </div>

          <div className="menu-editor-card">
            <div className="section-head">
              <div>
                <h4>Marca e imágenes</h4>
                <p className="muted">Nombre, logo y portada del hero.</p>
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

                <div className="store-identity-grid">
                  <div className="store-identity-card store-identity-card-compact">
                    <div className="store-identity-head">
                      <div>
                        <strong>Logo</strong>
                        <p className="muted">Se ve en el encabezado del cliente.</p>
                      </div>
                      <div className="store-identity-thumb store-identity-thumb-logo">
                        {profile.logo_url ? <img src={profile.logo_url} alt="" /> : <span>Logo</span>}
                      </div>
                    </div>
                    <label className="field">
                      URL logo
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

                  <div className="store-identity-card store-identity-card-compact">
                    <div className="store-identity-head">
                      <div>
                        <strong>Portada</strong>
                        <p className="muted">Solo para la parte superior del cliente.</p>
                      </div>
                      <div className="store-identity-thumb store-identity-thumb-cover">
                        {profile.cover_image_url ? <img src={profile.cover_image_url} alt="" /> : <span>Portada</span>}
                      </div>
                    </div>
                    <label className="field">
                      URL portada
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
                </div>
              </>
            )}
          </div>

          <div className="menu-editor-card">
            <div className="section-head">
              <div>
                <h4>Ajustes de identidad</h4>
                <p className="muted">La preview manda. IA solo propone una base.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={suggestTheme} disabled={!unlocked || suggesting}>
                {suggesting ? "Sugiriendo..." : "Sugerir con IA"}
              </button>
            </div>

            <label className="field inline-field">
              <span>Usar logo como marca de agua sobre el cliente</span>
              <input
                type="checkbox"
                checked={profile.show_watermark_logo}
                disabled={!unlocked}
                onChange={(event) => updateProfile("show_watermark_logo", event.target.checked)}
              />
            </label>
          </div>

          <div className="menu-editor-card menu-editor-card-accent store-owner-card">
            <div className="section-head">
              <div>
                <h4>Guardar y seguridad</h4>
                <p className="muted">Desbloqueá para guardar cambios o rotar la contraseña del dueño.</p>
              </div>
              <button
                type="button"
                className={unlocked ? "btn-primary" : "btn-secondary"}
                onClick={() => setUnlocked((current) => !current)}
              >
                {unlocked ? "Edición activa" : "Desbloquear"}
              </button>
            </div>
            <div className="store-owner-grid">
              <label className="field">
                Contraseña actual del dueño
                <input
                  type="password"
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                  placeholder="Contraseña actual"
                />
              </label>
              <label className="field">
                Nueva contraseña del dueño
                <input
                  type="password"
                  value={newOwnerPassword}
                  onChange={(event) => setNewOwnerPassword(event.target.value)}
                  placeholder="Opcional"
                />
              </label>
            </div>
            <p className="muted">
              Clave configurada: <strong>{profile.owner_password_configured ? "sí" : "no"}</strong>.
            </p>
          </div>

          <div className="menu-editor-card">
            <div className="section-head">
              <div>
                <h4>Usuarios del staff</h4>
                <p className="muted">Solo el dueño puede crear encargados, cambiar PIN y activar o desactivar cuentas.</p>
              </div>
              <button className="btn-secondary" type="button" onClick={loadStaffAccounts} disabled={!unlocked || staffLoading || !ownerPassword.trim()}>
                {staffLoading ? "Cargando..." : "Recargar usuarios"}
              </button>
            </div>

            {!unlocked ? (
              <p className="muted">Desbloqueá con la contraseña de dueño para administrar usuarios del staff.</p>
            ) : (
              <>
                <div className="form-grid">
                  <label className="field">
                    Nombre visible
                    <input
                      value={staffForm.display_name}
                      onChange={(event) => setStaffForm((current) => ({ ...current, display_name: event.target.value }))}
                      placeholder="Agustín"
                    />
                  </label>
                  <label className="field">
                    Usuario
                    <input
                      value={staffForm.username}
                      onChange={(event) => setStaffForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder="agustin"
                    />
                  </label>
                  <label className="field">
                    PIN
                    <input
                      type="password"
                      value={staffForm.pin}
                      onChange={(event) => setStaffForm((current) => ({ ...current, pin: event.target.value }))}
                      placeholder="1234"
                    />
                  </label>
                  <label className="field">
                    Sector
                    <select
                      value={staffForm.sector}
                      onChange={(event) => setStaffForm((current) => ({ ...current, sector: event.target.value }))}
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="KITCHEN">KITCHEN</option>
                      <option value="BAR">BAR</option>
                      <option value="WAITER">WAITER</option>
                    </select>
                  </label>
                </div>
                <div className="form-actions" style={{ marginBottom: 18 }}>
                  <button className="btn-primary" type="button" onClick={saveStaffAccount} disabled={staffSaving}>
                    {staffSaving ? "Guardando..." : "Crear usuario"}
                  </button>
                </div>

                <div className="shift-closed-table-list">
                  {staffAccounts.map((staff) => (
                    <div key={staff.id} className="detail-card" style={{ marginBottom: 12 }}>
                      <strong>{staff.display_name}</strong>
                      <p className="muted">
                        @{staff.username} · {staff.sector} · {staff.active ? "activo" : "inactivo"}
                        {sessionStaffId === staff.id ? " · tu cuenta actual" : ""}
                      </p>
                      <div className="form-grid">
                        <label className="field">
                          Nuevo PIN
                          <input
                            type="password"
                            value={staffPins[staff.id] || ""}
                            onChange={(event) => setStaffPins((current) => ({ ...current, [staff.id]: event.target.value }))}
                            placeholder="Nuevo PIN"
                          />
                        </label>
                      </div>
                      <div className="form-actions">
                        <button className="btn-secondary" type="button" onClick={() => updateStaffPin(staff)} disabled={staffSaving}>
                          Cambiar PIN
                        </button>
                        <button className="btn-secondary" type="button" onClick={() => updateStaffStatus(staff)} disabled={staffSaving}>
                          {staff.active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!staffLoading && staffAccounts.length === 0 && <p className="muted">Todavía no cargaste usuarios del staff.</p>}
                </div>
              </>
            )}
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
          <div className="menu-editor-card store-preview-card">
            <div className="section-head">
              <div>
                <h4>Vista previa cliente</h4>
                <p className="muted">Así debería sentirse el cliente.</p>
              </div>
            </div>

            <div
              className={`store-profile-preview store-profile-preview-${profile.theme_preset.toLowerCase()}`}
              style={{
                "--store-preview-accent": selectedColor.swatch,
                "--store-preview-bg-accent": selectedBackgroundColor.swatch,
                "--store-preview-surface": previewTone.surface,
                "--store-preview-surface-strong": previewTone.surfaceStrong,
                "--store-preview-text": previewTone.text,
                "--store-preview-muted": previewTone.muted,
                "--store-preview-nav": previewTone.nav,
                "--store-preview-background": profile.background_image_url ? `url("${profile.background_image_url}")` : "none",
              }}
            >
              <div className="store-profile-preview-ambient" />
              <div className="store-profile-preview-hero">
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
                  <span className="store-profile-preview-pill">{selectedColor.label}</span>
                  <strong>{profile.restaurant_name || "Tu restaurante"}</strong>
                  <p>Menú digital para pedir desde la mesa.</p>
                </div>
              </div>

              <div className="store-profile-preview-content">
                <div className="store-profile-preview-tabs">
                  <button type="button" className="store-profile-preview-tab store-profile-preview-tab-active">Entradas</button>
                  <button type="button" className="store-profile-preview-tab">Principales</button>
                  <button type="button" className="store-profile-preview-tab">Bebidas</button>
                </div>

                <article className="store-profile-preview-product">
                  <div className="store-profile-preview-product-copy">
                    <div className="store-profile-preview-product-top">
                      <h5>Hamburguesa de la casa</h5>
                      <span className="store-profile-preview-price">$12.000</span>
                    </div>
                    <p>Pan brioche, cheddar, cebolla y salsa de la casa.</p>
                    <div className="store-profile-preview-badges">
                      <span className="store-profile-preview-soft-pill">Cocina</span>
                      <span className="store-profile-preview-count">2</span>
                    </div>
                  </div>
                  <div className="store-profile-preview-product-media">
                    <div className="store-profile-preview-product-image" />
                    <button type="button" className="store-profile-preview-add">+</button>
                  </div>
                </article>

                <div className="store-profile-preview-bottom-nav">
                  <button type="button" className="store-profile-preview-nav-btn store-profile-preview-nav-btn-active">Menú</button>
                  <button type="button" className="store-profile-preview-nav-btn">Notis</button>
                  <button type="button" className="store-profile-preview-nav-btn">Mesa</button>
                  <button type="button" className="store-profile-preview-nav-btn">Mozo</button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default StoreProfilePage;
