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

## Operacion Local Unificada

Desde `C:\Users\agust\OneDrive\Desktop\COMANDA`:

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

- `C:\Users\agust\OneDrive\Desktop\COMANDA\comanda-backend\comanda_dev.db`

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
