BEGIN;

-- Apertura operativa completa: Los Perros
-- Objetivo:
-- - dejar el restaurante listo para operar apenas entra el staff
-- - permitir login del staff
-- - dejar mesas creadas
-- - dejar categorias y productos base
-- - permitir seguir cargando/ajustando menu desde admin
--
-- Credenciales iniciales:
-- - owner password: 1234
-- - PIN staff: 1234
--
-- Usuarios iniciales:
-- - admin_perros
-- - cocina_perros
-- - barra_perros
-- - mozo_perros

WITH ensured_tenant AS (
    INSERT INTO tenants (name, created_at)
    VALUES ('Los Perros', CURRENT_TIMESTAMP)
    ON CONFLICT (name) DO UPDATE
    SET name = EXCLUDED.name
    RETURNING id
),
tenant_row AS (
    SELECT id FROM ensured_tenant
    UNION ALL
    SELECT id FROM tenants WHERE name = 'Los Perros'
    LIMIT 1
),
ensured_store AS (
    INSERT INTO stores (
        tenant_id,
        name,
        show_live_total_to_client,
        print_mode,
        whatsapp_share_template,
        owner_password_hash,
        theme_preset,
        accent_color,
        show_watermark_logo,
        created_at
    )
    SELECT
        tenant_row.id,
        'Los Perros Centro',
        TRUE,
        'MANUAL',
        'Pedi en {restaurant_name} y mirá la carta acá:\n{menu_url}',
        '$pbkdf2-sha256$29000$OgeAcE6JsRbiPGcsJURIaQ$SVrNJX3RpFWhZvJ8kFyMlDDz6BXL/CwFnCRWNNHSdOw',
        'MODERN',
        'ROJO',
        FALSE,
        CURRENT_TIMESTAMP
    FROM tenant_row
    WHERE NOT EXISTS (
        SELECT 1
        FROM stores
        WHERE tenant_id = tenant_row.id
          AND name = 'Los Perros Centro'
    )
    RETURNING id
),
store_row AS (
    SELECT id FROM ensured_store
    UNION ALL
    SELECT s.id
    FROM stores s
    JOIN tenant_row t ON t.id = s.tenant_id
    WHERE s.name = 'Los Perros Centro'
    LIMIT 1
)
INSERT INTO tables (store_id, code, active, created_at)
SELECT store_row.id, code, TRUE, CURRENT_TIMESTAMP
FROM store_row
CROSS JOIN (
    VALUES
        ('M1'), ('M2'), ('M3'), ('M4'), ('M5'),
        ('M6'), ('M7'), ('M8'), ('M9'), ('M10'),
        ('M11'), ('M12'), ('M13'), ('M14'), ('M15'),
        ('M16'), ('M17'), ('M18'), ('M19'), ('M20')
) AS table_codes(code)
ON CONFLICT (store_id, code) DO NOTHING;

WITH tenant_row AS (
    SELECT id
    FROM tenants
    WHERE name = 'Los Perros'
    LIMIT 1
),
store_row AS (
    SELECT s.id
    FROM stores s
    JOIN tenant_row t ON t.id = s.tenant_id
    WHERE s.name = 'Los Perros Centro'
    LIMIT 1
)
INSERT INTO staff_accounts (store_id, sector, username, pin_hash, active, created_at)
SELECT
    store_row.id,
    sector,
    username,
    '$pbkdf2-sha256$29000$2rt3DgHAOCdEiFHK2Xsv5Q$pkJWmXfvEZdiv8XIaTH0zugHvGThXruoJQFzlOVOisE',
    TRUE,
    CURRENT_TIMESTAMP
FROM store_row
CROSS JOIN (
    VALUES
        ('ADMIN', 'admin_perros'),
        ('KITCHEN', 'cocina_perros'),
        ('BAR', 'barra_perros'),
        ('WAITER', 'mozo_perros')
) AS staff_seed(sector, username)
ON CONFLICT (store_id, username) DO UPDATE
SET sector = EXCLUDED.sector,
    pin_hash = EXCLUDED.pin_hash,
    active = TRUE;

WITH tenant_row AS (
    SELECT id
    FROM tenants
    WHERE name = 'Los Perros'
    LIMIT 1
),
store_row AS (
    SELECT s.id
    FROM stores s
    JOIN tenant_row t ON t.id = s.tenant_id
    WHERE s.name = 'Los Perros Centro'
    LIMIT 1
)
INSERT INTO menu_categories (store_id, name, image_url, sort_order, active, created_at)
SELECT
    store_row.id,
    name,
    image_url,
    sort_order,
    TRUE,
    CURRENT_TIMESTAMP
FROM store_row
CROSS JOIN (
    VALUES
        ('Perros Clasicos', 'https://images.unsplash.com/photo-1612392062798-29aaf1f5e9b0?auto=format&fit=crop&w=900&q=80', 10),
        ('Perros Especiales', 'https://images.unsplash.com/photo-1551782450-17144efb9c50?auto=format&fit=crop&w=900&q=80', 20),
        ('Papas', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80', 30),
        ('Bebidas', 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80', 40),
        ('Cervezas', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80', 50),
        ('Combos', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', 60)
) AS categories_seed(name, image_url, sort_order)
ON CONFLICT (store_id, name) DO UPDATE
SET image_url = EXCLUDED.image_url,
    sort_order = EXCLUDED.sort_order,
    active = TRUE;

WITH target_store AS (
    SELECT s.id AS store_id
    FROM stores s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE t.name = 'Los Perros'
      AND s.name = 'Los Perros Centro'
    LIMIT 1
),
product_seed AS (
    SELECT
        store_id,
        category_name,
        product_name,
        image_url,
        description,
        base_price,
        fulfillment_sector
    FROM target_store
    CROSS JOIN (
        VALUES
            ('Perros Clasicos', 'Perro Clasico', 'https://images.unsplash.com/photo-1612392062798-29aaf1f5e9b0?auto=format&fit=crop&w=900&q=80', 'Pan, salchicha alemana, ketchup y mostaza.', 7800, 'KITCHEN'),
            ('Perros Clasicos', 'Perro con Queso', 'https://images.unsplash.com/photo-1551782450-17144efb9c50?auto=format&fit=crop&w=900&q=80', 'Perro clasico con cheddar fundido.', 8600, 'KITCHEN'),
            ('Perros Especiales', 'Perro Mexicano', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80', 'Jalapenos, guacamole y cebolla crocante.', 9800, 'KITCHEN'),
            ('Perros Especiales', 'Perro Full Bacon', 'https://images.unsplash.com/photo-1606755962773-0f1a3c0f4f46?auto=format&fit=crop&w=900&q=80', 'Cheddar, bacon y salsa ahumada.', 10200, 'KITCHEN'),
            ('Papas', 'Papas Clasicas', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80', 'Papas fritas crocantes para compartir.', 5200, 'KITCHEN'),
            ('Papas', 'Papas Cheddar y Bacon', 'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?auto=format&fit=crop&w=900&q=80', 'Papas con cheddar caliente y bacon.', 7400, 'KITCHEN'),
            ('Bebidas', 'Agua Mineral', 'https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=900&q=80', 'Botella 500ml.', 2800, 'WAITER'),
            ('Bebidas', 'Gaseosa Cola', 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=900&q=80', 'Lata 354ml.', 3200, 'WAITER'),
            ('Cervezas', 'Cerveza Lager', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80', 'Pinta tirada bien fria.', 4800, 'BAR'),
            ('Cervezas', 'IPA de la Casa', 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?auto=format&fit=crop&w=900&q=80', 'Pinta lupulada con final citrico.', 5400, 'BAR'),
            ('Combos', 'Combo Perro + Papas + Gaseosa', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', 'Combo rapido para una persona.', 12900, 'KITCHEN')
    ) AS seeded(category_name, product_name, image_url, description, base_price, fulfillment_sector)
)
INSERT INTO products (
    store_id,
    category_id,
    name,
    image_url,
    description,
    base_price,
    fulfillment_sector,
    active,
    created_at
)
SELECT
    ps.store_id,
    mc.id,
    ps.product_name,
    ps.image_url,
    ps.description,
    ps.base_price,
    ps.fulfillment_sector,
    TRUE,
    CURRENT_TIMESTAMP
FROM product_seed ps
JOIN menu_categories mc
  ON mc.store_id = ps.store_id
 AND mc.name = ps.category_name
WHERE NOT EXISTS (
    SELECT 1
    FROM products p
    WHERE p.store_id = ps.store_id
      AND p.name = ps.product_name
);

WITH target_store AS (
    SELECT s.id AS store_id
    FROM stores s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE t.name = 'Los Perros'
      AND s.name = 'Los Perros Centro'
    LIMIT 1
)
UPDATE products p
SET
    image_url = seeded.image_url,
    description = seeded.description,
    base_price = seeded.base_price,
    fulfillment_sector = seeded.fulfillment_sector,
    active = TRUE
FROM target_store ts
JOIN (
    VALUES
        ('Perro Clasico', 'https://images.unsplash.com/photo-1612392062798-29aaf1f5e9b0?auto=format&fit=crop&w=900&q=80', 'Pan, salchicha alemana, ketchup y mostaza.', 7800, 'KITCHEN'),
        ('Perro con Queso', 'https://images.unsplash.com/photo-1551782450-17144efb9c50?auto=format&fit=crop&w=900&q=80', 'Perro clasico con cheddar fundido.', 8600, 'KITCHEN'),
        ('Perro Mexicano', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80', 'Jalapenos, guacamole y cebolla crocante.', 9800, 'KITCHEN'),
        ('Perro Full Bacon', 'https://images.unsplash.com/photo-1606755962773-0f1a3c0f4f46?auto=format&fit=crop&w=900&q=80', 'Cheddar, bacon y salsa ahumada.', 10200, 'KITCHEN'),
        ('Papas Clasicas', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80', 'Papas fritas crocantes para compartir.', 5200, 'KITCHEN'),
        ('Papas Cheddar y Bacon', 'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?auto=format&fit=crop&w=900&q=80', 'Papas con cheddar caliente y bacon.', 7400, 'KITCHEN'),
        ('Agua Mineral', 'https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=900&q=80', 'Botella 500ml.', 2800, 'WAITER'),
        ('Gaseosa Cola', 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=900&q=80', 'Lata 354ml.', 3200, 'WAITER'),
        ('Cerveza Lager', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80', 'Pinta tirada bien fria.', 4800, 'BAR'),
        ('IPA de la Casa', 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?auto=format&fit=crop&w=900&q=80', 'Pinta lupulada con final citrico.', 5400, 'BAR'),
        ('Combo Perro + Papas + Gaseosa', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', 'Combo rapido para una persona.', 12900, 'KITCHEN')
) AS seeded(product_name, image_url, description, base_price, fulfillment_sector)
  ON TRUE
WHERE p.store_id = ts.store_id
  AND p.name = seeded.product_name;

WITH target_products AS (
    SELECT p.id, p.name
    FROM products p
    JOIN stores s ON s.id = p.store_id
    JOIN tenants t ON t.id = s.tenant_id
    WHERE t.name = 'Los Perros'
      AND s.name = 'Los Perros Centro'
      AND p.name IN ('Perro Clasico', 'Perro con Queso', 'Perro Mexicano', 'Papas Clasicas', 'Cerveza Lager')
)
INSERT INTO product_variants (product_id, name, extra_price, active, created_at)
SELECT tp.id, variant_name, extra_price, TRUE, CURRENT_TIMESTAMP
FROM target_products tp
JOIN (
    VALUES
        ('Perro Clasico', 'Simple', 0),
        ('Perro Clasico', 'Doble salchicha', 2200),
        ('Perro con Queso', 'Extra cheddar', 1200),
        ('Perro Mexicano', 'Picante suave', 0),
        ('Perro Mexicano', 'Picante fuerte', 500),
        ('Papas Clasicas', 'Porcion grande', 1800),
        ('Cerveza Lager', 'Pinta', 0),
        ('Cerveza Lager', 'Jarra', 1800)
) AS variants_seed(product_name, variant_name, extra_price)
  ON tp.name = variants_seed.product_name
WHERE NOT EXISTS (
    SELECT 1
    FROM product_variants pv
    WHERE pv.product_id = tp.id
      AND pv.name = variants_seed.variant_name
);

WITH target_products AS (
    SELECT p.id, p.name
    FROM products p
    JOIN stores s ON s.id = p.store_id
    JOIN tenants t ON t.id = s.tenant_id
    WHERE t.name = 'Los Perros'
      AND s.name = 'Los Perros Centro'
      AND p.name IN ('Perro Clasico', 'Perro con Queso', 'Perro Mexicano', 'Perro Full Bacon', 'Papas Cheddar y Bacon')
)
INSERT INTO product_extra_options (product_id, name, extra_price, active, created_at)
SELECT tp.id, extra_name, extra_price, TRUE, CURRENT_TIMESTAMP
FROM target_products tp
JOIN (
    VALUES
        ('Perro Clasico', 'Cebolla crocante', 700),
        ('Perro Clasico', 'Pepinillos', 600),
        ('Perro con Queso', 'Bacon', 1500),
        ('Perro Mexicano', 'Guacamole extra', 1300),
        ('Perro Full Bacon', 'Extra salsa ahumada', 800),
        ('Papas Cheddar y Bacon', 'Cheddar extra', 1100)
) AS extras_seed(product_name, extra_name, extra_price)
  ON tp.name = extras_seed.product_name
WHERE NOT EXISTS (
    SELECT 1
    FROM product_extra_options peo
    WHERE peo.product_id = tp.id
      AND peo.name = extras_seed.extra_name
);

COMMIT;

-- Verificacion rapida
-- 1. Confirmar tenant/store
-- SELECT t.id AS tenant_id, t.name AS tenant_name, s.id AS store_id, s.name AS store_name
-- FROM tenants t
-- JOIN stores s ON s.tenant_id = t.id
-- WHERE t.name = 'Los Perros';
--
-- 2. Confirmar staff
-- SELECT sector, username, active
-- FROM staff_accounts
-- WHERE store_id = (
--     SELECT s.id
--     FROM stores s
--     JOIN tenants t ON t.id = s.tenant_id
--     WHERE t.name = 'Los Perros' AND s.name = 'Los Perros Centro'
-- )
-- ORDER BY username;
--
-- 3. Confirmar categorias y productos
-- SELECT mc.name AS category_name, p.name AS product_name, p.base_price, p.fulfillment_sector
-- FROM products p
-- JOIN menu_categories mc ON mc.id = p.category_id
-- WHERE p.store_id = (
--     SELECT s.id
--     FROM stores s
--     JOIN tenants t ON t.id = s.tenant_id
--     WHERE t.name = 'Los Perros' AND s.name = 'Los Perros Centro'
-- )
-- ORDER BY mc.sort_order, p.name;
