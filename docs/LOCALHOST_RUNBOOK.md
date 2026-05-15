# COMANDA - Runbook Localhost (Windows)

Stack local oficial:
- backend: `http://localhost:8001`
- front cliente: `http://localhost:5173`
- front staff: `http://localhost:5174`

Workspace oficial:
- `C:\Users\agust\Desktop\COMANDA_LOCAL`

DB local oficial:
- `C:\Users\agust\Desktop\COMANDA_LOCAL\comanda-backend\comanda_dev.db`

No ejecutar COMANDA desde `OneDrive`.
No iniciar la API desde la raiz del repo con SQLite relativa: existe un `comanda_dev.db` adicional en `C:\Users\agust\Desktop\COMANDA_LOCAL\comanda_dev.db` que no es la fuente oficial.

## 1) Script oficial de arranque

Prerequisito:
- Python **3.11 / 3.12 / 3.13** con `pip` funcionando (`python -m pip --version`)
- No usar Python 3.14 con los pins actuales del backend

Arranque recomendado:
```powershell
cd C:\Users\agust\Desktop\COMANDA_LOCAL
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 -Action up
```

Ese script fuerza backend en `8001` y `DATABASE_URL` hacia `comanda-backend/comanda_dev.db`, aunque exista otra configuracion en `.env`.
Tambien debe dejar `backend.pid`, `front-client.pid` y `front-staff.pid` dentro de `logs`.

Atajos oficiales:
```powershell
.\scripts\run_all_local.ps1
.\scripts\stop_all_local.ps1
.\scripts\status_all_local.ps1
.\scripts\restart_all_local.ps1
.\scripts\logs_all_local.ps1
.\scripts\doctor_all_local.ps1
```

Alias compatibles:

- `start-local-stable.bat`
- `.\scripts\start_local_stable.ps1`

Ambos delegan en `comanda_local.ps1` y no deben crear un segundo flujo de arranque.

Fallback estable para backend cuando no quede vivo en segundo plano:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backend_foreground_local.ps1
```

Dejar esa ventana abierta mientras se usa COMANDA.

## 2) Verificaciones rápidas

- Health backend:
  - `http://localhost:8001/health`
- Front cliente:
  - `http://localhost:5173`
- Front staff:
  - `http://localhost:5174`
- PIDs esperados:
  - `logs/backend.pid`
  - `logs/front-client.pid`
  - `logs/front-staff.pid`

## 3) Login staff para probar

Usuarios seed (`store_id=1`, PIN `1234`):
- `admin`
- `kitchen`
- `bar`
- `waiter`
- `dueno_local` / PIN `4321` si existe en la DB actual

## 4) Test manual del flujo MVP

1. Abrir cliente (`:5173`) y verificar que cargue menú.
2. Crear un pedido (por ahora desde API/Postman también sirve):
   - `POST http://localhost:8001/orders`
3. Abrir staff (`:5174`) con `admin`.
4. Ver pedido y mover estados por sector:
   - `RECEIVED -> IN_PROGRESS -> DONE -> DELIVERED`
5. Consultar tracking:
   - `GET http://localhost:8001/orders/{order_id}`

## 5) Problemas conocidos

- Si `npm` falla por policy de PowerShell, usar siempre `npm.cmd` (ya está en scripts).
- Si `python` de WindowsApps falla, usar un Python real (no alias de Store).
- No mezclar `scripts/run_public_demo.ps1` con desarrollo local normal. Ese flujo usa URLs publicas temporales y debe cerrarse con `scripts/stop_public_demo.ps1` antes de volver a localhost.
- Valor local esperado en ambos `.env.local`: `NEXT_PUBLIC_API_URL=/api-proxy`
- Target interno del proxy local: `BACKEND_PROXY_TARGET=http://127.0.0.1:8001`
- Si aparece error de `pip` ausente:
  - reinstalar Python con opción `pip` habilitada
  - verificar con `python -m pip --version`
- Si hay dudas sobre la DB que usa el backend:
  - primero usar el script oficial `comanda_local.ps1`
  - despues revisar `comanda-backend/.env`
  - confirmar `DATABASE_URL`
  - usar `docs/DB_SOURCE_OF_TRUTH.md`
