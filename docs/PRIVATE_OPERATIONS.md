# COMANDA - Private Operations Template

Owner: `Santiago (Infra-Ops-Agent)`
Ultima actualizacion: `2026-03-29`

## Uso

Este archivo existe como plantilla operativa.
No completar secretos en un archivo versionado.

Guardar esta misma estructura en una nota privada, password manager o workspace no publico.

## Consolas

- Neon project:
  - nombre:
  - url dashboard:
  - owner:

- Render backend:
  - nombre servicio:
  - url dashboard:
  - url publica:

- Vercel cliente:
  - nombre proyecto:
  - url dashboard:
  - url publica:

- Vercel staff:
  - nombre proyecto:
  - url dashboard:
  - url publica:

## Variables criticas

- `DATABASE_URL`
- `NEXT_PUBLIC_API_URL`
- `CORS_ALLOW_ORIGINS`
- `CORS_ALLOW_ORIGIN_REGEX`
- `STAFF_APP_BASIC_AUTH_USER`
- `STAFF_APP_BASIC_AUTH_PASSWORD`
- `ENVIRONMENT`
- cualquier token de storage o integracion

## Privacidad minima para staff publico

- Si el front staff vive en Vercel con URL publica, protegerlo con `STAFF_APP_BASIC_AUTH_USER` y `STAFF_APP_BASIC_AUTH_PASSWORD`
- No compartir previews de Vercel
- Mantener repo privado
- No guardar secretos en `.env` versionado
- Confirmar `JWT_SECRET_KEY` fuerte en backend productivo

## Regla

- Secretos: solo en gestor seguro o dashboard de la plataforma
- URLs publicas: si, pueden vivir en `docs/ONLINE_STACK.md`
- Dashboards privados: mantener fuera del repo o en referencia no sensible
