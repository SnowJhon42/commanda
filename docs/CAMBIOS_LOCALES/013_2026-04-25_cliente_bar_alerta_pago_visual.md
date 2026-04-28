# 013 - Cliente BAR alerta de pago visual

Fecha: 2026-04-25
Estado: LOCAL

## Resumen

Se reforzo visualmente el flujo `BAR` en cliente para que quede claro que el pedido no entra a preparacion hasta pagar. Se reemplazo el mensaje gris por bloques destacados, pasos visibles y CTA directo a pago.

## Alcance

- client
- docs

## Archivos tocados

- `comanda-front-client/src/views/CheckoutPage.jsx`
- `comanda-front-client/app/globals.css`

## Validacion local

- `npm.cmd run build` en `comanda-front-client`

## Pendiente antes de subir

- evaluar si conviene sumar modal de primera vez en `BAR`
- revisar despues el flujo de cierre de mesa/bar
