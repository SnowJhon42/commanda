PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- 1 tenant + 1 store
INSERT INTO tenants (id, name) VALUES (1, 'Comanda Demo')
ON CONFLICT(id) DO NOTHING;

INSERT INTO stores (id, tenant_id, name) VALUES (1, 1, 'Local Centro')
ON CONFLICT(id) DO NOTHING;

-- Tables M1..M20
INSERT INTO tables (store_id, code, active)
VALUES
  (1, 'M1', 1), (1, 'M2', 1), (1, 'M3', 1), (1, 'M4', 1), (1, 'M5', 1),
  (1, 'M6', 1), (1, 'M7', 1), (1, 'M8', 1), (1, 'M9', 1), (1, 'M10', 1),
  (1, 'M11', 1), (1, 'M12', 1), (1, 'M13', 1), (1, 'M14', 1), (1, 'M15', 1),
  (1, 'M16', 1), (1, 'M17', 1), (1, 'M18', 1), (1, 'M19', 1), (1, 'M20', 1)
ON CONFLICT(store_id, code) DO NOTHING;

-- Staff users by sector
-- pin_hash is placeholder. Backend will replace with real hash (bcrypt/argon2).
INSERT INTO staff_accounts (store_id, sector, username, pin_hash, active)
VALUES
  (1, 'ADMIN', 'admin', 'CHANGE_ME_HASH_1234', 1),
  (1, 'KITCHEN', 'kitchen', 'CHANGE_ME_HASH_1234', 1),
  (1, 'BAR', 'bar', 'CHANGE_ME_HASH_1234', 1),
  (1, 'WAITER', 'waiter', 'CHANGE_ME_HASH_1234', 1)
ON CONFLICT(store_id, username) DO NOTHING;

-- Menu categories (aligned to mockups)
INSERT INTO menu_categories (store_id, name, image_url, sort_order, active)
VALUES
  (1, 'Entradas', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80', 1, 1),
  (1, 'Principal', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', 2, 1),
  (1, 'Postres', 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80', 3, 1),
  (1, 'Cervezas', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80', 4, 1),
  (1, 'Tragos', 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=80', 5, 1),
  (1, 'Vinos', 'https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?auto=format&fit=crop&w=900&q=80', 6, 1),
  (1, 'Sin alcohol', 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80', 7, 1),
  (1, 'Sin gluten', 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=900&q=80', 8, 1),
  (1, 'Vegetarianos', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80', 9, 1)
ON CONFLICT(store_id, name) DO NOTHING;

UPDATE menu_categories
SET image_url = CASE name
  WHEN 'Entradas' THEN 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80'
  WHEN 'Principal' THEN 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80'
  WHEN 'Postres' THEN 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80'
  WHEN 'Cervezas' THEN 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80'
  WHEN 'Tragos' THEN 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=80'
  WHEN 'Vinos' THEN 'https://images.unsplash.com/photo-1516594915697-87eb3b1c14ea?auto=format&fit=crop&w=900&q=80'
  WHEN 'Sin alcohol' THEN 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80'
  WHEN 'Sin gluten' THEN 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=900&q=80'
  WHEN 'Vegetarianos' THEN 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80'
  ELSE image_url
END
WHERE store_id = 1;

-- Kitchen items
INSERT INTO products (store_id, category_id, name, image_url, description, base_price, fulfillment_sector, active)
SELECT 1, id, 'Hamburguesa Clasica', 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80', 'Carne, queso, lechuga y tomate', 12000, 'KITCHEN', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Principal'
UNION ALL
SELECT 1, id, 'Milanesa con Papas', 'https://images.unsplash.com/photo-1532635241-17e820acc59f?auto=format&fit=crop&w=900&q=80', 'Milanesa vacuna con papas fritas', 14000, 'KITCHEN', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Principal'
UNION ALL
SELECT 1, id, 'Pizza Muzzarella', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80', 'Pizza individual', 11000, 'KITCHEN', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Principal';

-- Bar items
INSERT INTO products (store_id, category_id, name, image_url, description, base_price, fulfillment_sector, active)
SELECT 1, id, 'Gin Tonic', 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=900&q=80', 'Gin con tonica', 9000, 'BAR', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Tragos'
UNION ALL
SELECT 1, id, 'Fernet con Cola', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=80', 'Vaso largo', 8000, 'BAR', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Tragos'
UNION ALL
SELECT 1, id, 'Mojito', 'https://images.unsplash.com/photo-1551024709-8f23befc6cf7?auto=format&fit=crop&w=900&q=80', 'Ron, lima, menta y soda', 9500, 'BAR', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Tragos';

-- Waiter direct delivery items
INSERT INTO products (store_id, category_id, name, image_url, description, base_price, fulfillment_sector, active)
SELECT 1, id, 'Agua sin Gas', 'https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=900&q=80', 'Botella 500ml', 3000, 'WAITER', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Sin alcohol'
UNION ALL
SELECT 1, id, 'Agua con Gas', 'https://images.unsplash.com/photo-1564419315943-9c2e0f0df77d?auto=format&fit=crop&w=900&q=80', 'Botella 500ml', 3000, 'WAITER', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Sin alcohol'
UNION ALL
SELECT 1, id, 'Gaseosa Cola', 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=900&q=80', 'Lata 354ml', 3500, 'WAITER', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Sin alcohol';

UPDATE products
SET image_url = CASE name
  WHEN 'Hamburguesa Clasica' THEN 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80'
  WHEN 'Milanesa con Papas' THEN 'https://images.unsplash.com/photo-1532635241-17e820acc59f?auto=format&fit=crop&w=900&q=80'
  WHEN 'Pizza Muzzarella' THEN 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80'
  WHEN 'Gin Tonic' THEN 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=900&q=80'
  WHEN 'Fernet con Cola' THEN 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=80'
  WHEN 'Mojito' THEN 'https://images.unsplash.com/photo-1551024709-8f23befc6cf7?auto=format&fit=crop&w=900&q=80'
  WHEN 'Agua sin Gas' THEN 'https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=900&q=80'
  WHEN 'Agua con Gas' THEN 'https://images.unsplash.com/photo-1564419315943-9c2e0f0df77d?auto=format&fit=crop&w=900&q=80'
  WHEN 'Gaseosa Cola' THEN 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=900&q=80'
  ELSE image_url
END
WHERE store_id = 1;

-- Sample variants
INSERT INTO product_variants (product_id, name, extra_price, active)
SELECT id, 'Sin cebolla', 0, 1 FROM products WHERE name = 'Hamburguesa Clasica'
UNION ALL
SELECT id, 'Doble carne', 2500, 1 FROM products WHERE name = 'Hamburguesa Clasica'
UNION ALL
SELECT id, 'Extra limon', 500, 1 FROM products WHERE name = 'Gin Tonic'
UNION ALL
SELECT id, 'Sin hielo', 0, 1 FROM products WHERE name = 'Fernet con Cola';

COMMIT;
