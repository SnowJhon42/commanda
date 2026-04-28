# 012 - Staff vista BAR y botonera admin

Fecha: 2026-04-25
Estado: LOCAL

## Resumen

Se reemplazo el selector desplegable de vistas admin por una botonera horizontal y se agrego `BAR` como vista propia. La vista `BAR` abre el generador de QR ya preconfigurado en modo bar prepago.

## Alcance

- staff
- docs

## Archivos tocados

- `comanda-front-staff/src/App.jsx`
- `comanda-front-staff/src/pages/TableQrPage.jsx`
- `comanda-front-staff/src/styles.css`

## Validacion local

- `npm.cmd run build` en `comanda-front-staff`

## Pendiente antes de subir

- decidir si `BAR` despues se separa en `QR BAR MESAS`, `QR BAR LIBRE` y `PEDIDOS BAR`
- evaluar si la botonera necesita scroll horizontal en pantallas mas chicas
