# SMTP Real Setup

Fecha: `2026-05-14`
Owner: `CTO-Agent`
Estado: `operativo a nivel codigo`

## Objetivo

Dejar claro como pasar de:

- `SIMULATED`

a

- `SMTP real`

para:

1. autoenviar comprobante al emitir
2. reenviar comprobante desde `Historial fiscal`

## Variables requeridas

Configurar en `comanda-backend/.env`:

```env
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=587
SMTP_USERNAME=tu_usuario
SMTP_PASSWORD=tu_password
SMTP_USE_TLS=true
SMTP_FROM_EMAIL=facturacion@tudominio.com
```

Template listo:

- [comanda-backend/.env.smtp.example](/C:/Users/agust/Desktop/COMANDA_LOCAL/comanda-backend/.env.smtp.example:1)

## Como funciona hoy

Si `SMTP_HOST` y `SMTP_FROM_EMAIL` existen:

- backend entra en modo `SMTP`
- intenta enviar mail real

Si faltan:

- backend queda en modo `SIMULATED`
- registra envio simulado/log
- no bloquea emision ni reenvio

## Donde se ve

En staff:

- `Historial fiscal`

Ahi se ve:

- `Mail fiscal: SMTP`
o
- `Mail fiscal: SIMULATED`

## Flujo actual

1. se emite comprobante
2. si el pedido tiene email fiscal del cliente
3. COMANDA intenta autoenviar mail
4. si falla, queda trazado error en el comprobante
5. desde `Historial fiscal` se puede usar `Reenviar mail`

## Advertencia operativa

`SMTP real` solo resuelve transporte de email.

No convierte por si solo un comprobante demo en factura fiscal valida.

La validez fiscal depende del proveedor de emision:

- `MANUAL_DEMO` -> no valida fiscalmente
- `ARCA_DIRECT` -> pendiente
- `EXTERNAL_API` -> pendiente

## Recomendacion CTO

Primera prueba real:

1. configurar SMTP
2. emitir comprobante `MANUAL_DEMO`
3. verificar llegada del mail
4. probar `Reenviar mail`
5. recien despues avanzar a proveedor fiscal real

## Checklist de prueba real

1. Copiar valores SMTP reales a `comanda-backend/.env`
2. Reiniciar backend
3. Ir a `Historial fiscal`
4. Confirmar que arriba diga:
   - `Mail fiscal: SMTP`
5. Abrir un pedido con email fiscal cargado
6. Emitir comprobante
7. Verificar:
   - mail recibido
   - estado `SENT`
   - contador de envios `1`
8. Tocar `Reenviar mail`
9. Verificar:
   - segundo mail recibido
   - contador de envios actualizado

## Que revisar si falla

- `SMTP_HOST` incorrecto
- puerto incorrecto
- usuario/password invalidos
- `SMTP_FROM_EMAIL` no autorizado por el proveedor
- TLS requerido pero apagado
- firewall o bloqueo saliente
