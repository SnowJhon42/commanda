# Avance Tecnico Facturacion

Fecha: `2026-05-12`
Owner: `CTO-Agent`
Estado: `IN_PROGRESS`

## Objetivo

Dejar registro claro de:

- que parte del frente de facturacion ya quedo implementada en COMANDA
- que parte sigue siendo operativa/no fiscal
- que parte fiscal real falta todavia
- cual es el orden recomendado de los siguientes sprints

## Estado actual del frente

### Ya implementado

1. `IVA por producto`
   - cada producto ahora soporta `alicuota IVA`
   - opciones iniciales: `21%`, `10.5%`, `27%`, `0% / exento`
   - el precio se carga como `precio final`
   - COMANDA calcula automaticamente:
     - `neto sin IVA`
     - `IVA contenido`

2. `Vista fiscal automatica en editor de menu`
   - el owner/admin ve en el alta/edicion del producto:
     - precio final
     - neto
     - IVA
   - esto ya deja lista la base para cierres y comprobantes

3. `Precuenta no fiscal`
   - existe impresion de `precuenta`
   - incluye:
     - items
     - cantidades
     - precio unitario
     - importe
     - neto sin IVA
     - IVA contenido
     - total
   - sale con leyendas:
     - `DOCUMENTO NO VALIDO COMO FACTURA`
     - `NO VALIDO COMO CREDITO FISCAL`

4. `Borrador fiscal por pedido`
   - desde el detalle del pedido el admin puede abrir `Emitir factura`
   - puede cargar:
     - condicion fiscal del cliente
     - tipo de documento
     - numero
     - razon social o nombre
     - email
   - COMANDA guarda esos datos en el pedido
   - COMANDA sugiere:
     - `Factura A`
     - `Factura B`
     - `Factura C`
   - tambien marca si el pedido quedo `listo para emitir`

5. `Configuracion fiscal privada del local`
   - dentro de `Mi local` ya existe bloque privado para dueño/admin
   - el local ahora puede guardar:
     - `razon social`
     - `CUIT`
     - `condicion fiscal del emisor`
     - `punto de venta`
     - `email emisor`
   - esos datos quedan persistidos en backend
   - el sistema ahora muestra estado:
     - `no configurado`
     - `incompleto`
     - `listo para integrar`
   - esto deja preparado el perfil del emisor para el siguiente sprint

## Lo que esto significa

Hoy COMANDA ya separa mejor estas capas:

1. `Consumo`
2. `Cobro`
3. `Precuenta no fiscal`
4. `Borrador de factura`

Pero todavia `no emite comprobante fiscal real`.

Eso quiere decir:

- `si` hay base operativa y fiscal minima
- `no` hay aun integracion ARCA
- `no` hay CAE
- `no` hay envio formal de factura electronica emitida
- `no` hay nota de credito real

## Decision de alcance vigente

### Lo que SI es hoy

- modulo operativo de cuenta/cobro/comprobante no fiscal
- base de datos lista para evolucionar a factura real
- experiencia inicial de staff para preparar facturacion

### Lo que NO es hoy

- facturacion electronica ARCA completa
- modulo fiscal productivo final
- reemplazo completo de un POS fiscal maduro

## Riesgo actual mas importante

El principal riesgo ahora no es tecnico sino de confusion operativa:

- el equipo puede creer que `Emitir factura` ya genera una factura valida

Por eso debe quedar clarisimo en producto y en demo:

- `Precuenta` = comprobante no fiscal
- `Borrador fiscal` = datos listos para emitir
- `Factura real` = pendiente de integracion ARCA / motor fiscal real

## Sprints siguientes

## Sprint 1 cerrado parcialmente

Estado:

- `hecho en gran parte`

Objetivo:

- construir la base fiscal minima y el comprobante no fiscal

Incluye:

- IVA por producto
- calculo automatico neto/IVA
- precuenta no fiscal
- borrador fiscal por pedido

Pendiente chico dentro del sprint:

- documentacion fina de campos
- validaciones UX extra

## Sprint 2

Objetivo:

- `configuracion fiscal privada del local`

Estado:

- `arrancado`

Owner principal:

- `Backend-Agent`
- `Staff-Desktop-Agent`
- `Security-Agent`

Alcance:

- crear solapa privada solo para dueño/admin
- cargar datos fiscales del emisor:
  - razon social
  - CUIT
  - condicion fiscal del local
  - punto de venta
  - email emisor si aplica
- mostrar estado:
  - no configurado
  - incompleto
  - listo para integrar

Hecho en este momento:

- bloque privado agregado en `Mi local`
- persistencia backend de `razon social`, `CUIT` y `condicion fiscal`
- persistencia backend de `punto de venta` y `email emisor`
- lectura de esos datos desde staff/admin
- indicador visible de estado fiscal y faltantes

Pendiente dentro del sprint:

- endurecer validaciones de CUIT y permisos finos
- decidir si el `email emisor` sera tambien remitente tecnico o solo contacto operativo

Criterio de aceptacion:

- existe pantalla privada de configuracion fiscal
- nadie fuera de admin puede verla
- el local queda con perfil fiscal persistido y visible en borradores

No incluye:

- integracion ARCA real

## Sprint 3

Objetivo:

- `motor de comprobante fiscal interno`

Estado:

- `arrancado`

Owner principal:

- `Backend-Agent`

Alcance:

- crear entidad de comprobante fiscal
- guardar:
  - tipo sugerido A/B/C
  - estado
  - request payload
  - respuesta del emisor fiscal
  - fecha de emision
  - numero de comprobante
  - CAE si existiera
- separar estado:
  - borrador
  - listo para emitir
  - emitido
  - error
  - anulado

Hecho en este momento:

- existe entidad `fiscal_documents` separada de `orders`
- se vincula el pedido con su comprobante interno de tipo `INVOICE`
- al guardar el borrador fiscal del pedido se crea o actualiza el comprobante interno
- se guarda:
  - tipo sugerido
  - estado interno
  - punto de venta
  - request payload base
- el detalle admin/staff ya muestra el `comprobante interno`
- existe accion explicita para marcar el comprobante interno:
  - `READY_TO_ISSUE`
  - `ISSUED`
  - `ERROR`
  - `CANCELED`
- ya se pueden guardar manualmente:
  - numero de comprobante
  - CAE
  - vencimiento CAE
  - respuesta del emisor
  - detalle de error
- se endurecieron reglas de estado:
  - `READY_TO_ISSUE` y `ISSUED` exigen perfil fiscal del local completo
  - `ISSUED` exige numero, CAE y vencimiento de CAE
  - `ERROR` exige detalle del problema
  - un comprobante `ISSUED` ya no se puede anular desde este flujo interno

Pendiente dentro del sprint:

- guardar respuesta del emisor fiscal real
- validaciones de negocio mas estrictas por estado
- decidir si la numeracion la asigna COMANDA o solo la persiste desde ARCA/tercero

Criterio de aceptacion:

- existe modelo de comprobante separado del pedido
- el pedido puede quedar vinculado a un comprobante
- queda lista la traza para ARCA o tercero

No incluye:

- salida a produccion real contra ARCA

## Sprint 4

Objetivo:

- `integracion real de emision`

Estado:

- `arrancado`

Owner principal:

- `Backend-Agent`
- `Santiago (Infra-Ops-Agent)`
- `Security-Agent`

Dos caminos a decidir:

1. `ARCA directa`
2. `tercero / middleware fiscal`

Alcance:

- autenticacion
- emision real
- persistencia de respuesta
- CAE
- reintentos y errores basicos
- envio por email del comprobante emitido

Hecho en este momento:

- existe `proveedor de emision` configurable en `Mi local`
- opciones iniciales:
  - `MANUAL_DEMO`
  - `ARCA_DIRECT`
  - `EXTERNAL_API`
- existe servicio unico de emision en backend
- existe endpoint para `emitir comprobante`
- el primer proveedor operativo es `MANUAL_DEMO`
- `MANUAL_DEMO`:
  - emite internamente
  - genera numero demo
  - genera CAE demo
  - deja respuesta estructurada
  - marca explicitamente que `no tiene validez fiscal ante ARCA`

Pendiente dentro del sprint:

- implementar proveedor `ARCA_DIRECT`
- implementar proveedor `EXTERNAL_API`
- envio por email del comprobante emitido
- distinguir mejor `demo` vs `fiscal valido` en la UI final
- historial con reenvio y reimpresion real

Avance operativo nuevo:

- staff/admin ya tiene `Historial fiscal`
- permite filtrar por estado
- muestra:
  - proveedor
  - validez fiscal
  - tipo
  - numero
  - CAE
  - cliente
  - fecha de emision / actualizacion
- permite volver al pedido asociado
- al emitir un comprobante `ISSUED` se intenta autoenviar por mail al cliente
- desde `Historial fiscal` ya existe `Reenviar mail`
- si no hay SMTP configurado:
  - el envio queda `simulado/log`
  - no bloquea el flujo operativo

Criterio de aceptacion:

- un pedido listo para emitir puede transformarse en comprobante real
- queda guardado numero y CAE
- se puede reenviar por email

No incluye:

- todas las contingencias avanzadas

## Sprint 5

Objetivo:

- `post-emision y control fiscal`

Owner principal:

- `Backend-Agent`
- `Staff-Desktop-Agent`
- `QA-Agent`

Alcance:

- reimpresion
- historial de comprobantes
- filtro por tipo A/B/C
- nota de credito
- anulaciones correctas
- auditoria minima

Criterio de aceptacion:

- staff/admin puede revisar comprobantes emitidos
- las anulaciones no borran ventas
- la nota de credito queda vinculada al comprobante original

## Sprint 6

Objetivo:

- `cierres y reportes para contador`

Owner principal:

- `Backend-Agent`
- `Data-Agent`
- `QA-Agent`

Alcance:

- cierre con:
  - total vendido
  - neto
  - IVA
  - total por alicuota
  - cobros por medio de pago
  - ventas con factura
  - ventas sin comprobante fiscal emitido aun
- base para libro IVA ventas o export contable

Criterio de aceptacion:

- el contador puede leer un cierre simple
- existe corte entre `operativo`, `cobros` y `fiscal`

## Orden recomendado

El orden recomendado sigue siendo:

1. `solapa fiscal privada del local`
2. `modelo de comprobante fiscal`
3. `integracion de emision real`
4. `reimpresion y nota de credito`
5. `cierres y reportes contables`

No conviene saltear directo a ARCA sin cerrar antes:

- quien emite
- con que datos
- que estado queda guardado
- como se recupera un error

## Recomendacion CTO

Lo mas sano ahora es:

- no abrir todavia un boton que diga `Factura emitida`
- mantener la palabra `borrador fiscal` o `datos para factura`
- dejar el claim fuerte para cuando exista integracion real

## Archivos y codigo tocados en este avance

### Documentacion

- `docs/Facturacion/`

### Backend

- `comanda-backend/app/db/models/entities.py`
- `comanda-backend/app/db/runtime_schema.py`
- `comanda-backend/app/schemas/menu.py`
- `comanda-backend/app/schemas/orders.py`
- `comanda-backend/app/api/admin.py`
- `comanda-backend/app/api/menu.py`
- `comanda-backend/app/api/staff.py`

### Staff

- `comanda-front-staff/src/pages/MenuEditorPage.jsx`
- `comanda-front-staff/src/pages/OrderDetailPanel.jsx`
- `comanda-front-staff/src/utils/printTickets.js`
- `comanda-front-staff/src/api/staffApi.js`
- `comanda-front-staff/src/App.jsx`
