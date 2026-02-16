# COMANDA - Especificacion Tecnica MVP v0.1

Fecha: 2026-02-16
Estado: activo
Objetivo: documento unico para que cualquier agente/dev pueda implementar sin contexto adicional.

## 1) Scope funcional MVP

Sistema de pedidos por mesa con QR.
Roles/sectores internos:
- `ADMIN`
- `KITCHEN`
- `BAR`
- `WAITER`

Decision MVP:
- Fase 1: `ADMIN` mueve manualmente todos los estados de todos los sectores.
- No hay cancelacion (`CANCELLED`) en MVP.
- Solo consumo en mesa (`table_id` obligatorio).

## 2) Repositorios oficiales

- `comanda-backend`
- `comanda-front-client`
- `comanda-front-staff`

## 3) Stack tecnico

- Backend: `FastAPI`, `SQLAlchemy`, `Alembic`, `Pydantic`
- DB inicial: `SQLite` (WAL enabled)
- Cliente: `React` en `Vercel` (mobile-first)
- Staff: `React` en `Vercel` (desktop-first, responsive)
- Backend deploy target: `Railway`

## 4) Modelo multi-local desde dia 1

Aunque se opere un solo local al inicio:
- `tenant_id`: negocio
- `store_id`: sucursal

Todo pedido/producto/staff pertenece a un `store_id`.

## 5) Reglas de derivacion por producto

Campo obligatorio en producto: `fulfillment_sector`.

Valores:
- `KITCHEN`: comidas
- `BAR`: tragos
- `WAITER`: agua/gaseosa/entrega directa por mozo

Un pedido puede tener items de multiples sectores.
Los sectores no presentes en un pedido no crean estado.

Ejemplo:
- Pedido con comida + trago + agua
- Se crean estados para `KITCHEN`, `BAR`, `WAITER`

Ejemplo 2:
- Pedido solo comida
- Solo se crea estado de `KITCHEN`

## 6) Estados

## 6.1 Estado por sector

Secuencia valida:
- `RECEIVED -> IN_PROGRESS -> DONE -> DELIVERED`

Reglas:
- No se permite saltear estados.
- No se permite volver a estado anterior.

## 6.2 Estado agregado de pedido

Campo: `orders.status_aggregated`

Calculo:
- `RECEIVED`: todos los sectores en `RECEIVED`
- `IN_PROGRESS`: al menos un sector en `IN_PROGRESS`
- `DONE`: todos los sectores creados en `DONE`
- `DELIVERED`: todos los sectores creados en `DELIVERED`

Decision operativa:
- Fase 1: admin ejecuta manualmente cambios por sector.
- Fase 2+: mozo cierra `DELIVERED` cuando entrega.

## 7) Estructura sugerida por repositorio

## 7.1 `comanda-backend`

```txt
comanda-backend/
  app/
    api/
      auth.py
      menu.py
      orders.py
      admin.py
      staff.py
    core/
      config.py
      security.py
    db/
      base.py
      session.py
      models/
      repositories/
    schemas/
    services/
      order_routing.py
      order_status.py
    main.py
  alembic/
  alembic.ini
  requirements.txt
  README.md
```

## 7.2 `comanda-front-client`

```txt
comanda-front-client/
  src/
    pages/
      MenuPage.tsx
      CheckoutPage.tsx
      OrderTrackingPage.tsx
    api/
    components/
    hooks/
```

## 7.3 `comanda-front-staff`

```txt
comanda-front-staff/
  src/
    pages/
      LoginPage.tsx
      AdminBoardPage.tsx
      KitchenBoardPage.tsx
      BarBoardPage.tsx
      WaiterBoardPage.tsx
    api/
    components/
```

## 8) Modelo de datos (DB)

Tipos orientados a SQLite pero compatibles con PostgreSQL.

## 8.1 Tablas

- `tenants`
  - `id` (pk)
  - `name` (text, unique)
  - `created_at` (datetime)

- `stores`
  - `id` (pk)
  - `tenant_id` (fk -> tenants.id)
  - `name` (text)
  - `created_at` (datetime)

- `tables`
  - `id` (pk)
  - `store_id` (fk -> stores.id)
  - `code` (text) // ej: "M12"
  - `active` (bool)
  - unique (`store_id`, `code`)

- `products`
  - `id` (pk)
  - `store_id` (fk -> stores.id)
  - `category_id` (fk -> menu_categories.id, nullable)
  - `name` (text)
  - `description` (text, nullable)
  - `base_price` (numeric(10,2))
  - `fulfillment_sector` (text enum: KITCHEN|BAR|WAITER)
  - `active` (bool)
  - `created_at` (datetime)

- `product_variants`
  - `id` (pk)
  - `product_id` (fk -> products.id)
  - `name` (text) // ej: "sin cebolla", "doble"
  - `extra_price` (numeric(10,2), default 0)
  - `active` (bool)

- `menu_categories`
  - `id` (pk)
  - `store_id` (fk -> stores.id)
  - `name` (text)
  - `sort_order` (int)
  - `active` (bool)

- `orders`
  - `id` (pk)
  - `tenant_id` (fk -> tenants.id)
  - `store_id` (fk -> stores.id)
  - `table_id` (fk -> tables.id) // obligatorio MVP
  - `guest_count` (int > 0)
  - `ticket_number` (int, unique por store)
  - `status_aggregated` (text enum)
  - `created_at` (datetime)
  - `updated_at` (datetime)

- `order_items`
  - `id` (pk)
  - `order_id` (fk -> orders.id)
  - `product_id` (fk -> products.id)
  - `variant_id` (fk -> product_variants.id, nullable)
  - `qty` (int)
  - `unit_price` (numeric(10,2))
  - `notes` (text, nullable)
  - `sector` (text enum: KITCHEN|BAR|WAITER)

- `order_sector_status`
  - `id` (pk)
  - `order_id` (fk -> orders.id)
  - `sector` (text enum)
  - `status` (text enum)
  - `updated_by_staff_id` (fk -> staff_accounts.id, nullable)
  - `updated_at` (datetime)
  - unique (`order_id`, `sector`)

- `order_status_events`
  - `id` (pk)
  - `order_id` (fk -> orders.id)
  - `sector` (text enum)
  - `from_status` (text enum, nullable)
  - `to_status` (text enum)
  - `changed_by_staff_id` (fk -> staff_accounts.id)
  - `created_at` (datetime)

- `staff_accounts`
  - `id` (pk)
  - `store_id` (fk -> stores.id)
  - `sector` (text enum: ADMIN|KITCHEN|BAR|WAITER)
  - `username` (text)
  - `pin_hash` (text)
  - `active` (bool)
  - unique (`store_id`, `username`)

## 8.2 Indices minimos

- `orders(store_id, created_at desc)`
- `orders(store_id, status_aggregated, created_at desc)`
- `order_sector_status(order_id, sector)`
- `order_items(order_id, sector)`
- `products(store_id, active, fulfillment_sector)`
- `products(store_id, category_id)`

## 9) API contracts (sin versionado)

Base path: `/`

## 9.1 Auth

- `POST /auth/sector-login`
  - request:
  ```json
  {
    "store_id": 1,
    "username": "admin",
    "pin": "1234"
  }
  ```
  - response:
  ```json
  {
    "access_token": "jwt-token",
    "token_type": "bearer",
    "staff": {
      "id": 1,
      "sector": "ADMIN",
      "username": "admin"
    }
  }
  ```

## 9.2 Menu and client order

- `GET /menu?store_id=1`
- `POST /orders`
  - request:
  ```json
  {
    "tenant_id": 1,
    "store_id": 1,
    "table_code": "M12",
    "guest_count": 2,
    "items": [
      {
        "product_id": 10,
        "variant_id": 4,
        "qty": 2,
        "notes": "sin cebolla"
      }
    ]
  }
  ```
  - behavior:
    - crea `orders`, `order_items`
    - deriva `sector` por `product.fulfillment_sector`
    - crea filas en `order_sector_status` solo para sectores presentes
    - estado inicial por sector: `RECEIVED`
    - `orders.status_aggregated = RECEIVED`
  - response:
  ```json
  {
    "order_id": 9001,
    "ticket_number": 436501,
    "status_aggregated": "RECEIVED"
  }
  ```

- `GET /orders/{order_id}`
  - uso cliente para tracking

## 9.3 Staff

- `GET /staff/orders?store_id=1&sector=KITCHEN&status=IN_PROGRESS`
- `PATCH /staff/orders/{order_id}/sectors/{sector}/status`
  - request:
  ```json
  {
    "to_status": "DONE"
  }
  ```
  - checks:
    - sector debe existir en pedido
    - transicion valida
    - registrar en `order_status_events`
    - recalcular `orders.status_aggregated`

## 9.4 Admin

- `GET /admin/orders?store_id=1&status=RECEIVED`
- `GET /admin/orders/{order_id}`

Nota:
- En fase 1, admin usa tambien `PATCH /staff/orders/{order_id}/sectors/{sector}/status`.

## 10) Reglas de negocio cerradas para MVP

- Sin `CANCELLED`
- Sin takeaway
- Sin pagos
- Sin POS
- Sin websocket (polling cada 5-10s)
- Solo un usuario base por sector por local
- Registro de auditoria obligatorio en cada cambio de estado

## 11) Seed minimo requerido

Datos minimos para entorno local:
- 1 tenant
- 1 store
- mesas `M1` a `M20`
- 4 staff users:
  - `admin` (ADMIN)
  - `kitchen` (KITCHEN)
  - `bar` (BAR)
  - `waiter` (WAITER)
- menu base con al menos:
  - 3 comidas (`KITCHEN`)
  - 3 tragos (`BAR`)
  - 3 bebidas sin alcohol (`WAITER`)

## 12) Definition of done tecnico (MVP)

- Crear pedido mixto (comida + trago + agua)
- Ver 3 sectores creados en `order_sector_status`
- Mover estados completos por admin hasta `DELIVERED`
- Ver historial en `order_status_events`
- Front cliente muestra progreso del pedido
- Front staff filtra correctamente por sector
