# 009 - Backend base bar prepago manual

Fecha: 2026-04-25
Estado: LOCAL

## Resumen

Se agrego la base backend para pedidos `BAR` con prepago manual. El pedido puede crearse, pero no entra a la operacion de cocina/barra hasta que `ADMIN` confirme el pago.

## Alcance

- backend
- docs

## Archivos tocados

- `comanda-backend/app/db/models/entities.py`
- `comanda-backend/app/db/models/__init__.py`
- `comanda-backend/app/db/runtime_schema.py`
- `comanda-backend/app/schemas/orders.py`
- `comanda-backend/app/api/orders.py`
- `comanda-backend/app/api/table_sessions.py`
- `comanda-backend/app/api/admin.py`
- `comanda-backend/app/api/staff.py`

## Validacion local

- `py_compile` sobre archivos backend modificados
- `apply_runtime_schema_bootstrap(...)` ejecutado sobre la DB local
- `validate_runtime_schema(...)` devolvio `[]`

## Pendiente antes de subir

- exponer botones y badges `BAR / PAGO PENDIENTE / PAGO CONFIRMADO` en staff
- definir canal/QR bar para que el cliente entre por flujo bar sin hardcode
- validar E2E completo con pedido bar retenido y liberado manualmente
