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
INSERT INTO menu_categories (store_id, name, sort_order, active)
VALUES
  (1, 'Entradas', 1, 1),
  (1, 'Principal', 2, 1),
  (1, 'Postres', 3, 1),
  (1, 'Cervezas', 4, 1),
  (1, 'Tragos', 5, 1),
  (1, 'Vinos', 6, 1),
  (1, 'Sin alcohol', 7, 1),
  (1, 'Sin gluten', 8, 1),
  (1, 'Vegetarianos', 9, 1)
ON CONFLICT(store_id, name) DO NOTHING;

-- Kitchen items
INSERT INTO products (store_id, category_id, name, description, base_price, fulfillment_sector, active)
SELECT 1, id, 'Hamburguesa Clasica', 'Carne, queso, lechuga y tomate', 12000, 'KITCHEN', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Principal'
UNION ALL
SELECT 1, id, 'Milanesa con Papas', 'Milanesa vacuna con papas fritas', 14000, 'KITCHEN', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Principal'
UNION ALL
SELECT 1, id, 'Pizza Muzzarella', 'Pizza individual', 11000, 'KITCHEN', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Principal';

-- Bar items
INSERT INTO products (store_id, category_id, name, description, base_price, fulfillment_sector, active)
SELECT 1, id, 'Gin Tonic', 'Gin con tonica', 9000, 'BAR', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Tragos'
UNION ALL
SELECT 1, id, 'Fernet con Cola', 'Vaso largo', 8000, 'BAR', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Tragos'
UNION ALL
SELECT 1, id, 'Mojito', 'Ron, lima, menta y soda', 9500, 'BAR', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Tragos';

-- Waiter direct delivery items
INSERT INTO products (store_id, category_id, name, description, base_price, fulfillment_sector, active)
SELECT 1, id, 'Agua sin Gas', 'Botella 500ml', 3000, 'WAITER', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Sin alcohol'
UNION ALL
SELECT 1, id, 'Agua con Gas', 'Botella 500ml', 3000, 'WAITER', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Sin alcohol'
UNION ALL
SELECT 1, id, 'Gaseosa Cola', 'Lata 354ml', 3500, 'WAITER', 1
FROM menu_categories
WHERE store_id = 1 AND name = 'Sin alcohol';

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
