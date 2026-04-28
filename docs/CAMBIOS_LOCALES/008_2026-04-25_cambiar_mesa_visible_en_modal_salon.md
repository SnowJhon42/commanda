# 008 - Cambiar mesa visible en modal de salon

Fecha: 2026-04-25
Estado: LOCAL

## Resumen

Se hizo visible la accion `Cambiar mesa` dentro del modal que se abre al tocar una mesa roja en `SALON`, para que la operacion quede donde realmente trabaja el admin.

## Alcance

- staff

## Comportamiento esperado

- Abrir una mesa roja en `SALON`
- Ver bloque `Cambiar mesa` dentro del modal
- Elegir mesa destino libre
- Ejecutar cambio sin salir del detalle

## Archivos relevantes

- `comanda-front-staff/src/App.jsx`

## Pendiente antes de subir

- QA real de cambio de mesa desde modal
- decidir si tambien se mantiene la misma accion en otras vistas
