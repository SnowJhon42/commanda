# Investigacion - facturacion, cajas y resiliencia operativa

Fecha: `2026-04-21`
Owner: `CTO-Agent`
Estado: `RESEARCH`

## Preguntas de negocio

1. ¿COMANDA necesita sistema de caja y facturacion propio?
2. ¿Conviene integrarse con MaxiRest?
3. ¿Que pasa sin luz o sin internet?
4. ¿Hace falta vista de plano del local?

## Estado actual de COMANDA

Hoy COMANDA resuelve principalmente:

- toma de pedidos
- tracking
- vista staff
- flujo web cliente/staff

El repo no muestra una capa real de:

- caja operativa
- cierre de turno
- arqueo
- medios de pago conciliados
- facturacion fiscal ARCA/AFIP
- contingencia offline productiva

Ademas, la referencia online actual del proyecto sigue siendo cloud:

- backend publico en Render
- fronts en Vercel
- DB en Neon

Eso sirve para demo y validacion, pero no es una arquitectura "a prueba de todo" para operacion de salon.

## Hallazgos sobre MaxiRest

Segun la documentacion publica revisada el `2026-04-21`, MaxiRest ya cubre:

- plano de salon y mesas
- caja
- cobro en salon y mostrador
- facturacion electronica
- cierres X/Z
- operacion local en ciertos productos
- integraciones habilitadas por ellos

Tambien aparece `Maxilink` / `MaxiMAPI` como mecanismo de integracion de partners.

No encontre documentacion publica de una API abierta general de MaxiRest tipo:

- portal de developers
- especificacion REST publica
- credenciales self-service para terceros

La evidencia publica apunta mas a un modelo de integraciones cerradas o habilitadas comercialmente por MaxiRest.

## Conclusion de factibilidad

### 1. Sistema de facturacion propio dentro de COMANDA

`Si se puede`, pero no conviene como siguiente paso inmediato.

Motivos:

- Es bastante mas grande que "emitir una factura".
- Requiere puntos de venta, CAE/CAEA, certificados, QR fiscal, numeracion, tipos de comprobante, notas de credito, validaciones impositivas y soporte operativo real.
- Tambien requiere caja, medios de pago, cierres, arqueos, permisos y auditoria.
- Si ademas se quiere contingencia sin internet, hay que disenar sincronizacion y recuperacion de errores.

Conclusion:

- Es una linea de producto aparte.
- No deberia entrar en el MVP principal sin cliente pagador que lo exija.

### 2. Integracion con MaxiRest

`Posible, pero no garantizada`.

Lo mas realista hoy es asumir:

- no hay API publica abierta confirmada
- probablemente haga falta alta comercial o tecnica con MaxiRest
- probablemente exista integracion por partner o middleware propio de ellos

Conclusion:

- `Si`: vale la pena explorarla.
- `No`: no la daria por hecha hasta hablar con MaxiRest y pedir definicion tecnica concreta.

## Necesidad real por prioridad

### Prioridad alta

- caja simple por servidor o caja fija
- estado de cobro por mesa/pedido
- medios de pago
- cierre de turno
- reporte de ventas y cobros
- contingencia operativa sin internet

### Prioridad media

- plano visual del salon
- asignacion de mesas por mozo
- impresoras / comanderas por sector

### Prioridad baja por ahora

- facturacion fiscal completa propia
- integracion bidireccional profunda con ERP/POS externo

## Respuesta operativa a los riesgos

### Si me quedo sin internet

Objetivo razonable:

- el local debe seguir tomando pedidos y cobrando localmente
- la sincronizacion con nube puede quedar diferida

Arquitectura recomendada:

- un `servidor-caja` local en el negocio
- red LAN interna cerrada
- cliente y staff hablando primero con ese servidor local
- sincronizacion hacia nube cuando vuelva internet

Esto `si se puede` hacer, pero implica:

- base local durable
- colas de sincronizacion
- ids idempotentes
- reintentos
- resolucion de conflictos

### Si me quedo sin luz

Sin energia `no hay software que lo arregle solo`.

Lo correcto es combinar software + hardware:

- UPS para servidor-caja
- UPS para router/switch
- al menos una terminal critica con bateria
- procedimiento de contingencia corto

Objetivo realista:

- 10 a 30 minutos de continuidad minima
- o al menos apagado limpio sin corrupcion

### Si se cae la caja principal

Recomendado:

- backup local automatico
- restore rapido
- segundo dispositivo listo para reemplazo
- runbook simple de recuperacion

## Recomendacion CTO

Orden recomendado:

1. No construir facturacion fiscal propia ahora.
2. Diseñar primero `caja operativa + cobro + cierre de turno`.
3. Diseñar COMANDA para `modo local/LAN` con `servidor-caja`.
4. Agregar `plano de salon` si el modelo es restaurante con mesas.
5. Abrir investigacion comercial/tecnica con MaxiRest para validar si existe integracion partner real.
6. Si MaxiRest no abre integracion clara, separar decisiones:
   - COMANDA como capa operativa
   - POS/facturacion fiscal externa como sistema maestro

## Decision recomendada hoy

### Lo que yo haria

- `Fase 1`: caja simple no fiscal dentro de COMANDA
- `Fase 2`: arquitectura local-first para operar en LAN
- `Fase 3`: plano de mesas
- `Fase 4`: discovery tecnico con MaxiRest
- `Fase 5`: decidir si conviene integracion o seguir desacoplados

### Lo que no haria todavia

- prometer facturacion AFIP/ARCA propia
- prometer integracion MaxiRest por API key sin confirmacion oficial
- vender el sistema como "a prueba de cortes" sin UPS y modo LAN real

## Datos que faltan confirmar

Para bajar esto a plan ejecutable, faltan 5 definiciones del negocio:

1. ¿Quieren solo tomar pedidos o tambien cobrar dentro de COMANDA?
2. ¿Necesitan factura fiscal desde COMANDA o alcanza con integrar/cerrar en otro sistema?
3. ¿El local objetivo es salon con mesas o mostrador/delivery?
4. ¿Cuantas cajas/puestos simultaneos necesita un local?
5. ¿Quieren seguir usando MaxiRest en paralelo o reemplazarlo?

## Siguiente paso sugerido

Abrir un mini discovery de 3 frentes:

- `Producto`: flujo real de caja, cobro y cierre
- `Infra`: arquitectura local-first con LAN + UPS
- `Partners`: contacto formal con MaxiRest para confirmar integracion

## Fuentes revisadas

- Repo COMANDA: `docs/ONLINE_STACK.md`
- Repo COMANDA: `docs/LOCALHOST_RUNBOOK.md`
- MaxiRest Point - Introduccion
- MaxiRest - Requisitos tecnicos
- MaxiRest - Salon y Mostrador
- MaxiRest - Facturacion electronica
- MaxiRest - Integraciones
- ARCA/AFIP - Factura electronica
- ARCA/AFIP - Webservices de factura electronica
