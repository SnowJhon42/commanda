# COMANDA - Dev Servers

Fecha: 2026-02-19
Owner: `Mateo (Local-Ops-Agent)`

## Regla simple

Cuando termines de probar en local, cerra cada servidor con `Ctrl + C`.
Si no lo cerras, el puerto puede quedar ocupado y aparece `EADDRINUSE`.

## Script de recuperacion rapida

Archivo: `scripts/dev-reset.ps1`

Hace dos cosas:
- Mata procesos que ocupan `5173` y `5174`.
- Opcionalmente vuelve a levantar client y staff.

## Uso (PowerShell)

Desde raiz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-reset.ps1
```

Limpiar puertos y levantar ambos fronts:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-reset.ps1 -Start
```

## URLs

- Cliente: `http://localhost:5173`
- Staff: `http://localhost:5174`
