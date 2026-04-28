# 014 - BAR visible desde sesion y bloqueo hasta pago

Fecha: 2026-04-26
Estado: LOCAL

## Resumen

Se corrigio el flujo `BAR` para que una mesa abierta desde QR BAR ya se vea como `BAR` en staff antes del primer pedido. Ademas, mientras el pedido BAR siga con pago pendiente, staff/admin puede verlo pero no puede avanzar estados de items hasta confirmar el pago.

## Alcance

- backend
- staff
- docs

## Archivos tocados

- `comanda-backend/app/api/staff.py`
- `comanda-backend/app/api/table_sessions.py`
- `comanda-backend/app/db/models/entities.py`
- `comanda-backend/app/db/runtime_schema.py`
- `comanda-backend/app/schemas/orders.py`
- `comanda-front-client/src/App.jsx`
- `comanda-front-staff/src/pages/AdminBoardPage.jsx`
- `comanda-front-staff/src/pages/OrderDetailPanel.jsx`

## Validacion local

- `py_compile` de archivos backend tocados
- `apply_runtime_schema_bootstrap(...)` + `validate_runtime_schema(...)` devuelve `[]`
- `npm.cmd run build` en `comanda-front-staff`
- reinicio local y health checks `200` en backend, cliente y staff

## Pendiente antes de subir

- probar flujo completo con mesa BAR nueva: abrir sesion, ver `BAR`, crear pedido, confirmar pago y recien ahi avanzar estados
- revisar si conviene mostrar bloqueo visual tambien en vistas de cocina/bar dedicadas
