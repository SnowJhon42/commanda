# 005 - Admin: alerta por polling y prioridad visual de actividad

Fecha: 2026-04-23
Estado: LOCAL

## Resumen

Se agrego una segunda deteccion de actividad para admin comparando cambios reales entre recargas del tablero. Si un pedido suma items o cambia total/updated_at, se dispara alerta y esa mesa gana prioridad visual.

## Alcance

- staff

## Comportamiento esperado

- Aunque falle o no llegue un evento en tiempo real, admin detecta actividad nueva en el siguiente refresh/poll
- La mesa o pedido con actividad reciente sube arriba
- Si admin esta en `SALON` o `PEDIDOS`, se enfoca el pedido cambiado

## Archivos relevantes

- `comanda-front-staff/src/App.jsx`
- `comanda-front-staff/src/pages/AdminBoardPage.jsx`

## Validacion local

- Se compara snapshot anterior vs actual por `updated_at`, `total_items` y `total_amount`
- Se mantiene una prioridad visual local por actividad reciente

## Pendiente antes de subir

- Probar flujo real con segundo pedido desde cliente
- Ajustar tiempo o criterio de prioridad si hace falta
