"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAdminProductExtraOption,
  createAdminProduct,
  fetchAdminMenuCategories,
  fetchAdminMenuProducts,
  patchAdminProductExtraOption,
  patchAdminProduct,
  uploadMenuImage,
} from "../api/staffApi";

const DEFAULT_FORM = {
  name: "",
  description: "",
  base_price: "",
  fulfillment_sector: "KITCHEN",
  category_id: "",
  image_url: "",
  active: true,
};

const SECTOR_OPTIONS = ["KITCHEN", "BAR", "WAITER"];

export function MenuEditorPage({ token, storeId }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [extraForm, setExtraForm] = useState({ name: "", extra_price: "0" });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cats, prods] = await Promise.all([
        fetchAdminMenuCategories({ token }),
        fetchAdminMenuProducts({ token }),
      ]);
      setCategories(cats || []);
      setProducts(prods || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las listas.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = useCallback(() => {
    setForm(DEFAULT_FORM);
    setExtraForm({ name: "", extra_price: "0" });
    setEditingId(null);
    setMessage("");
    setError("");
  }, []);

  const handleEdit = useCallback(
    (product) => {
      setForm({
        name: product.name,
        description: product.description || "",
        base_price: String(product.base_price),
        fulfillment_sector: product.fulfillment_sector,
        category_id: product.category_id || "",
        image_url: product.image_url || "",
        active: product.active,
      });
      setEditingId(product.id);
      setExtraForm({ name: "", extra_price: "0" });
      setMessage("");
      setError("");
    },
    []
  );

  const activeProduct = useMemo(
    () => products.find((product) => product.id === editingId) || null,
    [products, editingId]
  );

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setImageUploading(true);
      setError("");
      try {
        const uploaded = await uploadMenuImage({ token, file });
        setForm((prev) => ({ ...prev, image_url: uploaded.image_url }));
        setMessage("Imagen actualizada automáticamente.");
      } catch (err) {
        setError(err.message || "No se pudo subir la imagen.");
      } finally {
        setImageUploading(false);
        event.target.value = "";
      }
    },
    [token]
  );

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setError("");
      setMessage("");
      if (!form.name.trim()) {
        setError("El nombre es obligatorio.");
        return;
      }
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        base_price: Number(form.base_price || 0),
        fulfillment_sector: form.fulfillment_sector,
        category_id: form.category_id ? Number(form.category_id) : null,
        image_url: form.image_url ? form.image_url : null,
        active: Boolean(form.active),
      };
      setSaving(true);
      try {
        if (editingId) {
          await patchAdminProduct({ token, productId: editingId, payload });
          setMessage("Producto actualizado.");
        } else {
          await createAdminProduct({ token, payload });
          setMessage("Producto creado.");
        }
        await loadData();
        resetForm();
      } catch (err) {
        setError(err.message || "No se pudo guardar el producto.");
      } finally {
        setSaving(false);
      }
    },
    [editingId, form, resetForm, loadData, token]
  );

  const toggleActive = useCallback(
    async (product) => {
      setSaving(true);
      setError("");
      try {
        await patchAdminProduct({
          token,
          productId: product.id,
          payload: { active: !product.active },
        });
        await loadData();
      } catch (err) {
        setError(err.message || "No se pudo actualizar el estado.");
      } finally {
        setSaving(false);
      }
    },
    [token, loadData]
  );

  const createExtraOption = useCallback(async () => {
    if (!editingId) return;
    const name = extraForm.name.trim();
    if (!name) {
      setError("El nombre del extra es obligatorio.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await createAdminProductExtraOption({
        token,
        productId: editingId,
        payload: {
          name,
          extra_price: Number(extraForm.extra_price || 0),
          active: true,
        },
      });
      setExtraForm({ name: "", extra_price: "0" });
      setMessage("Extra agregado.");
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo crear el extra.");
    } finally {
      setSaving(false);
    }
  }, [editingId, extraForm, loadData, token]);

  const toggleExtraOption = useCallback(
    async (extra) => {
      setSaving(true);
      setError("");
      try {
        await patchAdminProductExtraOption({
          token,
          extraOptionId: extra.id,
          payload: { active: !extra.active },
        });
        await loadData();
      } catch (err) {
        setError(err.message || "No se pudo actualizar el extra.");
      } finally {
        setSaving(false);
      }
    },
    [token, loadData]
  );

  const formIsDirty = useMemo(() => {
    return (
      form.name ||
      form.description ||
      form.base_price ||
      form.image_url ||
      editingId ||
      form.category_id
    );
  }, [form, editingId]);

  return (
    <section className="panel">
      <div className="section-head">
        <h3>Editor de menú</h3>
        <p className="muted">
          Admin: {storeId} · {editingId ? "Editando producto" : "Nuevo producto"}
        </p>
      </div>

      <form className="menu-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field">
            Nombre
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Hamburguesa clásica"
            />
          </label>
          <label className="field">
            Descripción
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Carne, queso, lechuga y tomate"
            />
          </label>
          <label className="field">
            Precio base
            <input
              type="number"
              min="0"
              step="10"
              value={form.base_price}
              onChange={(event) => setForm((prev) => ({ ...prev, base_price: event.target.value }))}
            />
          </label>
          <label className="field">
            Sector
            <select
              value={form.fulfillment_sector}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, fulfillment_sector: event.target.value }))
              }
            >
              {SECTOR_OPTIONS.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Categoría
            <select
              value={form.category_id}
              onChange={(event) => setForm((prev) => ({ ...prev, category_id: event.target.value }))}
            >
              <option value="">Sin categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Imagen (URL o archivo)
            <input
              type="text"
              value={form.image_url}
              onChange={(event) => setForm((prev) => ({ ...prev, image_url: event.target.value }))}
              placeholder="https://pub-.../menu/products/plato.jpg"
            />
            <input type="file" accept="image/*" onChange={handleFileChange} />
          </label>
          <label className="field">
            Activo
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="btn-primary" type="submit" disabled={saving || imageUploading || loading}>
            {saving ? "Guardando..." : editingId ? "Actualizar producto" : "Crear producto"}
          </button>
          {editingId && (
            <button className="btn-secondary" type="button" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>

        {form.image_url && (
          <div className="menu-image-preview">
            <img src={form.image_url} alt="Vista previa" />
          </div>
        )}

        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </form>

      {editingId && (
        <div className="menu-list">
          <h4>Extras del producto</h4>
          <p className="muted">
            Producto: <strong>{activeProduct?.name || `#${editingId}`}</strong>
          </p>
          <div className="form-grid">
            <label className="field">
              Nombre extra
              <input
                value={extraForm.name}
                onChange={(event) => setExtraForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Doble queso"
              />
            </label>
            <label className="field">
              Precio extra
              <input
                type="number"
                min="0"
                step="10"
                value={extraForm.extra_price}
                onChange={(event) => setExtraForm((prev) => ({ ...prev, extra_price: event.target.value }))}
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn-primary" type="button" onClick={createExtraOption} disabled={saving || loading}>
              Agregar extra
            </button>
          </div>
          <div className="menu-products">
            {(activeProduct?.extra_options || []).map((extra) => (
              <article key={extra.id} className="menu-product">
                <div className="menu-product-meta">
                  <strong>{extra.name}</strong>
                  <span>+$ {extra.extra_price}</span>
                  <span className="muted">{extra.active ? "Activo" : "Inactivo"}</span>
                </div>
                <div className="menu-product-actions">
                  <button className="btn-secondary small" onClick={() => toggleExtraOption(extra)}>
                    {extra.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </article>
            ))}
            {!activeProduct?.extra_options?.length && <p className="muted">Este producto no tiene extras.</p>}
          </div>
        </div>
      )}

      <div className="menu-list">
        <h4>Productos ({products.length})</h4>
        {loading ? (
          <p className="muted">Cargando...</p>
        ) : (
          <div className="menu-products">
            {products.map((product) => (
              <article key={product.id} className="menu-product">
                <div className="menu-product-meta">
                  <strong>{product.name}</strong>
                  <span className="muted">{product.fulfillment_sector}</span>
                  <span>{product.description}</span>
                  <span>$ {product.base_price}</span>
                  <span className="muted">
                    Extras: {(product.extra_options || []).filter((extra) => extra.active).length} activos /{" "}
                    {(product.extra_options || []).length} total
                  </span>
                </div>
                <div className="menu-product-actions">
                  <button className="btn-secondary small" onClick={() => handleEdit(product)}>
                    Editar
                  </button>
                  <button className="btn-secondary small" onClick={() => toggleActive(product)}>
                    {product.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </article>
            ))}
            {!products.length && <p className="muted">No hay productos cargados.</p>}
          </div>
        )}
      </div>

      <div className="menu-help">
        <p className="muted">
          {imageUploading ? "Subiendo imagen..." : "Arrastrá un archivo o pegá la URL pública de Cloudflare."}
        </p>
        <p className="muted">
          Si querés borrar la imagen existente, dejá el campo vacío y actualizá el producto.
        </p>
      </div>
    </section>
  );
}
