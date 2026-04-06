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

function productPayloadFromForm(form) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    base_price: Number(form.base_price || 0),
    fulfillment_sector: form.fulfillment_sector,
    category_id: form.category_id ? Number(form.category_id) : null,
    image_url: form.image_url ? form.image_url : null,
    active: Boolean(form.active),
  };
}

function formFromProduct(product) {
  return {
    name: product.name,
    description: product.description || "",
    base_price: String(product.base_price),
    fulfillment_sector: product.fulfillment_sector,
    category_id: product.category_id || "",
    image_url: product.image_url || "",
    active: product.active,
  };
}

export function MenuEditorPage({ token, storeId }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
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
    setEditorOpen(false);
    setMessage("");
    setError("");
  }, []);

  const startCreate = useCallback(() => {
    setForm(DEFAULT_FORM);
    setExtraForm({ name: "", extra_price: "0" });
    setEditingId(null);
    setEditorOpen(true);
    setMessage("");
    setError("");
  }, []);

  const handleEdit = useCallback((product) => {
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
    setEditorOpen(true);
    setMessage("");
    setError("");
  }, []);

  const activeProduct = useMemo(
    () => products.find((product) => product.id === editingId) || null,
    [products, editingId]
  );

  const activeCategory = useMemo(
    () => categories.find((category) => String(category.id) === String(form.category_id)) || null,
    [categories, form.category_id]
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
      const payload = productPayloadFromForm(form);
      setSaving(true);
      try {
        if (editingId) {
          await patchAdminProduct({ token, productId: editingId, payload });
          await loadData();
          setForm(DEFAULT_FORM);
          setExtraForm({ name: "", extra_price: "0" });
          setEditingId(null);
          setEditorOpen(false);
          setMessage("Producto actualizado.");
        } else {
          const created = await createAdminProduct({ token, payload });
          setMessage("Producto creado. Ya podés agregar extras.");
          await loadData();
          setEditingId(created.id);
          setEditorOpen(true);
          setForm(formFromProduct(created));
          setExtraForm({ name: "", extra_price: "0" });
        }
      } catch (err) {
        setError(err.message || "No se pudo guardar el producto.");
      } finally {
        setSaving(false);
      }
    },
    [editingId, form, loadData, token]
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
    const name = extraForm.name.trim();
    if (!name) {
      setError("El nombre del extra es obligatorio.");
      return;
    }
    if (!editingId && !form.name.trim()) {
      setError("Primero completá el nombre del producto para poder agregar extras.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let productId = editingId;
      if (!productId) {
        const created = await createAdminProduct({ token, payload: productPayloadFromForm(form) });
        productId = created.id;
        setEditingId(created.id);
        setEditorOpen(true);
        setForm(formFromProduct(created));
      }
      await createAdminProductExtraOption({
        token,
        productId,
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
  }, [editingId, extraForm, form, loadData, token]);

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

  const draftCount = products.filter((product) => !product.image_url || !product.base_price).length;

  return (
    <section className="ops-panel menu-admin-shell">
      <div className="menu-admin-hero">
        <div>
          <p className="kicker menu-admin-kicker">Carga manual o importación asistida</p>
          <h3>Editar menú</h3>
          <p className="muted">
            Organizá productos, categorías, imágenes y futuras importaciones desde una sola base.
          </p>
        </div>
        <div className="menu-admin-hero-actions">
          <button className="btn-primary" type="button" onClick={startCreate}>
            Nuevo producto
          </button>
          {editorOpen && (
            <button className="btn-secondary" type="button" onClick={resetForm}>
              Cerrar editor
            </button>
          )}
        </div>
      </div>

      <div className="menu-admin-entry-grid">
        <article className="menu-entry-card menu-entry-card-primary">
          <span className="menu-entry-badge menu-entry-badge-success">Base estable</span>
          <h4>Carga manual</h4>
          <p>Creá categorías y productos con precio, descripción, imagen y extras.</p>
          <button className="btn-primary" type="button" onClick={startCreate}>
            Crear producto
          </button>
        </article>
        <article className="menu-entry-card menu-entry-card-warm">
          <span className="menu-entry-badge menu-entry-badge-warm">IA + revisión humana</span>
          <h4>Importar fotos</h4>
          <p>Subí fotos de la carta y generá un borrador editable antes de publicar.</p>
          <button className="btn-secondary" type="button" disabled>
            Próximamente
          </button>
        </article>
        <article className="menu-entry-card menu-entry-card-cool">
          <span className="menu-entry-badge menu-entry-badge-info">Carga masiva</span>
          <h4>Importar Excel</h4>
          <p>Importá categorías, productos y precios desde un archivo de trabajo.</p>
          <button className="btn-secondary" type="button" disabled>
            Próximamente
          </button>
        </article>
      </div>

      <div className="menu-admin-overview menu-admin-overview-wide">
        <div className="menu-overview-stat">
          <span>Categorías</span>
          <strong>{categories.length}</strong>
        </div>
        <div className="menu-overview-stat">
          <span>Productos</span>
          <strong>{products.length}</strong>
        </div>
        <div className="menu-overview-stat">
          <span>Con foto</span>
          <strong>{products.filter((product) => Boolean(product.image_url)).length}</strong>
        </div>
        <div className="menu-overview-stat menu-overview-stat-highlight">
          <span>Revisión pendiente</span>
          <strong>{draftCount}</strong>
        </div>
      </div>

      {editorOpen ? (
        <div className="menu-admin-layout">
          <form className="menu-admin-editor" onSubmit={handleSubmit}>
            <div className="menu-editor-card menu-editor-card-accent">
              <div className="section-head">
                <div>
                  <h4>{editingId ? "Editar producto" : "Nuevo producto"}</h4>
                  <p className="muted">
                    {editingId ? `Admin ${storeId} · editando producto` : `Admin ${storeId} · cargando producto nuevo`}
                  </p>
                </div>
                <span className={form.active ? "live-pill live-pill-on" : "live-pill"}>
                  {form.active ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>

            <div className="menu-editor-card">
              <div className="section-head">
                <div>
                  <h4>Información principal</h4>
                  <p className="muted">Datos base visibles para staff y cliente.</p>
                </div>
              </div>

              <div className="form-grid">
                <label className="field">
                  Nombre
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Milanesa con papas"
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
                <label className="field field-span-2">
                  Descripción
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Milanesa vacuna con papas fritas"
                  />
                </label>
                <label className="field">
                  Sector
                  <select
                    value={form.fulfillment_sector}
                    onChange={(event) => setForm((prev) => ({ ...prev, fulfillment_sector: event.target.value }))}
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
                <label className="field field-inline-check">
                  <span>Visible para cliente</span>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                  />
                </label>
              </div>
            </div>

            <div className="menu-editor-card">
              <div className="section-head">
                <div>
                  <h4>Extras del producto</h4>
                  <p className="muted">Agregados, variantes y precios extra.</p>
                </div>
              </div>

              <p className="muted">
                {editingId ? (
                  <>
                    Producto: <strong>{activeProduct?.name || `#${editingId}`}</strong>
                  </>
                ) : (
                  "Si el producto es nuevo, al agregar el primer extra lo guardamos automáticamente."
                )}
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
                  {saving ? "Agregando..." : "Agregar extra"}
                </button>
              </div>
              {editingId && (
                <div className="menu-products">
                  {(activeProduct?.extra_options || []).map((extra) => (
                    <article key={extra.id} className="menu-product">
                      <div className="menu-product-meta">
                        <strong>{extra.name}</strong>
                        <span>+$ {extra.extra_price}</span>
                        <span className="muted">{extra.active ? "Activo" : "Inactivo"}</span>
                      </div>
                      <div className="menu-product-actions">
                        <button className="btn-secondary small" type="button" onClick={() => toggleExtraOption(extra)}>
                          {extra.active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </article>
                  ))}
                  {!activeProduct?.extra_options?.length && <p className="muted">Este producto no tiene extras.</p>}
                </div>
              )}
            </div>

            <div className="form-actions">
              <button className="btn-primary" type="submit" disabled={saving || imageUploading || loading}>
                {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear producto"}
              </button>
              <button className="btn-secondary" type="button" onClick={resetForm}>
                Cancelar
              </button>
            </div>

            {message && <p className="success-text">{message}</p>}
            {error && <p className="error-text">{error}</p>}
          </form>

          <aside className="menu-admin-side">
            <div className="menu-editor-card">
              <div className="section-head">
                <div>
                  <h4>Imagen del producto</h4>
                  <p className="muted">Subí archivo o pegá URL pública.</p>
                </div>
              </div>

              <div className="menu-image-preview menu-image-preview-large">
                {form.image_url ? <img src={form.image_url} alt="Vista previa" /> : <div className="menu-image-empty">Sin imagen</div>}
              </div>

              <label className="field">
                URL de imagen
                <input
                  type="text"
                  value={form.image_url}
                  onChange={(event) => setForm((prev) => ({ ...prev, image_url: event.target.value }))}
                  placeholder="https://.../producto.jpg"
                />
              </label>

              <div className="menu-side-actions">
                <label className="btn-primary menu-upload-btn">
                  {imageUploading ? "Subiendo..." : "Subir imagen"}
                  <input type="file" accept="image/*" onChange={handleFileChange} hidden />
                </label>
                <button className="btn-secondary" type="button" onClick={() => setForm((prev) => ({ ...prev, image_url: "" }))}>
                  Quitar
                </button>
              </div>

              <div className="menu-image-status">
                <strong>{form.image_url ? "Imagen OK" : "Sin foto"}</strong>
                <span>{imageUploading ? "Subiendo imagen..." : "Podés reemplazarla cuando quieras."}</span>
              </div>
            </div>

            <div className="menu-editor-card">
              <div className="section-head">
                <div>
                  <h4>Resumen actual</h4>
                  <p className="muted">Estado rápido del producto en edición.</p>
                </div>
              </div>
              <div className="menu-summary-list">
                <div>
                  <span>Nombre</span>
                  <strong>{form.name || "Sin nombre"}</strong>
                </div>
                <div>
                  <span>Categoría</span>
                  <strong>{activeCategory?.name || "Sin categoría"}</strong>
                </div>
                <div>
                  <span>Precio</span>
                  <strong>{form.base_price ? `$ ${form.base_price}` : "Sin precio"}</strong>
                </div>
                <div>
                  <span>Imagen</span>
                  <strong>{form.image_url ? "Cargada" : "Pendiente"}</strong>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="menu-editor-empty-state">
          <div className="menu-editor-card menu-editor-card-empty">
            <h4>Elegí cómo querés trabajar tu menú</h4>
            <p className="muted">
              Empezá creando un producto manualmente o preparate para importar carta por fotos o Excel.
            </p>
            <div className="menu-empty-actions">
              <button className="btn-primary" type="button" onClick={startCreate}>
                Crear producto
              </button>
              <button className="btn-secondary" type="button" disabled>
                Revisar borrador
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="menu-editor-card">
        <div className="section-head">
          <div>
            <h4>Menú actual</h4>
            <p className="muted">Edición rápida por producto y activación/desactivación.</p>
          </div>
          <span className="menu-products-count">{products.length} productos</span>
        </div>
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
                    Extras: {(product.extra_options || []).filter((extra) => extra.active).length} activos / {(product.extra_options || []).length} total
                  </span>
                </div>
                <div className="menu-product-actions">
                  <button className="btn-secondary small" type="button" onClick={() => handleEdit(product)}>
                    Editar
                  </button>
                  <button className="btn-secondary small" type="button" onClick={() => toggleActive(product)}>
                    {product.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </article>
            ))}
            {!products.length && <p className="muted">No hay productos cargados.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

export default MenuEditorPage;
