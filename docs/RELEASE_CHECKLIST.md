# COMANDA - Release Checklist

Owner: `Santiago (Infra-Ops-Agent)`
Ultima actualizacion: `2026-03-29`

## Objetivo

Tener un checklist corto y repetible para distinguir:
- cambio hecho,
- cambio subido,
- cambio desplegado,
- cambio validado.

## Estados validos

- `LOCAL_ONLY`
- `IN_GIT`
- `DEPLOYING`
- `DEPLOYED`
- `VERIFIED`

## Flujo standard

1. Implementar y probar en local.
2. Confirmar alcance del cambio.
3. Subir a GitHub.
4. Ejecutar deploy en plataforma correspondiente.
5. Validar URLs publicas.
6. Actualizar `docs/ONLINE_STACK.md` si cambio infraestructura, URL o proveedor.

## Checklist de salida

- Backend local responde en `http://localhost:8000/health`
- Cliente local abre en `http://localhost:5173`
- Staff local abre en `http://localhost:5174`
- Cambio identificado con owner y fecha
- Estado del cambio marcado
- Repo remoto actualizado
- Backend publico responde
- Cliente publico responde
- Staff publico responde
- Smoke test ejecutado si toca flujo de negocio

## Smoke test minimo online

- Cliente entra
- Cliente ve menu
- Cliente crea pedido
- Staff ve pedido
- Staff cambia estado
- Cliente ve tracking actualizado

## Formato de release log

```txt
Release ID:
Fecha:
Owner:
Cambio:

Estado:
- Local:
- GitHub:
- Deploy backend:
- Deploy cliente:
- Deploy staff:

Validacion:
- Backend:
- Cliente:
- Staff:
- E2E:

Notas:
```
