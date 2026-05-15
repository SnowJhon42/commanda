# COMANDA Monorepo

Proyecto unificado en un solo repo:

- `comanda-backend` (FastAPI)
- `comanda-front-client` (Next.js)
- `comanda-front-staff` (Next.js)

Documentacion tecnica:

- `docs/MVP_v0.1_arquitectura_y_flujos.md`
- `docs/API_OPENAPI_MVP.md`
- `docs/DB_SCHEMA_SQLITE.sql`
- `docs/DB_SEED_MIN.sql`
- `docs/MOCKUP_MAPPING_MVP.md`
- `docs/ONLINE_STACK.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/PRIVATE_OPERATIONS.md`
- `docs/DB_SOURCE_OF_TRUTH.md`

## Operacion Local Unificada

Owner operativo local:

- `Mateo (Local-Ops-Agent)`

Workspace recomendado:

- Desarrollo activo: `C:\Users\agust\Desktop\COMANDA_LOCAL`
- OneDrive: solo backup, docs, capturas y material no ejecutable

No ejecutar COMANDA desde rutas dentro de `OneDrive`. Next.js, Python, SQLite y los logs generan artefactos de runtime que OneDrive puede virtualizar o bloquear.

Desde `C:\Users\agust\Desktop\COMANDA_LOCAL`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 -Action up
```

Este es el unico orquestador canonico del stack local. Debe ser el mismo comando usado para levantar, apagar, reiniciar y diagnosticar.

Acciones disponibles:

- `up` (alias: `start`): levanta backend + front client + front staff
- `down` (alias: `stop`): baja todos los servicios y libera puertos
- `restart`: reinicia todo el stack
- `status`: chequea salud de `8001`, `5173`, `5174`
- `logs`: muestra tail de logs de los 3 servicios
- `doctor`: valida prerequisitos, DB seed minima y estado general
- `backend-up`: levanta solo backend
- `backend-down`: baja solo backend
- `backend-status`: healthcheck de backend
- `backend-restart`: reinicia solo backend

Atajos:

- `.\scripts\run_all_local.ps1`
- `.\scripts\stop_all_local.ps1`
- `.\scripts\status_all_local.ps1`
- `.\scripts\restart_all_local.ps1`
- `.\scripts\logs_all_local.ps1`
- `.\scripts\doctor_all_local.ps1`
- `start-local-stable.bat` y `.\scripts\start_local_stable.ps1` ahora delegan en `comanda_local.ps1`; no levantan procesos por separado.

URLs locales:

- Backend health: `http://localhost:8001/health`
- Cliente Next.js: `http://localhost:5173`
- Staff Next.js: `http://localhost:5174`

Si Staff muestra "No se pudo conectar con el backend":

1. Verificar API: abrir `http://localhost:8001/health` (debe responder `{"status":"ok"}`).
2. Si esta caida, reiniciar con el script oficial desde raiz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 -Action backend-restart
```

DB local canonica para backend:

- `C:\Users\agust\Desktop\COMANDA_LOCAL\comanda-backend\comanda_dev.db`

Chequeo recomendado para evitar confusion de DB:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 -Action doctor
```

Recuperacion rapida solo de backend (puerto 8001):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 -Action backend-restart
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 -Action backend-status
```

Si el backend no queda vivo en segundo plano en tu maquina, usar arranque estable en primer plano:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backend_foreground_local.ps1
```

Dejar esa ventana abierta y luego abrir:

- `http://localhost:8001/health`
- `http://localhost:5173`
- `http://localhost:5174`

Si `npm.cmd run dev:staff` falla con `spawn EPERM`, usar fallback estatico:

```powershell
npm.cmd run staff:static
```

Luego abrir `http://localhost:5174`.

Evitar mezclar estos caminos en la misma sesion:

- `npm run dev:backend` ya delega en el backend oficial de `comanda_local.ps1`
- `scripts/run_public_demo.ps1` es solo para demo publica y puede apuntar temporalmente los fronts a una URL publica
- al terminar una demo publica, ejecutar `scripts/stop_public_demo.ps1` para restaurar `NEXT_PUBLIC_API_URL=/api-proxy`

## Backup Seguro a OneDrive

Para guardar codigo y documentacion en OneDrive sin copiar artefactos de runtime:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup_code_to_onedrive.ps1
```

El backup genera un snapshot en `C:\Users\agust\OneDrive\COMANDA_BACKUP` y excluye:

- `.git`
- `node_modules`
- `.next`
- `.venv`
- `logs`
- `recordings`
- `backups`
- `comanda_dev.db`
- `*.pid`
- `*.log`

## Variables Front

Cada frontend usa:

- `NEXT_PUBLIC_API_URL=/api-proxy`
- `BACKEND_PROXY_TARGET=http://127.0.0.1:8001`

Archivos:

- `comanda-front-client/.env.local`
- `comanda-front-staff/.env.local`

## Vercel

Para deploy en Vercel crear 2 proyectos sobre este mismo repo:

1. Front Cliente
- Root Directory: `comanda-front-client`

2. Front Staff
- Root Directory: `comanda-front-staff`

En ambos proyectos configurar:

- `NEXT_PUBLIC_API_URL`: URL publica del backend FastAPI

## Regla Operativa

Para evitar confusion entre local y online:

- Local primero
- GitHub despues
- Deploy despues
- Smoke test publico al final

Fuente de verdad del entorno online:

- `docs/ONLINE_STACK.md`
- Owner: `Santiago (Infra-Ops-Agent)`

Fuente de verdad del entorno local y DB:

- `docs/LOCALHOST_RUNBOOK.md`
- `docs/DB_SOURCE_OF_TRUTH.md`
