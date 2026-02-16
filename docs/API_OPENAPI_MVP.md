# COMANDA - API Contract MVP v0.1

Fecha: 2026-02-16
Estado: activo
Base URL (dev): `http://localhost:8000`
Formato: `application/json`

## 1) Convenciones generales

- Autenticación staff: `Authorization: Bearer <token>`
- Cliente (QR/menu): sin login en MVP
- Timezone: UTC
- IDs: enteros autoincrementales
- Estados por sector:
  - `RECEIVED`
  - `IN_PROGRESS`
  - `DONE`
  - `DELIVERED`
- Sectores:
  - `ADMIN`
  - `KITCHEN`
  - `BAR`
  - `WAITER`

## 2) Seguridad y autorización

Reglas MVP:
- `ADMIN` puede cambiar estado de cualquier sector.
- `KITCHEN` solo puede cambiar estado de sector `KITCHEN`.
- `BAR` solo puede cambiar estado de sector `BAR`.
- `WAITER` solo puede cambiar estado de sector `WAITER`.

Respuesta de autorización fallida:
- `403 FORBIDDEN`

## 3) Endpoints

## 3.1 Auth

### `POST /auth/sector-login`

Login de staff por usuario + PIN.

Request:
```json
{
  "store_id": 1,
  "username": "admin",
  "pin": "1234"
}
```

Response `200`:
```json
{
  "access_token": "jwt-token",
  "token_type": "bearer",
  "staff": {
    "id": 1,
    "store_id": 1,
    "sector": "ADMIN",
    "username": "admin"
  }
}
```

Errores:
- `401`: credenciales inválidas
- `422`: request inválido

## 3.2 Menú cliente

### `GET /menu?store_id=1`

Response `200`:
```json
{
  "store_id": 1,
  "categories": [
    { "id": 1, "name": "Entradas", "sort_order": 1 },
    { "id": 2, "name": "Principal", "sort_order": 2 }
  ],
  "products": [
    {
      "id": 10,
      "category_id": 2,
      "name": "Hamburguesa Clasica",
      "description": "Carne, queso, lechuga y tomate",
      "base_price": 12000,
      "fulfillment_sector": "KITCHEN",
      "variants": [
        {
          "id": 100,
          "name": "Sin cebolla",
          "extra_price": 0
        }
      ]
    }
  ]
}
```

Errores:
- `404`: store no existe
- `422`: query inválida

## 3.3 Crear pedido

### `POST /orders`

Reglas:
- `table_code` obligatorio
- al menos 1 item
- `sector` se deriva automáticamente desde producto
- se crean estados solo para sectores presentes

Request:
```json
{
  "tenant_id": 1,
  "store_id": 1,
  "table_code": "M12",
  "guest_count": 2,
  "items": [
    {
      "product_id": 10,
      "variant_id": 100,
      "qty": 2,
      "notes": "sin cebolla"
    },
    {
      "product_id": 20,
      "qty": 1
    }
  ]
}
```

Response `201`:
```json
{
  "order_id": 9001,
  "ticket_number": 436501,
  "status_aggregated": "RECEIVED",
  "sectors": [
    {
      "sector": "KITCHEN",
      "status": "RECEIVED"
    },
    {
      "sector": "BAR",
      "status": "RECEIVED"
    }
  ]
}
```

Errores:
- `404`: mesa o producto inexistente
- `409`: mesa inactiva
- `422`: validación de payload

## 3.4 Tracking pedido cliente

### `GET /orders/{order_id}`

Response `200`:
```json
{
  "id": 9001,
  "tenant_id": 1,
  "store_id": 1,
  "table_code": "M12",
  "guest_count": 2,
  "ticket_number": 436501,
  "status_aggregated": "IN_PROGRESS",
  "sectors": [
    {
      "sector": "KITCHEN",
      "status": "DONE",
      "updated_at": "2026-02-16T20:10:00Z"
    },
    {
      "sector": "BAR",
      "status": "IN_PROGRESS",
      "updated_at": "2026-02-16T20:11:00Z"
    }
  ],
  "items": [
    {
      "id": 1,
      "product_name": "Hamburguesa Clasica",
      "qty": 2,
      "sector": "KITCHEN"
    }
  ],
  "created_at": "2026-02-16T20:00:00Z"
}
```

Errores:
- `404`: pedido no existe

## 3.5 Listado staff por sector

### `GET /staff/orders?store_id=1&sector=KITCHEN&status=IN_PROGRESS&limit=50&offset=0`

Headers:
- `Authorization: Bearer <token>`

Response `200`:
```json
{
  "total": 1,
  "items": [
    {
      "order_id": 9001,
      "table_code": "M12",
      "sector": "KITCHEN",
      "sector_status": "IN_PROGRESS",
      "status_aggregated": "IN_PROGRESS",
      "created_at": "2026-02-16T20:00:00Z"
    }
  ]
}
```

Errores:
- `401`: token inválido/ausente
- `403`: sector del token no autorizado
- `422`: query inválida

## 3.6 Cambio de estado sectorial

### `PATCH /staff/orders/{order_id}/sectors/{sector}/status`

Headers:
- `Authorization: Bearer <token>`

Request:
```json
{
  "to_status": "DONE"
}
```

Reglas de transición:
- `RECEIVED -> IN_PROGRESS`
- `IN_PROGRESS -> DONE`
- `DONE -> DELIVERED`
- no salteos
- no rollback
- solo sectores existentes en el pedido

Response `200`:
```json
{
  "order_id": 9001,
  "sector": "KITCHEN",
  "previous_status": "IN_PROGRESS",
  "current_status": "DONE",
  "status_aggregated": "IN_PROGRESS",
  "updated_by_staff_id": 1,
  "updated_at": "2026-02-16T20:20:00Z"
}
```

Errores:
- `400`: transición inválida
- `401`: token inválido/ausente
- `403`: sin permisos por sector
- `404`: pedido o sector inexistente en pedido
- `409`: estado actual no coincide por concurrencia

## 3.7 Vista admin

### `GET /admin/orders?store_id=1&status=RECEIVED&limit=50&offset=0`

Headers:
- `Authorization: Bearer <token>`

Response `200`:
```json
{
  "total": 2,
  "items": [
    {
      "order_id": 9001,
      "table_code": "M12",
      "status_aggregated": "IN_PROGRESS",
      "sectors": [
        { "sector": "KITCHEN", "status": "DONE" },
        { "sector": "BAR", "status": "IN_PROGRESS" }
      ],
      "created_at": "2026-02-16T20:00:00Z"
    }
  ]
}
```

Errores:
- `401`: token inválido/ausente
- `403`: solo ADMIN

### `GET /admin/orders/{order_id}`

Detalle completo para auditoría manual.

## 4) Errores estándar

Formato:
```json
{
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Transition IN_PROGRESS -> DELIVERED is not allowed",
    "details": {
      "order_id": 9001,
      "sector": "KITCHEN"
    }
  }
}
```

Códigos sugeridos:
- `INVALID_CREDENTIALS`
- `FORBIDDEN_SECTOR`
- `INVALID_STATUS_TRANSITION`
- `ORDER_NOT_FOUND`
- `SECTOR_NOT_PRESENT_IN_ORDER`
- `TABLE_NOT_FOUND`
- `TABLE_INACTIVE`
- `PRODUCT_NOT_FOUND`
- `VALIDATION_ERROR`

## 5) Criterios técnicos de aceptación API

- Crear pedido mixto devuelve sectores creados correctos
- No se crean sectores inexistentes en pedido
- Cambio de estado respeta transición lineal
- Se guarda evento en `order_status_events` en cada `PATCH`
- `status_aggregated` se recalcula después de cada transición
- Autorización por sector se cumple para endpoints staff/admin

## 6) Alineacion mockup (APP mockup)

Incluido en MVP:
- QR / mesa
- cantidad de comensales (`guest_count`)
- menu con categorias
- pedido con carrito
- tracking por estados
- numero de ticket (`ticket_number`)

Fuera de MVP actual (no implementar en backend v0.1):
- login social cliente (Google/Facebook)
- pagos (efectivo/tarjetas)
- dividir cuenta
- favoritos/promociones/perfil
- calificacion y comentarios
