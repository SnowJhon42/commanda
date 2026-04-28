# 015 - Restaurante cierre automatico y feedback unico

Fecha: 2026-04-27
Estado: LOCAL

## Resumen

Se agrego el cierre automatico de sesion cliente para `RESTAURANTE` cuando el pago ya esta confirmado y todos los items quedaron entregados. Ademas, el feedback de cierre ahora se acepta una sola vez y la pantalla final sigue disponible para compartir el local sin reenviar la opinion.

## Alcance

- backend
- client
- docs

## Archivos tocados

- `comanda-backend/app/api/billing.py`
- `comanda-backend/app/api/table_sessions.py`
- `comanda-front-client/src/App.jsx`
- `comanda-front-client/src/views/SessionClosedFeedbackPage.jsx`

## Validacion local

- `py_compile` de backend tocado
- backend correcto levantado en `http://localhost:8001/health`
- cliente levantado en `http://localhost:5173`

## Pendiente antes de subir

- validar punta a punta en restaurante:
  - pedir cuenta
  - confirmar pago desde staff
  - verificar salto automatico a feedback
  - enviar opinion una vez
  - compartir local despues del envio
