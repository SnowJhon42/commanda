import { useEffect, useMemo, useState } from "react";

function toMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function MenuPage({
  menu,
  loading,
  error,
  onRetry,
  onAddToCart,
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
  }, [resetToCategoriesSignal]);

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
                const qty = qtyByProduct[product.id] ?? 0;
                const inCartQty = productQtyInCart[product.id] || 0;
                const buttonQtyLabel = inCartQty > 0 ? String(inCartQty) : qty > 0 ? String(qty) : "Agregar";
                const selectedVariantId = variantByProduct[product.id] ?? "";
                const comment = commentByProduct[product.id] ?? "";
                const selectedExtraIds = extraOptionsByProduct[product.id] || [];
                const toggleExtra = (extraId) =>
                  setExtraOptionsByProduct((current) => {
                    const currentIds = current[product.id] || [];
                    const exists = currentIds.includes(extraId);
                    return {
                      ...current,
                      [product.id]: exists
                        ? currentIds.filter((id) => id !== extraId)
                        : [...currentIds, extraId],
                    };
                  });
                const decreaseQty = () => onDecrementProductInCart?.(product.id);
                const increaseQty = () =>
                  addProduct(product, 1);
                return (
                  <article className="menu-product-row" key={product.id}>
                    <div className="menu-product-head">
                      <button
                        type="button"
                        className="menu-line-name-btn"
                        onClick={() => setPreviewProduct(product)}
                      >
                        {product.name}
                      </button>
                      <div className="menu-product-head-right">
                        <p className="menu-line-price">{toMoney(product.base_price)}</p>
                      </div>
                    </div>
                    <div className="menu-product-controls">
                      <button type="button" className="btn-secondary qty-btn" onClick={decreaseQty}>
                        -
                      </button>
                      <button
                        type="button"
                        className={inCartQty > 0 || qty > 0 ? "menu-qty-pill menu-qty-pill-active" : "menu-qty-pill"}
                        onClick={() => addProduct(product)}
                      >
                        {buttonQtyLabel}
                      </button>
                      <button type="button" className="btn-secondary qty-btn" onClick={increaseQty}>
                        +
                      </button>
                    </div>
                    {qty > 0 && (
                      <div className="menu-notes-wrap">
                        <label className="field">
                          Comentario
                          <input
                            type="text"
                            maxLength="120"
                            value={comment}
                            onChange={(e) =>
                              setCommentByProduct((current) => ({
                                ...current,
                                [product.id]: e.target.value,
                              }))
                            }
                            placeholder="Ej: sin cebolla"
                          />
                        </label>
                        {product.extra_options?.length > 0 && (
                          <div className="field">
                            Extra
                            <div className="menu-extra-options">
                              {product.extra_options.map((extra) => (
                                <button
                                  key={extra.id}
                                  type="button"
                                  className={
                                    selectedExtraIds.includes(extra.id)
                                      ? "menu-extra-chip menu-extra-chip-active"
                                      : "menu-extra-chip"
                                  }
                                  onClick={() => toggleExtra(extra.id)}
                                >
                                  {extra.name}
                                  {Number(extra.extra_price || 0) > 0
                                    ? ` (+${toMoney(Number(extra.extra_price))})`
                                    : ""}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {product.variants.length > 0 && (
                      <label className="field menu-variant-field">
                        Extra
                        <select
                          value={selectedVariantId}
                          onChange={(e) =>
                            setVariantByProduct((current) => ({ ...current, [product.id]: e.target.value }))
                          }
                        >
                          <option value="">Sin extra</option>
                          {product.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.name} ({toMoney(variant.extra_price)})
                            </option>
                          ))}
                        </select>
                      </label>
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
    </section>
  );
}
