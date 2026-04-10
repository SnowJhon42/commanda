import { useEffect, useMemo, useState } from "react";

function toMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function preparationNoteLabel(sector) {
  if (sector === "BAR") return "Aclaracion para barra";
  if (sector === "WAITER") return "Aclaracion para mozo";
  if (sector === "KITCHEN") return "Aclaracion para cocina";
  return "Aclaracion del pedido";
}

export function MenuPage({
  menu,
  loading,
  error,
  onRetry,
  onAddToCart,
  onSyncDraftConfig = () => {},
  onDecrementProductInCart,
  productQtyInCart = {},
  resetToCategoriesSignal = 0,
}) {
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [qtyByProduct, setQtyByProduct] = useState({});
  const [variantByProduct, setVariantByProduct] = useState({});
  const [commentByProduct, setCommentByProduct] = useState({});
  const [extraOptionsByProduct, setExtraOptionsByProduct] = useState({});
  const [previewProduct, setPreviewProduct] = useState(null);
  const [commentModalProduct, setCommentModalProduct] = useState(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [configModalProduct, setConfigModalProduct] = useState(null);

  const categories = menu?.categories ?? [];
  const products = menu?.products ?? [];

  const activeCategory = categories.find((category) => category.id === activeCategoryId) || null;
  const filteredProducts = useMemo(
    () => products.filter((product) => product.category_id === activeCategoryId),
    [products, activeCategoryId]
  );

  const categoryImageMap = useMemo(() => {
    const map = {};
    categories.forEach((category) => {
      if (category.image_url) {
        map[category.id] = category.image_url;
        return;
      }
      const fromProducts = products.find(
        (product) => product.category_id === category.id && product.image_url
      );
      map[category.id] = fromProducts?.image_url || "";
    });
    return map;
  }, [categories, products]);

  useEffect(() => {
    setActiveCategoryId(null);
    setPreviewProduct(null);
    setCommentModalProduct(null);
    setConfigModalProduct(null);
  }, [resetToCategoriesSignal]);

  const buildDraftConfig = (product, overrides = {}) => {
    const selectedVariantId =
      overrides.variantId !== undefined ? overrides.variantId : variantByProduct[product.id];
    const selectedVariant = product.variants.find((variant) => variant.id === Number(selectedVariantId));
    const selectedExtraIds =
      overrides.extraOptionIds !== undefined ? overrides.extraOptionIds : extraOptionsByProduct[product.id] || [];
    const selectedExtras = (product.extra_options || []).filter((extra) => selectedExtraIds.includes(extra.id));
    const comment =
      overrides.comment !== undefined ? String(overrides.comment || "").trim() : String(commentByProduct[product.id] || "").trim();
    return {
      product,
      variant: selectedVariant,
      notes: comment || undefined,
      extraOptionIds: selectedExtras.map((extra) => extra.id),
      extraOptionLabels: selectedExtras.map((extra) => extra.name),
    };
  };

  const addProduct = (product, forcedQty = null) => {
    const selectedVariantId = variantByProduct[product.id];
    const selectedVariant = product.variants.find((variant) => variant.id === Number(selectedVariantId));
    const requestedQty = Number(qtyByProduct[product.id] ?? 0);
    const qty = forcedQty ? Number(forcedQty) : requestedQty > 0 ? requestedQty : 1;
    const comment = String(commentByProduct[product.id] || "").trim();
    const selectedExtraIds = extraOptionsByProduct[product.id] || [];
    const selectedExtras = (product.extra_options || []).filter((extra) => selectedExtraIds.includes(extra.id));
    onAddToCart({
      product,
      variant: selectedVariant,
      qty: Math.max(1, qty || 1),
      notes: comment || undefined,
      extraOptionIds: selectedExtras.map((extra) => extra.id),
      extraOptionLabels: selectedExtras.map((extra) => extra.name),
    });
    if (!forcedQty) {
      setQtyByProduct((current) => ({ ...current, [product.id]: qty }));
    }
  };

  const productHasConfig = (product) => product.variants.length > 0 || (product.extra_options?.length || 0) > 0;

  const openCommentModal = (product) => {
    setCommentModalProduct(product);
    setCommentDraft(commentByProduct[product.id] ?? "");
  };

  const saveCommentDraft = () => {
    if (!commentModalProduct) return;
    const nextComment = commentDraft;
    setCommentByProduct((current) => ({
      ...current,
      [commentModalProduct.id]: nextComment,
    }));
    onSyncDraftConfig(buildDraftConfig(commentModalProduct, { comment: nextComment }));
    setCommentModalProduct(null);
    setCommentDraft("");
  };

  const handlePrimaryAdd = (product) => {
    if (productHasConfig(product)) {
      setConfigModalProduct(product);
      return;
    }
    addProduct(product, 1);
  };

  if (loading) {
    return (
      <section className="panel">
        <h2>Menu</h2>
        <div className="skeleton-list">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h2>Menu</h2>
        <p className="error-text">{error}</p>
        <button className="btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>Menu</h2>
        <span className="muted">{products.length} productos</span>
      </div>

      {!activeCategory ? (
        <>
          <p className="muted">Elegi una categoria para ver la carta.</p>
          <div className="category-grid">
            {categories.map((category) => (
              <button
                key={category.id}
                className="category-card"
                onClick={() => setActiveCategoryId(category.id)}
              >
                {categoryImageMap[category.id] ? (
                  <img
                    className="category-image"
                    src={categoryImageMap[category.id]}
                    alt={category.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="image-fallback category-image">Sin imagen</div>
                )}
                <span className="category-name">{category.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="menu-category-head">
            <button className="btn-secondary" onClick={() => setActiveCategoryId(null)}>
              Volver a categorias
            </button>
            <h3>{activeCategory.name}</h3>
          </div>

          <div className="category-tabs">
            {categories.map((category) => (
              <button
                key={category.id}
                className={category.id === activeCategoryId ? "tab tab-active" : "tab"}
                onClick={() => setActiveCategoryId(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>

          {filteredProducts.length === 0 ? (
            <p className="muted">No hay productos en esta categoria. Proba otra.</p>
          ) : (
            <div className="menu-lines">
              {filteredProducts.map((product) => {
                const inCartQty = productQtyInCart[product.id] || 0;
                const hasImage = Boolean(product.image_url);
                return (
                  <article
                    className={hasImage ? "menu-product-row" : "menu-product-row menu-product-row-no-image"}
                    key={product.id}
                  >
                    <div
                      className={
                        hasImage
                          ? "menu-product-card-shell"
                          : "menu-product-card-shell menu-product-card-shell-no-image"
                      }
                    >
                      <div className="menu-product-copy">
                        <div className="menu-product-head">
                          <button
                            type="button"
                            className="menu-line-name-btn"
                            onClick={() => setPreviewProduct(product)}
                          >
                            {product.name}
                          </button>
                          {hasImage ? (
                            <div className="menu-product-head-right">
                              <p className="menu-line-price">{toMoney(product.base_price)}</p>
                            </div>
                          ) : null}
                        </div>
                        <p className="menu-product-description">
                          {product.description || "Producto disponible para agregar al pedido."}
                        </p>
                        {commentByProduct[product.id]?.trim() ? (
                          <p className="menu-product-inline-note">Comentario guardado</p>
                        ) : null}
                      </div>
                      {hasImage ? (
                        <div className="menu-product-media">
                          <button
                            type="button"
                            className="menu-product-media-button"
                            onClick={() => setPreviewProduct(product)}
                            aria-label={`Ver ${product.name}`}
                          >
                            <img
                              className="menu-product-image"
                              src={product.image_url}
                              alt={product.name}
                              loading="lazy"
                            />
                          </button>
                          {inCartQty > 0 ? <span className="menu-product-cart-count">{inCartQty}</span> : null}
                          <button
                            type="button"
                            className="menu-product-overlay-btn menu-product-overlay-btn-comment"
                            onClick={() => openCommentModal(product)}
                            aria-label={`Agregar comentario a ${product.name}`}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="menu-product-overlay-btn menu-product-overlay-btn-add"
                            onClick={() => handlePrimaryAdd(product)}
                            aria-label={`Agregar ${product.name}`}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="menu-product-inline-price-wrap">
                            <p className="menu-product-inline-price">{toMoney(product.base_price)}</p>
                          </div>
                          <div className="menu-product-inline-actions">
                            <button
                              type="button"
                              className="menu-product-inline-icon-btn"
                              onClick={() => openCommentModal(product)}
                              aria-label={`Agregar comentario a ${product.name}`}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="menu-product-inline-icon-btn menu-product-inline-icon-btn-primary"
                              onClick={() => handlePrimaryAdd(product)}
                              aria-label={`Agregar ${product.name}`}
                            >
                              +
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {configModalProduct?.id === product.id && (
                      <div className="menu-inline-config-hint">
                        <span>Este producto necesita configuracion antes de agregarlo.</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {previewProduct && (
        <div className="menu-preview-overlay" onClick={() => setPreviewProduct(null)}>
          <article className="menu-preview-popup" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="menu-preview-close"
              aria-label="Cerrar detalle"
              onClick={() => setPreviewProduct(null)}
            >
              ×
            </button>
            {previewProduct.image_url ? (
              <img
                className="menu-preview-popup-image"
                src={previewProduct.image_url}
                alt={previewProduct.name}
                loading="lazy"
              />
            ) : (
              <div className="menu-preview-popup-empty">Sin imagen</div>
            )}
            <h4>{previewProduct.name}</h4>
            <p className="muted">{previewProduct.description || "Sin descripcion."}</p>
          </article>
        </div>
      )}

      {commentModalProduct && (
        <div className="menu-preview-overlay" onClick={() => setCommentModalProduct(null)}>
          <article className="menu-config-popup" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="menu-preview-close"
              aria-label="Cerrar comentarios"
              onClick={() => setCommentModalProduct(null)}
            >
              ×
            </button>
            <div className="menu-config-head">
              <span className="menu-config-kicker">Comentarios</span>
              <h4>{commentModalProduct.name}</h4>
              <p className="muted">{preparationNoteLabel(commentModalProduct.fulfillment_sector)}</p>
            </div>
            <label className="field">
              Comentario
              <textarea
                className="menu-comment-textarea"
                maxLength="120"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Ej: sin cebolla, con hielo, bien cocida"
              />
            </label>
            <div className="menu-config-actions">
              <button type="button" className="btn-secondary" onClick={() => setCommentModalProduct(null)}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={saveCommentDraft}>
                Guardar
              </button>
            </div>
          </article>
        </div>
      )}

      {configModalProduct && (
        <div className="menu-preview-overlay" onClick={() => setConfigModalProduct(null)}>
          <article className="menu-config-popup" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="menu-preview-close"
              aria-label="Cerrar configuracion"
              onClick={() => setConfigModalProduct(null)}
            >
              ×
            </button>
            <div className="menu-config-head">
              <span className="menu-config-kicker">Personalizar</span>
              <h4>{configModalProduct.name}</h4>
              <p className="muted">{configModalProduct.description || "Elegi como queres pedir este producto."}</p>
            </div>
            {configModalProduct.variants.length > 0 && (
              <label className="field menu-variant-field">
                Opciones
                <select
                  value={variantByProduct[configModalProduct.id] ?? ""}
                  onChange={(e) => {
                    const nextVariantId = e.target.value;
                    setVariantByProduct((current) => ({ ...current, [configModalProduct.id]: nextVariantId }));
                    onSyncDraftConfig(buildDraftConfig(configModalProduct, { variantId: nextVariantId }));
                  }}
                >
                  <option value="">Sin extra</option>
                  {configModalProduct.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name} ({toMoney(variant.extra_price)})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {configModalProduct.extra_options?.length > 0 && (
              <div className="field">
                Agregados
                <div className="menu-extra-options">
                  {configModalProduct.extra_options.map((extra) => {
                    const selectedExtraIds = extraOptionsByProduct[configModalProduct.id] || [];
                    return (
                      <button
                        key={extra.id}
                        type="button"
                        className={
                          selectedExtraIds.includes(extra.id)
                            ? "menu-extra-chip menu-extra-chip-active"
                            : "menu-extra-chip"
                        }
                        onClick={() => {
                          const exists = selectedExtraIds.includes(extra.id);
                          const nextExtraIds = exists
                            ? selectedExtraIds.filter((id) => id !== extra.id)
                            : [...selectedExtraIds, extra.id];
                          setExtraOptionsByProduct((current) => ({
                            ...current,
                            [configModalProduct.id]: nextExtraIds,
                          }));
                          onSyncDraftConfig(buildDraftConfig(configModalProduct, { extraOptionIds: nextExtraIds }));
                        }}
                      >
                        {extra.name}
                        {Number(extra.extra_price || 0) > 0
                          ? ` (+${toMoney(Number(extra.extra_price))})`
                          : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="menu-config-actions">
              <button type="button" className="btn-secondary" onClick={() => setConfigModalProduct(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  addProduct(configModalProduct, 1);
                  setConfigModalProduct(null);
                }}
              >
                Agregar al pedido
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
