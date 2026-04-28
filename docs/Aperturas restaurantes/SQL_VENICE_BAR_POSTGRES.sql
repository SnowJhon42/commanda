BEGIN;

-- Apertura operativa completa: Venice Bar
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
-- - admin_venice
-- - cocina_venice
-- - barra_venice
-- - mozo_venice

WITH ensured_tenant AS (
    INSERT INTO tenants (name, created_at)
    VALUES ('Venice Bar', CURRENT_TIMESTAMP)
    ON CONFLICT (name) DO UPDATE
    SET name = EXCLUDED.name
    RETURNING id
),
tenant_row AS (
    SELECT id FROM ensured_tenant
    UNION ALL
    SELECT id FROM tenants WHERE name = 'Venice Bar'
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
        'Venice Bar Centro',
        TRUE,
        'MANUAL',
        'Pedi en {restaurant_name} y mirá la carta acá:\n{menu_url}',
        '$pbkdf2-sha256$29000$OgeAcE6JsRbiPGcsJURIaQ$SVrNJX3RpFWhZvJ8kFyMlDDz6BXL/CwFnCRWNNHSdOw',
        'MODERN',
        'AZUL',
        FALSE,
        CURRENT_TIMESTAMP
    FROM tenant_row
    WHERE NOT EXISTS (
        SELECT 1
        FROM stores
        WHERE tenant_id = tenant_row.id
          AND name = 'Venice Bar Centro'
    )
    RETURNING id
),
store_row AS (
    SELECT id FROM ensured_store
    UNION ALL
    SELECT s.id
    FROM stores s
    JOIN tenant_row t ON t.id = s.tenant_id
    WHERE s.name = 'Venice Bar Centro'
    LIMIT 1
)
INSERT INTO tables (store_id, code, active, created_at)
SELECT store_row.id, code, TRUE, CURRENT_TIMESTAMP
FROM store_row
CROSS JOIN (
    VALUES
        ('M1'), ('M2'), ('M3'), ('M4'), ('M5'),
        ('M6'), ('M7'), ('M8'), ('M9'), ('M10'),
        ('M11'), ('M12'), ('M13'), ('M14')
) AS table_codes(code)
ON CONFLICT (store_id, code) DO NOTHING;

WITH tenant_row AS (
    SELECT id
    FROM tenants
    WHERE name = 'Venice Bar'
    LIMIT 1
),
store_row AS (
    SELECT s.id
    FROM stores s
    JOIN tenant_row t ON t.id = s.tenant_id
    WHERE s.name = 'Venice Bar Centro'
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
        ('ADMIN', 'admin_venice'),
        ('KITCHEN', 'cocina_venice'),
        ('BAR', 'barra_venice'),
        ('WAITER', 'mozo_venice')
) AS staff_seed(sector, username)
ON CONFLICT (store_id, username) DO UPDATE
SET sector = EXCLUDED.sector,
    pin_hash = EXCLUDED.pin_hash,
    active = TRUE;

WITH tenant_row AS (
    SELECT id
    FROM tenants
    WHERE name = 'Venice Bar'
    LIMIT 1
),
store_row AS (
    SELECT s.id
    FROM stores s
    JOIN tenant_row t ON t.id = s.tenant_id
    WHERE s.name = 'Venice Bar Centro'
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
        ('Cocktails de Autor', 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=80', 10),
        ('Spritz y Aperitivos', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=80', 20),
        ('Vinos y Espumantes', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80', 30),
        ('Cervezas', 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?auto=format&fit=crop&w=900&q=80', 40),
        ('Tapeo', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80', 50),
        ('Postres', 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80', 60)
) AS categories_seed(name, image_url, sort_order)
ON CONFLICT (store_id, name) DO UPDATE
SET image_url = EXCLUDED.image_url,
    sort_order = EXCLUDED.sort_order,
    active = TRUE;

WITH target_store AS (
    SELECT s.id AS store_id
    FROM stores s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE t.name = 'Venice Bar'
      AND s.name = 'Venice Bar Centro'
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
            ('Cocktails de Autor', 'Negroni Venice', 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=80', 'Gin, Campari, vermouth rosso y piel de naranja.', 9800, 'BAR'),
            ('Cocktails de Autor', 'Espresso Martini', 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=80', 'Vodka, licor de cafe y espresso fresco.', 10500, 'BAR'),
            ('Spritz y Aperitivos', 'Aperol Spritz', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=80', 'Aperol, espumante, soda y rodaja de naranja.', 9200, 'BAR'),
            ('Spritz y Aperitivos', 'Campari Tonic', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80', 'Campari, tonica y citricos.', 8600, 'BAR'),
            ('Vinos y Espumantes', 'Copa Malbec', 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=900&q=80', 'Copa de malbec joven.', 6400, 'WAITER'),
            ('Vinos y Espumantes', 'Copa Espumante Brut', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80', 'Copa de espumante brut.', 6900, 'WAITER'),
            ('Cervezas', 'Pinta Golden', 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?auto=format&fit=crop&w=900&q=80', 'Pinta tirada suave y refrescante.', 5200, 'BAR'),
            ('Cervezas', 'Pinta IPA', 'https://images.unsplash.com/photo-1516458464372-ee7f5f0f5d4a?auto=format&fit=crop&w=900&q=80', 'Pinta de IPA con perfil lupulado.', 5900, 'BAR'),
            ('Tapeo', 'Bruschettas del Chef', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', 'Pan tostado, tomates confitados y stracciatella.', 8800, 'KITCHEN'),
            ('Tapeo', 'Rabas con Alioli', 'https://images.unsplash.com/photo-1559847844-d721426d6edc?auto=format&fit=crop&w=900&q=80', 'Porcion de rabas crocantes con alioli de limon.', 12400, 'KITCHEN'),
            ('Tapeo', 'Tabla Venice', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80', 'Quesos, fiambres, aceitunas y focaccia.', 16800, 'KITCHEN'),
            ('Postres', 'Tiramisu', 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80', 'Version clasica con cacao amargo.', 7200, 'KITCHEN')
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
    WHERE t.name = 'Venice Bar'
      AND s.name = 'Venice Bar Centro'
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
        ('Negroni Venice', 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=80', 'Gin, Campari, vermouth rosso y piel de naranja.', 9800, 'BAR'),
        ('Espresso Martini', 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=80', 'Vodka, licor de cafe y espresso fresco.', 10500, 'BAR'),
        ('Aperol Spritz', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=80', 'Aperol, espumante, soda y rodaja de naranja.', 9200, 'BAR'),
        ('Campari Tonic', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80', 'Campari, tonica y citricos.', 8600, 'BAR'),
        ('Copa Malbec', 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=900&q=80', 'Copa de malbec joven.', 6400, 'WAITER'),
        ('Copa Espumante Brut', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80', 'Copa de espumante brut.', 6900, 'WAITER'),
        ('Pinta Golden', 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?auto=format&fit=crop&w=900&q=80', 'Pinta tirada suave y refrescante.', 5200, 'BAR'),
        ('Pinta IPA', 'https://images.unsplash.com/photo-1516458464372-ee7f5f0f5d4a?auto=format&fit=crop&w=900&q=80', 'Pinta de IPA con perfil lupulado.', 5900, 'BAR'),
        ('Bruschettas del Chef', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', 'Pan tostado, tomates confitados y stracciatella.', 8800, 'KITCHEN'),
        ('Rabas con Alioli', 'https://images.unsplash.com/photo-1559847844-d721426d6edc?auto=format&fit=crop&w=900&q=80', 'Porcion de rabas crocantes con alioli de limon.', 12400, 'KITCHEN'),
        ('Tabla Venice', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80', 'Quesos, fiambres, aceitunas y focaccia.', 16800, 'KITCHEN'),
        ('Tiramisu', 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80', 'Version clasica con cacao amargo.', 7200, 'KITCHEN')
) AS seeded(product_name, image_url, description, base_price, fulfillment_sector)
  ON TRUE
WHERE p.store_id = ts.store_id
  AND p.name = seeded.product_name;

WITH target_products AS (
    SELECT p.id, p.name
    FROM products p
    JOIN stores s ON s.id = p.store_id
    JOIN tenants t ON t.id = s.tenant_id
    WHERE t.name = 'Venice Bar'
      AND s.name = 'Venice Bar Centro'
      AND p.name IN ('Negroni Venice', 'Espresso Martini', 'Pinta Golden', 'Tabla Venice')
)
INSERT INTO product_variants (product_id, name, extra_price, active, created_at)
SELECT tp.id, variant_name, extra_price, TRUE, CURRENT_TIMESTAMP
FROM target_products tp
JOIN (
    VALUES
        ('Negroni Venice', 'Clasico', 0),
        ('Negroni Venice', 'Doble', 3200),
        ('Espresso Martini', 'Clasico', 0),
        ('Espresso Martini', 'Shot extra', 1400),
        ('Pinta Golden', 'Media pinta', 0),
        ('Pinta Golden', 'Pinta imperial', 1600),
        ('Tabla Venice', 'Para 2', 0),
        ('Tabla Venice', 'Para 4', 6200)
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
    WHERE t.name = 'Venice Bar'
      AND s.name = 'Venice Bar Centro'
      AND p.name IN ('Negroni Venice', 'Aperol Spritz', 'Bruschettas del Chef', 'Rabas con Alioli', 'Tiramisu')
)
INSERT INTO product_extra_options (product_id, name, extra_price, active, created_at)
SELECT tp.id, extra_name, extra_price, TRUE, CURRENT_TIMESTAMP
FROM target_products tp
JOIN (
    VALUES
        ('Negroni Venice', 'Twist de naranja extra', 400),
        ('Aperol Spritz', 'Espumante premium', 1200),
        ('Bruschettas del Chef', 'Extra stracciatella', 1600),
        ('Rabas con Alioli', 'Alioli extra', 700),
        ('Tiramisu', 'Extra cacao', 300)
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
-- WHERE t.name = 'Venice Bar';
--
-- 2. Confirmar staff
-- SELECT sector, username, active
-- FROM staff_accounts
-- WHERE store_id = (
--     SELECT s.id
--     FROM stores s
--     JOIN tenants t ON t.id = s.tenant_id
--     WHERE t.name = 'Venice Bar' AND s.name = 'Venice Bar Centro'
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
--     WHERE t.name = 'Venice Bar' AND s.name = 'Venice Bar Centro'
-- )
-- ORDER BY mc.sort_order, p.name;
