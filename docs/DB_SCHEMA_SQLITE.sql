PRAGMA foreign_keys = ON;

-- Optional at connection startup:
-- PRAGMA journal_mode = WAL;

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  show_live_total_to_client INTEGER NOT NULL DEFAULT 1 CHECK (show_live_total_to_client IN (0, 1)),
  owner_password_hash TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  theme_preset TEXT NOT NULL DEFAULT 'CLASSIC' CHECK (theme_preset IN ('CLASSIC', 'MODERN', 'PREMIUM')),
  accent_color TEXT NOT NULL DEFAULT 'ROJO' CHECK (accent_color IN ('ROJO', 'VERDE', 'DORADO', 'AZUL', 'NEGRO')),
  show_watermark_logo INTEGER NOT NULL DEFAULT 0 CHECK (show_watermark_logo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE (store_id, code)
);

CREATE TABLE IF NOT EXISTS table_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  table_id INTEGER NOT NULL,
  guest_count INTEGER NOT NULL DEFAULT 1 CHECK (guest_count > 0),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'MESA_OCUPADA', 'CON_PEDIDO', 'CLOSED', 'SE_RETIRARON')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (table_id) REFERENCES tables(id)
);

CREATE TABLE IF NOT EXISTS table_session_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_session_id INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  alias TEXT,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (table_session_id) REFERENCES table_sessions(id),
  UNIQUE (table_session_id, client_id)
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE (store_id, name)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  category_id INTEGER,
  name TEXT NOT NULL,
  image_url TEXT,
  description TEXT,
  base_price NUMERIC NOT NULL CHECK (base_price >= 0),
  fulfillment_sector TEXT NOT NULL CHECK (fulfillment_sector IN ('KITCHEN', 'BAR', 'WAITER')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (category_id) REFERENCES menu_categories(id)
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  extra_price NUMERIC NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS product_extra_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  extra_price NUMERIC NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS staff_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  sector TEXT NOT NULL CHECK (sector IN ('ADMIN', 'KITCHEN', 'BAR', 'WAITER')),
  display_name TEXT NOT NULL,
  username TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE (store_id, username)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  table_id INTEGER NOT NULL,
  table_session_id INTEGER,
  guest_count INTEGER NOT NULL DEFAULT 1 CHECK (guest_count > 0),
  ticket_number INTEGER NOT NULL,
  status_aggregated TEXT NOT NULL CHECK (status_aggregated IN ('RECEIVED', 'IN_PROGRESS', 'DONE', 'PARCIAL', 'DELIVERED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (table_id) REFERENCES tables(id),
  FOREIGN KEY (table_session_id) REFERENCES table_sessions(id),
  UNIQUE (store_id, ticket_number)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  notes TEXT,
  sector TEXT NOT NULL CHECK (sector IN ('KITCHEN', 'BAR', 'WAITER')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (variant_id) REFERENCES product_variants(id)
);

CREATE TABLE IF NOT EXISTS order_sector_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  sector TEXT NOT NULL CHECK (sector IN ('KITCHEN', 'BAR', 'WAITER')),
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'IN_PROGRESS', 'DONE', 'DELIVERED')),
  updated_by_staff_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (updated_by_staff_id) REFERENCES staff_accounts(id),
  UNIQUE (order_id, sector)
);

CREATE TABLE IF NOT EXISTS order_status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  sector TEXT NOT NULL CHECK (sector IN ('KITCHEN', 'BAR', 'WAITER')),
  from_status TEXT CHECK (from_status IN ('RECEIVED', 'IN_PROGRESS', 'DONE', 'DELIVERED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('RECEIVED', 'IN_PROGRESS', 'DONE', 'DELIVERED')),
  changed_by_staff_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (changed_by_staff_id) REFERENCES staff_accounts(id)
);

CREATE TABLE IF NOT EXISTS table_session_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_session_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (table_session_id) REFERENCES table_sessions(id),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  UNIQUE (table_session_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_store_created
  ON orders (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_store_status_created
  ON orders (store_id, status_aggregated, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_sector_status_order_sector
  ON order_sector_status (order_id, sector);

CREATE INDEX IF NOT EXISTS idx_order_items_order_sector
  ON order_items (order_id, sector);

CREATE INDEX IF NOT EXISTS idx_products_store_active_sector
  ON products (store_id, active, fulfillment_sector);

CREATE INDEX IF NOT EXISTS idx_products_store_category
  ON products (store_id, category_id);

CREATE INDEX IF NOT EXISTS idx_table_sessions_store_status_created
  ON table_sessions (store_id, status, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_orders_updated_at
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  UPDATE orders
  SET updated_at = datetime('now')
  WHERE id = OLD.id;
END;

COMMIT;
