# 011 - QR y cliente modo BAR

Fecha: 2026-04-25
Estado: LOCAL

## Resumen

Se agrego un canal de entrada `BAR` por URL/QR. El generador de QR del staff ahora puede emitir links de `RESTAURANTE` o `BAR`, y el cliente lee ese modo desde la URL para crear pedidos con `service_mode=BAR`.

## Alcance

- client
- staff
- docs

## Archivos tocados

- `comanda-front-client/src/App.jsx`
- `comanda-front-client/src/views/EntryGatePage.jsx`
- `comanda-front-client/src/views/CheckoutPage.jsx`
- `comanda-front-staff/src/pages/TableQrPage.jsx`

## Validacion local

- `npm.cmd run build` en `comanda-front-client`
- `npm.cmd run build` en `comanda-front-staff`

## Pendiente antes de subir

- agregar pestaña/barboard especifico si se quiere separar visualmente `BAR` de `QR MESAS`
- definir si se suma tambien QR `BAR_LIBRE` para eventos o gente parada
- conectar este flujo a pagos integrados cuando exista pasarela
