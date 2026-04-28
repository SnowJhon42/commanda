# 001 - Plano de salon con colores por estado

Fecha: 2026-04-23
Estado: LOCAL

## Resumen

Se agrego y verifico en local la vista de salon para staff con cambio visual de color por estado de mesa.

## Alcance

- staff
- backend

## Comportamiento esperado

- Mesa libre: verde
- Mesa conectada o con sesion activa sin pedido: amarillo
- Mesa con pedido activo: rojo

## Archivos relevantes

- `comanda-front-staff/src/pages/SalonTablesPage.jsx`
- `comanda-front-staff/src/styles.css`
- `comanda-backend/app/api/staff.py`
- `comanda-backend/app/schemas/orders.py`

## Validacion local

- Backend respondiendo en `http://localhost:8000/health`
- Cliente respondiendo en `http://localhost:5173`
- Staff respondiendo en `http://localhost:5174`
- Se confirmo en codigo que staff usa:
  - `active_table_session_id` para mesa conectada/sentados
  - `active_order_id` para mesa con pedido

## Pendiente antes de subir

- Revisar visualmente el salon con casos reales de mesas libres, conectadas y con pedido
- Consolidar otras mejoras que se quieran incluir en el mismo release
- Pasar checklist de release cuando se decida subir
