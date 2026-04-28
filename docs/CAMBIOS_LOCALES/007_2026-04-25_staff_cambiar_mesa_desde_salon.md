# 007 - Staff: cambiar mesa activa desde salon

Fecha: 2026-04-25
Estado: LOCAL

## Resumen

Se agrego una primera version operativa para que admin pueda mover una mesa activa a otra mesa libre desde la vista `SALON`.

## Alcance

- backend
- staff

## Comportamiento esperado

- Seleccionar mesa activa en `SALON`
- Elegir mesa destino libre
- Ejecutar `Cambiar mesa`
- La sesion y los pedidos activos pasan a la nueva mesa

## Archivos relevantes

- `comanda-backend/app/api/staff.py`
- `comanda-backend/app/schemas/orders.py`
- `comanda-front-staff/src/api/staffApi.js`
- `comanda-front-staff/src/App.jsx`
- `comanda-front-staff/src/pages/SalonTablesPage.jsx`

## Pendiente antes de subir

- QA real con cliente conectado y tracking
- evaluar agregar la misma accion desde `PEDIDOS`
