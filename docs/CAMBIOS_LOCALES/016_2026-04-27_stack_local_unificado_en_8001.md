# 016 - Stack local unificado en 8001

Fecha: 2026-04-27
Estado: LOCAL

## Resumen

Se dejo el entorno local prolijo para levantar por `localhost` usando un backend unico en `8001`, porque en esta maquina el `8000` estaba ocupado por un proceso ajeno a esta copia local. Cliente y staff quedaron alineados al mismo backend y el script local arranca y chequea ese puerto.

## Alcance

- ops
- client
- staff
- docs

## Archivos tocados

- `scripts/comanda_local.ps1`
- `comanda-front-client/.env.local`
- `comanda-front-staff/.env.local`
- `docs/LOCALHOST_RUNBOOK.md`

## Validacion local

- backend `http://localhost:8001/health` -> `200`
- cliente `http://localhost:5173` -> `200`
- staff `http://localhost:5174` -> `200`

## Pendiente antes de subir

- si mas adelante se limpia definitivamente el proceso externo que ocupa `8000`, se puede volver a evaluar si conviene restaurar ese puerto
