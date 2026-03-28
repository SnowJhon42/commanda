# COMANDA - Deployed Stack

Fecha de actualizacion: 2026-03-28

## Objetivo

Dejar una referencia unica del stack live para evitar confusiones entre:

- local SQLite
- `COMANDA_LOCAL`
- repo en OneDrive conectado a GitHub
- Neon / Render / Vercel

## URLs publicas

- Backend Render: `https://commanda-apy.onrender.com`
- Cliente Vercel: `https://comanda-cliente.vercel.app`
- Staff Vercel: `https://comanda-staff.vercel.app`

## Servicios cloud

### Backend

- Plataforma: Render
- Servicio: `commanda-apy`
- Repo: `SnowJhon42/commanda`
- Branch objetivo: `main`
- Root directory: `comanda-backend`

Variables importantes:

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `ENVIRONMENT`
- `CORS_ALLOW_ORIGINS`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_PUBLIC_HOST`

Valor esperado de `CORS_ALLOW_ORIGINS`:

```txt
https://comanda-cliente.vercel.app,https://comanda-staff.vercel.app
```

### Front cliente

- Plataforma: Vercel
- Proyecto: `comanda-cliente`
- Root directory: `comanda-front-client`
- Variable requerida:
  - `NEXT_PUBLIC_API_URL=https://commanda-apy.onrender.com`

### Front staff

- Plataforma: Vercel
- Proyecto: `comanda-staff`
- Root directory: `comanda-front-staff`
- Variable requerida:
  - `NEXT_PUBLIC_API_URL=https://commanda-apy.onrender.com`

### Base remota

- Plataforma: Neon
- Proyecto: `comanda-demo`
- Uso: DB remota principal para entorno publico

## Estado de datos

La DB remota Neon fue sincronizada con el menu bueno local.

Estado esperado del endpoint:

- `GET https://commanda-apy.onrender.com/menu?store_id=1`

Debe devolver:

- `9` categorias con `image_url`
- `28` productos
- variantes y datos visuales alineados con la SQLite buena

## Fuente de verdad por capa

Codigo cloud:

- GitHub `main`

Infraestructura:

- Render + Vercel

Datos publicos:

- Neon

Entorno local de comparacion:

- `C:\Users\agust\Desktop\COMANDA_LOCAL`

Repo operativo conectado a cloud:

- `C:\Users\agust\OneDrive\Desktop\COMANDA`

## Cambios recientes que impactan cloud

- `31ca614` Sync Neon menu data and patch Next.js
- `ddf82e5` Harden admin order print status schema
- `a5ded0c` Make runtime schema validation Postgres-safe

## Errores frecuentes ya vistos

### 1. Staff dice "No se pudo conectar con el backend"

No asumir que es red.

Ya paso que:

- `table-sessions` devolvia `200`
- `admin/orders` devolvia `500`
- la UI mostraba un mensaje generico de conexion

Siempre revisar `Network` antes de concluir.

### 2. Render falla al arrancar sobre Neon

No usar introspeccion SQLite (`sqlite_master`, `PRAGMA`) contra Postgres.

### 3. Vercel bloquea deploy por Next.js vulnerable

Mantener Next.js parcheado.

Version objetivo actual:

- `15.5.9`

### 4. Neon queda distinta del menu local

No correr `init_postgres.py` para copiar menu real.

Ese script solo carga seed minimo.

Para menu real usar:

- `comanda-backend/scripts/sync_menu_sqlite_to_postgres.py`

## Validacion minima despues de cada cambio

1. `GET /health` backend publico
2. Cliente abre menu con imagenes
3. Staff loguea con `admin / 1234`
4. `admin/orders?store_id=1` no devuelve `500`
5. Pedido creado por cliente aparece en staff
6. Staff cambia estado y cliente ve tracking
