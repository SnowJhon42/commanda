# COMANDA - Runbook Localhost (Windows)

Este documento aplica a trabajo local.

No confundir con el stack publico:

- backend live: `https://commanda-apy.onrender.com`
- cliente live: `https://comanda-cliente.vercel.app`
- staff live: `https://comanda-staff.vercel.app`

Este flujo levanta:

- backend: `http://localhost:8000`
- front cliente: `http://localhost:5173`
- front staff: `http://localhost:5174`

## 1) Abrir 3 terminales PowerShell

Prerequisito:
- Python **3.11 / 3.12 / 3.13** con `pip` funcionando (`python -m pip --version`)
- No usar Python 3.14 con los pins actuales del backend

Ruta recomendada de ejecucion:

- `C:\Users\agust\Desktop\COMANDA_LOCAL`

No correr desde OneDrive.

Atajo (abre 3 ventanas y lanza todo):
```powershell
cd C:\Users\agust\Desktop\COMANDA_LOCAL
powershell -ExecutionPolicy Bypass -File .\scripts\run_all_local.ps1
```

### Terminal 1 - Backend
```powershell
cd C:\Users\agust\Desktop\COMANDA_LOCAL
powershell -ExecutionPolicy Bypass -File .\scripts\run_backend_local.ps1
```

### Terminal 2 - Front Cliente
```powershell
cd C:\Users\agust\Desktop\COMANDA_LOCAL
powershell -ExecutionPolicy Bypass -File .\scripts\run_front_client_local.ps1
```

### Terminal 3 - Front Staff
```powershell
cd C:\Users\agust\Desktop\COMANDA_LOCAL
powershell -ExecutionPolicy Bypass -File .\scripts\run_front_staff_local.ps1
```

## 2) Verificaciones rápidas

- Health backend:
  - `http://localhost:8000/health`
- Front cliente:
  - `http://localhost:5173`
- Front staff:
  - `http://localhost:5174`

## 3) Login staff para probar

Usuarios seed (`store_id=1`, PIN `1234`):
- `admin`
- `kitchen`
- `bar`
- `waiter`

## 4) Test manual del flujo MVP

1. Abrir cliente (`:5173`) y verificar que cargue menú.
2. Crear un pedido (por ahora desde API/Postman también sirve):
   - `POST http://localhost:8000/orders`
3. Abrir staff (`:5174`) con `admin`.
4. Ver pedido y mover estados por sector:
   - `RECEIVED -> IN_PROGRESS -> DONE -> DELIVERED`
5. Consultar tracking:
   - `GET http://localhost:8000/orders/{order_id}`

## 5) Problemas conocidos

- Si queres diagnosticar cloud, usar `docs/DEPLOYED_STACK.md` y no este runbook.
- Si `npm` falla por policy de PowerShell, usar siempre `npm.cmd` (ya está en scripts).
- Si `python` de WindowsApps falla, usar un Python real (no alias de Store).
- `npm run dev` no se ejecuta en `comanda-backend` (no tiene `package.json`).
  - Cliente: correr en `comanda-front-client`
  - Staff: correr en `comanda-front-staff`
- Si aparece error de `pip` ausente:
  - reinstalar Python con opción `pip` habilitada
  - verificar con `python -m pip --version`
