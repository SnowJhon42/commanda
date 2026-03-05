import { useEffect, useMemo, useRef, useState } from "react";

function toMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function sectorPillClass(sector) {
  if (sector === "KITCHEN") return "sector-pill sector-pill-kitchen";
  if (sector === "BAR") return "sector-pill sector-pill-bar";
  if (sector === "WAITER") return "sector-pill sector-pill-waiter";
  return "sector-pill";
}

export function MenuPage({ menu, loading, error, onRetry, onAddToCart, productQtyInCart = {} }) {
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [qtyByProduct, setQtyByProduct] = useState({});
  const [variantByProduct, setVariantByProduct] = useState({});
  const [pulseByProduct, setPulseByProduct] = useState({});
  const previousQtyRef = useRef({});

  const categories = menu?.categories ?? [];
  const products = menu?.products ?? [];

  const resolvedCategoryId =
    activeCategoryId ?? (categories.length > 0 ? categories[0].id : null);

  const filteredProducts = useMemo(
    () => products.filter((product) => product.category_id === resolvedCategoryId),
    [products, resolvedCategoryId]
  );

  const addProduct = (product) => {
    const selectedVariantId = variantByProduct[product.id];
    const selectedVariant = product.variants.find((variant) => variant.id === Number(selectedVariantId));
    const qty = Number(qtyByProduct[product.id] ?? 1);
    onAddToCart({ product, variant: selectedVariant, qty });
    setQtyByProduct((current) => ({ ...current, [product.id]: 1 }));
  };

  useEffect(() => {
    const prev = previousQtyRef.current;
    const changedProductIds = Object.keys(productQtyInCart).filter(
      (id) => (prev[id] || 0) !== (productQtyInCart[id] || 0)
    );
    if (changedProductIds.length > 0) {
      setPulseByProduct((current) => {
        const next = { ...current };
        changedProductIds.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
      const timer = setTimeout(() => {
        setPulseByProduct((current) => {
          const next = { ...current };
          changedProductIds.forEach((id) => {
            next[id] = false;
          });
          return next;
        });
      }, 300);
      previousQtyRef.current = { ...productQtyInCart };
      return () => clearTimeout(timer);
    }
    previousQtyRef.current = { ...productQtyInCart };
  }, [productQtyInCart]);

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

      <div className="category-tabs">
        {categories.map((category) => (
          <button
            key={category.id}
            className={category.id === resolvedCategoryId ? "tab tab-active" : "tab"}
            onClick={() => setActiveCategoryId(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      {filteredProducts.length === 0 ? (
        <p className="muted">No hay productos en esta categoria. Proba otra.</p>
      ) : (
        <div className="product-grid">
          {filteredProducts.map((product) => {
            const selectedVariantId = variantByProduct[product.id] ?? "";
            const qty = qtyByProduct[product.id] ?? 1;
            const inCartQty = productQtyInCart[product.id] || 0;
            const isSelected = inCartQty > 0;
            const pulse = pulseByProduct[String(product.id)];
            return (
              <article
                className={isSelected ? "product-card product-card-selected" : "product-card"}
                key={product.id}
              >
                {product.image_url ? (
                  <img className="product-image" src={product.image_url} alt={product.name} loading="lazy" />
                ) : (
                  <div className="image-fallback product-image-fallback">Sin imagen</div>
                )}
                <div className="product-title-row">
                  <h3>{product.name}</h3>
                  <div className="product-badges">
                    {isSelected && (
                      <span className={pulse ? "product-count-badge product-count-pulse" : "product-count-badge"}>
                        x{inCartQty}
                      </span>
                    )}
                    <span className={sectorPillClass(product.fulfillment_sector)}>{product.fulfillment_sector}</span>
                  </div>
                </div>
                <p className="muted">{product.description || "Sin descripcion"}</p>
                <p className="price">{toMoney(product.base_price)}</p>

                {product.variants.length > 0 && (
                  <label className="field">
                    Variante
                    <select
                      value={selectedVariantId}
                      onChange={(e) =>
                        setVariantByProduct((current) => ({ ...current, [product.id]: e.target.value }))
                      }
                    >
                      <option value="">Sin variante</option>
                      {product.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.name} ({toMoney(variant.extra_price)})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="row">
                  <label className="field qty-field">
                    Cantidad
                    <input
                      type="number"
                      min="1"
                      value={qty}
                      onChange={(e) =>
                        setQtyByProduct((current) => ({ ...current, [product.id]: Number(e.target.value) || 1 }))
                      }
                    />
                  </label>
                  <button className="btn-primary" onClick={() => addProduct(product)}>
                    Agregar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
