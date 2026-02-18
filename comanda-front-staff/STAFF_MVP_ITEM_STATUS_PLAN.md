# STAFF MVP - Plan Operativo por Item

## Contexto
Este plan define el rediseño del modulo staff para operar pedidos internos por **estado de item** (no por estado global del pedido), manteniendo el MVP simple y funcional.

## Decisiones cerradas
- Roles y login se mantienen (ADMIN / KITCHEN / BAR / WAITER) con usuario + PIN.
- En MVP, **ADMIN puede accionar todos los cambios** de estado de cualquier sector.
- Estados de item oficiales: `PENDIENTE`, `EN_PREPARACION`, `LISTO`, `ENTREGADO`.
- Vista operativa agrupada por **mesa**.
- Orden: items y mesas por antiguedad (mas antiguo primero).
- Actualizacion en tiempo real por polling cada **10 segundos**.
- Se agrega auditoria minima por item.

## Objetivo funcional
Permitir trazabilidad completa por item y control por sector con entrega final del mozo.

## Reglas de negocio (finales)

### Estado inicial
- Al crear pedido: todos los items quedan `PENDIENTE`.

### Transiciones validas por rol/sector
- ADMIN (MVP): puede realizar todas las transiciones permitidas para cualquier sector.
- COCINA: `EN_PREPARACION -> LISTO` para items sector COCINA.
- BARRA: `EN_PREPARACION -> LISTO` para items sector BARRA.
- MOZO:
  - `LISTO -> ENTREGADO` (items listos de cualquier sector)
  - para items sector MOZO: `PENDIENTE -> ENTREGADO`

No se permite rollback.

### Estado general del pedido (calculado)
Se deriva desde estados de items y no se setea manualmente.
Precedencia:
1. Si todos `ENTREGADO` -> `ENTREGADO`
2. Si al menos uno `EN_PREPARACION` -> `EN_PREPARACION`
3. Si todos `LISTO` (y ninguno en preparacion) -> `LISTO`
4. Si mezcla de `ENTREGADO` y no entregado -> `PARCIAL`
5. Si todos `PENDIENTE` -> `PENDIENTE`

Nota visual negocio:
- El usuario final puede ver labels amistosos (ej: "Pedido tomado"), pero internamente se mantienen enums tecnicos.

## UX / Pantallas

### 1) Panel ADMIN (control total MVP)
Vista general con tabla/tarjetas por pedido:
- Mesa
- Personas
- Cantidad total de items
- Entregados (`x / n`)
- Estado general (badge)
- Tiempo transcurrido
- Total

Acciones:
- Abrir detalle lateral por pedido (drawer)
- En detalle, agrupado por sector (COCINA/BARRA/MOZO)
- Ver atrasos: items pendientes o en preparacion por mesa y sector
- En MVP, boton de accion para avanzar estado por item

### 2) Pantalla COCINA
Muestra items:
- `sector = COCINA`
- `estado = EN_PREPARACION`
Agrupados por mesa (cards grandes).
Accion:
- `MARCAR LISTO`

### 3) Pantalla BARRA
Igual a cocina para `sector = BARRA`.

### 4) Pantalla MOZO
Muestra:
- items `LISTO` (cualquier sector)
- items `sector = MOZO` en `PENDIENTE`
Agrupados por mesa.
Accion:
- `ENTREGAR` -> `ENTREGADO`

## Modelo de datos (target)

### Tabla `order_items` (existente, se adapta)
Campos relevantes:
- `id`
- `order_id`
- `product_id`
- `qty`
- `sector`
- `status` (**nuevo**)
- `created_at`
- `updated_at` (**nuevo recomendado**)

### Tabla `item_status_events` (nueva)
- `id`
- `item_id`
- `order_id`
- `sector`
- `from_status`
- `to_status`
- `changed_by_staff_id`
- `created_at`

## Backend - Cambios de API

### Endpoints nuevos/redefinidos
1. `GET /staff/items/board?store_id=1&sector=KITCHEN&status=EN_PREPARACION`
- devuelve items agrupables por mesa

2. `PATCH /staff/items/{item_id}/status`
Request:
```json
{ "to_status": "LISTO" }
```
- valida permisos por rol + sector + transicion
- registra evento en `item_status_events`
- recalcula estado general del pedido

3. `GET /admin/orders/{order_id}/items`
- detalle por item agrupado por sector
- indicadores de atraso

### Compatibilidad
- Mantener endpoints actuales durante migracion.
- Front staff nuevo consume endpoints por item.

## Front Staff - Arquitectura

### Estado cliente
- sesion de staff
- lista tablero por sector
- pedido seleccionado + detalle
- errores/transiciones en curso

### Polling
- cada 10s en todas las vistas staff
- refresco inmediato post accion exitosa

### Update optimista
- aplicar cambio local inmediato al accionar boton
- si API falla: rollback + toast/error

## Indicadores de atraso (detalle admin)
Por pedido:
- items pendientes por sector
- items en preparacion por sector
- oldest item age por sector
Mostrar texto tipo:
- "Atraso en COCINA: 2 items pendientes hace 12 min"

## Plan de ejecucion por etapas

### Etapa 1 - Backend item-status
- agregar `status` en items + migracion datos
- crear `item_status_events`
- servicio de transicion por item
- recalculo de estado general por pedido
- tests de reglas

### Etapa 2 - Front staff por item
- admin board con detalle lateral y control MVP
- cocina/barra/mozo por item agrupado por mesa
- polling 10s + optimistic update

### Etapa 3 - Ajuste operativo
- metricas de atraso por sector
- validacion UX tablet
- refinamiento visual badges/estados

## Test cases minimos
1. Crear pedido mixto -> todos items `PENDIENTE`
2. ADMIN pasa item cocina a `EN_PREPARACION` y luego `LISTO`
3. COCINA intenta `LISTO -> ENTREGADO` -> debe fallar
4. MOZO entrega item `LISTO` -> `ENTREGADO`
5. MOZO entrega item sector MOZO desde `PENDIENTE` -> `ENTREGADO`
6. Recalculo estado general correcto en cada transicion
7. Evento de auditoria creado en cada cambio
8. Pantallas agrupan por mesa y ordenan por antiguedad

## Fuera de alcance MVP
- pagos
- cancelaciones
- edicion de pedido
- stock
- websocket
- entrega parcial por cantidad

## Resultado esperado
Un MVP operativo claro:
- trazabilidad por item
- control por sector
- entrega confirmada por mozo
- visibilidad consolidada para admin
- base preparada para evolucionar a despacho directo por sector en fase siguiente
