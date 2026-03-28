# COMANDA - Agent Server Runbook

Fecha de actualizacion: 2026-03-28

## Para quien es

Para agentes que trabajen sobre el stack live:

- Neon
- Render
- Vercel cliente
- Vercel staff

## Regla central

No asumir que un problema visible en frontend es de frontend.

Orden obligatorio de diagnostico:

1. confirmar commit en GitHub `main`
2. confirmar deployment activo en Vercel o Render
3. confirmar endpoint real fallido en `Network`
4. confirmar si el problema es codigo, deploy o datos

## Mapa rapido

Backend:

- `https://commanda-apy.onrender.com`

Cliente:

- `https://comanda-cliente.vercel.app`

Staff:

- `https://comanda-staff.vercel.app`

DB:

- Neon proyecto `comanda-demo`

## No hacer

- No ejecutar `init_postgres.py` para "copiar" el menu bueno a Neon.
- No tocar `CORS_ALLOW_ORIGINS` sin preservar cliente y staff Vercel.
- No redeployar Vercel a ciegas si Render sigue en un commit viejo.
- No diagnosticar "conexion" sin mirar `Network`.
- No mezclar decisiones desde `COMANDA_LOCAL` directo a cloud sin pasar por GitHub `main`.

## Si falla staff

### Caso A. Login falla

Verificar:

1. `GET https://commanda-apy.onrender.com/health`
2. `POST /auth/sector-login`
3. CORS para `https://comanda-staff.vercel.app`
4. bundle actual de staff publicado en Vercel

### Caso B. Mesas cargan pero pedidos no

Revisar `Network`:

- `GET /staff/table-sessions` puede dar `200`
- `GET /admin/orders` puede dar `500`

Ese escenario ya ocurrio.

No concluir "backend caido" por el mensaje rojo del frontend.

### Caso C. Deploy staff falla en Vercel

Revisar:

- version de `next`
- commit activo
- si el deploy actual es realmente `Current`

Version objetivo actual:

- `next@15.5.9`

## Si falla Render

### Caso A. Startup falla con `sqlite_master`

Causa:

- codigo de validacion SQLite ejecutado sobre Neon/Postgres

Fix ya aplicado:

- `a5ded0c` Make runtime schema validation Postgres-safe

### Caso B. `admin/orders` revienta con `500`

Causa vista:

- `print_status` faltante en algunos objetos admin

Fix ya aplicado:

- `ddf82e5` Harden admin order print status schema

## Si el cliente online se ve distinto al localhost

No asumir que Vercel quedo viejo.

Comparar:

- `http://localhost:8000/menu?store_id=1`
- `https://commanda-apy.onrender.com/menu?store_id=1`

Si local devuelve mas productos o imagenes y cloud no:

- el problema es Neon, no el frontend

## Procedimiento seguro para menu y Neon

1. confirmar que la SQLite buena es `C:\Users\agust\Desktop\COMANDA_LOCAL\comanda-backend\comanda_dev.db`
2. no correr seed minimo
3. usar script de sync:
   - `comanda-backend/scripts/sync_menu_sqlite_to_postgres.py`
4. validar `GET /menu?store_id=1`

## Procedimiento seguro para deploy

1. `git status`
2. `git push origin main`
3. Render:
   - verificar branch `main`
   - `Manual Deploy -> Deploy latest commit` si hace falta
4. Vercel:
   - confirmar commit desplegado
   - redeploy solo el deployment correcto

## Checklist de handoff entre agentes

Antes de terminar una sesion, dejar escrito:

- commit exacto en GitHub
- estado de Render
- estado de Vercel cliente
- estado de Vercel staff
- estado de Neon
- endpoint exacto que esta roto o validado
- siguiente paso recomendado

## Resumen ejecutivo vigente

- `COMANDA_LOCAL` fue promovida a `main`
- Neon menu remoto fue sincronizada con la base buena
- cliente publico ya consume menu con imagenes
- Render y Vercel deben leerse siempre contra `main`
- el repo operativo para cloud es `C:\Users\agust\OneDrive\Desktop\COMANDA`
