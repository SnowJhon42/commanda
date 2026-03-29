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

Acciones disponibles:

- `up` (alias: `start`): levanta backend + front client + front staff
- `down` (alias: `stop`): baja todos los servicios y libera puertos
- `restart`: reinicia todo el stack
- `status`: chequea salud de `8000`, `5173`, `5174`
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

URLs locales:

- Backend health: `http://localhost:8000/health`
- Cliente Next.js: `http://localhost:5173`
- Staff Next.js: `http://localhost:5174`

Si Staff muestra "No se pudo conectar con el backend":

1. Verificar API: abrir `http://localhost:8000/health` (debe responder `{"status":"ok"}`).
2. Si esta caida, levantar backend desde raiz:

```powershell
npm.cmd run dev:backend
```

DB local canonica para backend:

- `C:\Users\agust\Desktop\COMANDA_LOCAL\comanda-backend\comanda_dev.db`

Chequeo recomendado para evitar confusion de DB:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 -Action doctor
```

Recuperacion rapida solo de backend (puerto 8000):

```powershell
npm.cmd run backend:restart
npm.cmd run backend:status
```

Si `npm.cmd run dev:staff` falla con `spawn EPERM`, usar fallback estatico:

```powershell
npm.cmd run staff:static
```

Luego abrir `http://localhost:5174`.

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

- `NEXT_PUBLIC_API_URL=http://localhost:8000`

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
