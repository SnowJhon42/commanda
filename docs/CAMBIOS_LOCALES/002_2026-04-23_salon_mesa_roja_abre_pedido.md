# 002 - Salon: mesa roja abre detalle de pedido

Fecha: 2026-04-23
Estado: LOCAL

## Resumen

En la vista de salon del staff, al tocar una mesa roja con pedido activo se abre un modal con el detalle operativo del pedido, sin salir del plano.

## Alcance

- staff

## Comportamiento esperado

- Click o toque sobre mesa roja en `SALON`
- Apertura de modal con pedido de esa mesa
- Visualizacion de items, estados, atrasos, division de cuenta y acciones operativas
- Cierre del modal con boton `X` o click fuera

## Archivos relevantes

- `comanda-front-staff/src/App.jsx`
- `comanda-front-staff/src/pages/SalonTablesPage.jsx`

## Validacion local

- La vista de salon ya disparaba `onSelectOrder` sobre mesas con `active_order_id`
- Se completo el flujo para que ese `selectedOrderId` abra modal y muestre `OrderDetailPanel`

## Pendiente antes de subir

- Probar visualmente en salon con una mesa roja real
- Ajustar si preferimos navegacion a otra vista en vez de modal
