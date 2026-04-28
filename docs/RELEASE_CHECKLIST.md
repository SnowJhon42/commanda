# COMANDA - Release Checklist

Owner: `Santiago (Infra-Ops-Agent)`
Ultima actualizacion: `2026-04-21`

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

## Release log actual

```txt
Release ID: MENU-IMPORT-IA-2026-04-08
Fecha: 2026-04-08
Owner: CTO-Agent -> Santiago (Infra-Ops-Agent)
Cambio: lector inteligente de carta con IA para staff, con borrador revisable y alta de productos al menu

Estado:
- Local: VERIFIED
- GitHub: IN_GIT
- Deploy backend: PENDING
- Deploy cliente: PENDING
- Deploy staff: PENDING

Validacion:
- Backend: http://localhost:8000/health responde 200
- Cliente: http://localhost:5173 responde 200 y muestra productos importados
- Staff: http://localhost:5174 responde 200 y permite importar carta
- E2E: staff importa carta -> revisa borrador -> crea productos -> cliente local los ve

Notas:
- Rama remota: sec-hardening-runtime-cut
- Commit de referencia: c163067
- Requiere OPENAI_API_KEY valida con billing/cuota activa en backend
- No esta desplegado aun en Render/Vercel
```

```txt
Release ID: CLIENT-NATIVE-SHARE-2026-04-21
Fecha: 2026-04-21
Owner: CTO-Agent -> Santiago (Infra-Ops-Agent)
Cambio: cierre de mesa del cliente prioriza share nativo del sistema en celular y deja WhatsApp como fallback

Estado:
- Local: VERIFIED
- GitHub: IN_GIT
- Deploy backend: NO_APLICA
- Deploy cliente: DEPLOYED
- Deploy staff: NO_APLICA

Validacion:
- Backend: no requiere cambios para este release
- Cliente: local usa `navigator.share` cuando el navegador lo soporta y cae a WhatsApp si no esta disponible
- Staff: no requiere cambios para este release
- E2E: deploy confirmado en Vercel; falta smoke test final en celular para marcar VERIFIED si se quiere evidencia funcional explicita

Notas:
- Rama remota: sec-hardening-runtime-cut
- Commit de referencia minimo: 7785f60
- Commit recomendado para deploy: 4433d3f
- Commit online confirmado en historial de Vercel: d20644d
- Archivo afectado principal: comanda-front-client/src/views/SessionClosedFeedbackPage.jsx
- Vercel cliente ya desplego commits que contienen el cambio (`4433d3f` y luego `d20644d`)
```
