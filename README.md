# COMANDA Monorepo

Monorepo de COMANDA con tres aplicaciones:

- `comanda-backend` - FastAPI
- `comanda-front-client` - Next.js
- `comanda-front-staff` - Next.js

## Estado operativo actual

Infraestructura publica activa:

- Backend Render: `https://commanda-apy.onrender.com`
- Cliente Vercel: `https://comanda-cliente.vercel.app`
- Staff Vercel: `https://comanda-staff.vercel.app`
- DB remota Neon: proyecto `comanda-demo`

Estado de trabajo local:

- Fuente local historica: `C:\Users\agust\Desktop\COMANDA_LOCAL`
- Repo conectado a GitHub y despliegue: `C:\Users\agust\OneDrive\Desktop\COMANDA`

Regla practica:

- El codigo que llega a Render y Vercel sale de este repo (`OneDrive\Desktop\COMANDA`) via `main`.
- `COMANDA_LOCAL` puede usarse para probar o comparar, pero no es el origen directo de deploy.

## Fuente de verdad

La fuente de verdad para cloud hoy es:

1. GitHub `main`
2. Render backend
3. Vercel client + staff
4. Neon para datos remotos

No asumir que la DB local y Neon son iguales.
No asumir que un cambio en `COMANDA_LOCAL` toca Neon automaticamente.

## Documentacion clave

- `docs/DEPLOYED_STACK.md`
- `docs/AGENT_SERVER_RUNBOOK.md`
- `docs/LOCALHOST_RUNBOOK.md`
- `docs/API_OPENAPI_MVP.md`
- `AGENTS.md`

## Operacion local

No ejecutar COMANDA desde OneDrive para desarrollo intensivo. El script local ya bloquea eso.

Ruta recomendada:

- `C:\Users\agust\Desktop\COMANDA_LOCAL`

Levantar stack local:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 restart
```

Validaciones:

- backend: `http://localhost:8000/health`
- cliente: `http://localhost:5173`
- staff: `http://localhost:5174`

## Deploy cloud

### Render

- Servicio: `commanda-apy`
- Branch: `main`
- Root directory: `comanda-backend`

### Vercel

Cliente:

- Proyecto: `comanda-cliente`
- Root directory: `comanda-front-client`
- `NEXT_PUBLIC_API_URL=https://commanda-apy.onrender.com`

Staff:

- Proyecto: `comanda-staff`
- Root directory: `comanda-front-staff`
- `NEXT_PUBLIC_API_URL=https://commanda-apy.onrender.com`

### CORS backend

Valor actual esperado en Render:

```txt
https://comanda-cliente.vercel.app,https://comanda-staff.vercel.app
```

## Neon y menu remoto

La data remota de menu ya no debe regenerarse con `init_postgres.py` si lo que se quiere es copiar el menu real.

`init_postgres.py` carga solo seed minimo.

Para sincronizar menu real desde la SQLite buena hacia Neon usar:

- `comanda-backend/scripts/sync_menu_sqlite_to_postgres.py`

Ese script se penso para copiar:

- `menu_categories`
- `products`
- `product_variants`

## Ultimos fixes relevantes de cloud

- `31ca614` Sync Neon menu data and patch Next.js
- `ddf82e5` Harden admin order print status schema
- `a5ded0c` Make runtime schema validation Postgres-safe

## Riesgos conocidos

- Render free puede dormir el backend y meter latencia de arranque.
- Vercel puede quedar atras si no se redeploya despues de cambios criticos.
- Neon puede quedar desalineada respecto de SQLite local si no se sincroniza explicitamente.
- El panel staff puede fallar por errores de backend y mostrar mensajes de red engañosos.

## Regla para agentes

Antes de tocar cloud:

1. Leer `docs/DEPLOYED_STACK.md`
2. Leer `docs/AGENT_SERVER_RUNBOOK.md`
3. Verificar branch, commit y plataforma antes de diagnosticar

No improvisar seeds ni cambios de DB remota sobre Neon sin documentarlos.
