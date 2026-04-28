# 010 - Staff badges y confirmacion pago BAR

Fecha: 2026-04-25
Estado: LOCAL

## Resumen

Se agrego soporte visual y operativo en `PEDIDOS` para distinguir pedidos `BAR` de `RESTAURANTE`, mostrar el estado de pago del flujo bar y permitir que `ADMIN` confirme manualmente el pago BAR desde la tabla principal.

## Alcance

- staff
- docs

## Archivos tocados

- `comanda-front-staff/src/api/staffApi.js`
- `comanda-front-staff/src/App.jsx`
- `comanda-front-staff/src/pages/AdminBoardPage.jsx`

## Validacion local

- `npm.cmd run build` en `comanda-front-staff`
- build Next compilada correctamente

## Pendiente antes de subir

- crear canal/QR bar para que el cliente entre directo en este flujo
- evaluar si tambien conviene mostrar estos badges en el modal de detalle
- validar E2E con pedido BAR pendiente -> confirmacion -> aparicion en cocina/barra
