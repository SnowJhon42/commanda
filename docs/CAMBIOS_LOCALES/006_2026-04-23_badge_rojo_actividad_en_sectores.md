# 006 - Badge rojo de actividad en sectores

Fecha: 2026-04-23
Estado: LOCAL

## Resumen

Se agrego un indicador rojo con contador en la columna de sectores del admin para marcar actividad nueva en una mesa, similar al patron visual del llamado de mozo.

## Alcance

- staff

## Comportamiento esperado

- Si entra actividad nueva en una mesa, aparece badge rojo con numero
- El badge queda visible hasta abrir esa mesa o su detalle
- El badge se muestra junto a los sectores de la fila

## Archivos relevantes

- `comanda-front-staff/src/App.jsx`
- `comanda-front-staff/src/pages/AdminBoardPage.jsx`
- `comanda-front-staff/src/styles.css`

## Pendiente antes de subir

- Ajustar icono, color o ubicacion exacta si hace falta
