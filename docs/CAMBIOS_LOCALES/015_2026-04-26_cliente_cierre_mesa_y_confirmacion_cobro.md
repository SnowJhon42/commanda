# 015 - Cliente cierre de mesa y confirmacion de cobro

Fecha: 2026-04-26
Estado: LOCAL

## Resumen

Se rediseño la UI del cliente para el cierre de mesa en modo restaurante. El flujo dejo de presentarse como un pago online ambiguo y paso a mostrarse como `pedir la cuenta`, eleccion de medio y espera de confirmacion del staff. Tambien se corrigio el caso de efectivo para que el cliente no pueda autoconfirmar el cobro.

## Alcance

- client
- docs

## Archivos tocados

- `comanda-front-client/src/App.jsx`
- `comanda-front-client/src/views/CheckoutPage.jsx`
- `comanda-front-client/src/styles.css`

## Validacion local

- `npm.cmd run build` en `comanda-front-client`
- revision manual de copy y estados visibles para:
  - pedir la cuenta
  - elegir efectivo
  - esperar confirmacion del staff
  - mostrar mensaje final de cobro confirmado

## Pendiente antes de subir

- probar flujo completo con staff confirmando cobro en efectivo desde caja
- revisar si `Dividir cuenta` necesita una segunda pasada de UX para quedar igual de claro que `Pedir la cuenta`
- validar copy final en vivo con seguimiento de pedido activo
