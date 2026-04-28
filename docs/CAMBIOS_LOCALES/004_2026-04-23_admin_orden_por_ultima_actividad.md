# 004 - Admin: orden por ultima actividad de mesa

Fecha: 2026-04-23
Estado: LOCAL

## Resumen

Se corrigio el criterio de orden del panel admin para que la mesa con actividad mas reciente suba arriba, aunque el pedido haya sido creado antes.

## Alcance

- backend
- staff

## Comportamiento esperado

- Si una mesa agrega platos a un pedido existente, esa mesa vuelve arriba
- El criterio usa ultima actividad del pedido, no solo fecha original de creacion

## Archivos relevantes

- `comanda-backend/app/api/table_sessions.py`
- `comanda-front-staff/src/App.jsx`
- `comanda-front-staff/src/pages/AdminBoardPage.jsx`

## Validacion local

- En append de items al pedido existente se fuerza actualizacion de `order.updated_at`
- El staff admin ordena por `updated_at` con fallback a `created_at`

## Pendiente antes de subir

- Probar caso real con mesa que hace segundo pedido
- Confirmar que la mesa sube arriba tanto en `PEDIDOS` como en `Mesas operativas`
