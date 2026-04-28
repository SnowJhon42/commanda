# 003 - Admin: alerta por items nuevos en pedido existente

Fecha: 2026-04-23
Estado: LOCAL

## Resumen

Se agrego una alerta visible y sonora para admin cuando una mesa suma items nuevos a un pedido ya abierto. Si el admin esta en `SALON` o `PEDIDOS`, el sistema enfoca automaticamente ese pedido.

## Alcance

- staff

## Comportamiento esperado

- Si entra un pedido nuevo: alarma para admin
- Si una mesa agrega mas items al pedido existente: alarma para admin
- En `SALON`: se abre o enfoca el detalle del pedido
- En `PEDIDOS`: se selecciona ese pedido para verlo rapido

## Archivos relevantes

- `comanda-front-staff/src/App.jsx`
- `comanda-backend/app/api/table_sessions.py`

## Validacion local

- Backend ya emitia `items.changed` con `reason: items_appended`
- Front ahora interpreta ese evento como señal operativa para admin

## Pendiente antes de subir

- Probar flujo real: pedido inicial + segundo plato agregado desde cliente
- Ajustar intensidad de alarma o mensaje si hace falta
