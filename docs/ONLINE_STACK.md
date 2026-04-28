# COMANDA - Online Stack

Ultima actualizacion: `2026-04-21`
Owner: `Santiago (Infra-Ops-Agent)`

## Objetivo

Evitar confusion entre:
- lo que existe solo en local,
- lo que ya fue subido a GitHub,
- lo que ya esta desplegado y accesible online.

Este archivo es la fuente de verdad operativa del entorno online.

## Mapa actual del stack

- Base de datos: `Neon`
- Backend publico: `https://commanda-apy.onrender.com`
- Front cliente publico: `https://comanda-cliente.vercel.app`
- Front staff publico: `https://comanda-staff.vercel.app`

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
- Render puede tener `DATABASE_URL`, CORS y otras variables que no existen en el repo
- El comportamiento de share en cliente depende del soporte real de `navigator.share` del navegador/celular; si no esta disponible, cae a WhatsApp como fallback

Esto no es un bug por si mismo, pero debe quedar explicitado cada vez que revisamos estado online.

## Cambio pendiente de verificacion

Estado online:
- DB: `DEPLOYED`
- Backend: `DEPLOYED`
- Cliente: `DEPLOYED` con posible drift funcional respecto de local
- Staff: `DEPLOYED`

Estado del cambio consultado:
- Local: `VERIFIED`
- GitHub: `IN_GIT`
- Deploy: `DEPLOYED`

Evidencia usada:
- archivo `comanda-front-client/src/views/SessionClosedFeedbackPage.jsx`
- rama `sec-hardening-runtime-cut`
- commits `7785f60` y `4433d3f`
- historial de deploys de Vercel con `4433d3f` y `d20644d`

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
