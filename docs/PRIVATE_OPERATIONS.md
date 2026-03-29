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
- `CORS_ORIGINS`
- `ENVIRONMENT`
- cualquier token de storage o integracion

## Regla

- Secretos: solo en gestor seguro o dashboard de la plataforma
- URLs publicas: si, pueden vivir en `docs/ONLINE_STACK.md`
- Dashboards privados: mantener fuera del repo o en referencia no sensible
