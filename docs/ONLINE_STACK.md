# COMANDA - Online Stack

Ultima actualizacion: `2026-05-11`
Owner: `Santiago (Infra-Ops-Agent)`

## Objetivo

Evitar confusion entre:
- lo que existe solo en local,
- lo que ya fue subido a GitHub,
- lo que ya esta desplegado y accesible online.

Este archivo es la fuente de verdad operativa del entorno online.

## Mapa actual del stack

- Base de datos canonica para Railway `dev`: `Railway Postgres`
- Base de datos legacy: `Neon` (pendiente de baja si se confirma que no se usa mas)
- Backend publico Railway enlazado desde CLI: `https://commanda-production.up.railway.app`
- Backend publico historico: `https://commanda-apy.onrender.com`
- Front cliente publico: `https://comanda-cliente.vercel.app`
- Front staff publico: `https://comanda-staff.vercel.app`

## Estado confirmado el 2026-05-11

- Railway CLI conectado al workspace `snowjhon42's Projects`
- Proyecto Railway: `comanda`
- Environment enlazado: `dev`
- Service enlazado: `commanda`
- `DATABASE_URL` de `commanda` en `dev` ya no apunta a `Neon`
- `DATABASE_URL` de `commanda` en `dev` ahora apunta a `Railway Postgres`
- Bootstrap demo ejecutado en `Railway Postgres`
- Healthcheck validado: `https://commanda-production.up.railway.app/health` -> `{"status":"ok"}`

## Seed actual en Railway Postgres dev

- tenant: `Comanda Demo`
- store: `Local Centro`
- mesas: `M1` a `M20`
- usuarios: `dueno`, `admin`, `kitchen`, `bar`, `waiter`
- pin demo: `1234`

## URLs canonicas para compartir

Cuando alguien pida "el Vercel de cliente" o "el Vercel de staff", compartir solo estas URLs:

- Cliente: `https://comanda-cliente.vercel.app`
- Staff: `https://comanda-staff.vercel.app`

No compartir como si fueran la app canonica:

- URLs de restaurantes puntuales
- links de pruebas
- previews de Vercel
- dominios que abren una tienda especifica por configuracion o seed

## Consolas privadas

No versionar links privados sensibles dentro de codigo operativo.
Si hace falta mantener una referencia manual, usar `docs/PRIVATE_OPERATIONS.md`.

## Regla de verdad

No asumir nunca que:
- un cambio local ya esta online,
- una variable local coincide con la de Vercel o Render,
- una URL documentada vieja sigue siendo la URL real.

Siempre distinguir entre 3 estados:
- `LOCAL_ONLY`: existe solo en la maquina local
- `IN_GIT`: ya esta subido al repo remoto
- `DEPLOYED`: ya esta reflejado en la URL publica

## Flujo obligatorio de cambio

1. Se desarrolla y prueba primero en local.
2. Se deja evidencia del cambio en el repo.
3. Se sube a GitHub.
4. Se despliega en Render y/o Vercel segun corresponda.
5. Se ejecuta smoke test sobre URLs publicas.
6. Se actualiza este archivo si cambio alguna URL, proveedor o estado operativo.

## Checklist minimo por release

- Backend local probado
- Cliente local probado
- Staff local probado
- Cambio subido a GitHub
- Backend online responde
- Cliente online responde
- Staff online responde
- Flujo E2E validado sobre entorno publico si el cambio toca negocio o integracion

Checklist detallado:

- `docs/RELEASE_CHECKLIST.md`

## Drift conocido hoy

- El repo local puede tener `.env.local` apuntando a `localhost`
- Vercel puede estar usando otra `NEXT_PUBLIC_API_URL`
- Render puede seguir vivo aunque el backend `dev` ya este en Railway
- La URL de Railway contiene `production` en el dominio, pero el environment enlazado hoy por CLI es `dev`
- `ENVIRONMENT=prod` sigue presente dentro del servicio Railway `dev`
- El comportamiento de share en cliente depende del soporte real de `navigator.share` del navegador/celular; si no esta disponible, cae a WhatsApp como fallback

Esto no es un bug por si mismo, pero debe quedar explicitado cada vez que revisamos estado online.

## Cambio pendiente de verificacion

Estado online:
- DB Railway dev: `DEPLOYED`
- DB Neon legacy: `ACTIVE` pero fuera del flujo objetivo
- Backend Railway dev: `DEPLOYED`
- Backend Render legacy: `UNKNOWN`
- Cliente: `DEPLOYED` con posible drift funcional respecto de local
- Staff: `DEPLOYED`

Estado del cambio consultado:
- Local: `VERIFIED`
- GitHub: `NO_VERIFIED`
- Deploy Railway dev: `DEPLOYED`
- Smoke E2E publico: `PENDING`

Evidencia usada:
- Railway CLI `status`
- Railway CLI `variable list`
- Railway Postgres bootstrap ejecutado desde `comanda-backend/scripts/bootstrap_postgres.py`
- lectura de seed via `comanda-backend/scripts/list_restaurant_access.py`
- healthcheck `https://commanda-production.up.railway.app/health`

## Como responder a la pregunta "esto ya esta en servidor?"

Responder con este formato:

```txt
Estado online:
- DB:
- Backend:
- Cliente:
- Staff:

Estado del cambio consultado:
- Local:
- GitHub:
- Deploy:

Evidencia usada:
- archivo / URL / smoke test / dashboard
```

## Nota de seguridad

Las URLs publicas se pueden documentar en repo.
Los links privados de dashboard y credenciales no deben quedar hardcodeados en archivos versionados.

## Endurecimiento minimo recomendado

- Staff en Vercel protegido con Basic Auth via `STAFF_APP_BASIC_AUTH_USER` y `STAFF_APP_BASIC_AUTH_PASSWORD`
- Backend con `ENVIRONMENT=prod`, `JWT_SECRET_KEY` no default y `CORS_ALLOW_ORIGINS` limitado a dominios reales
- No compartir previews ni URLs temporales con terceros
- Rotar secretos expuestos en sesiones operativas antes de cerrar release
