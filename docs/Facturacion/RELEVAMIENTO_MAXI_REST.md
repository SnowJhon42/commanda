# Relevamiento Maxi Rest

Fecha base: `2026-05-11`
Owner: `CTO-Agent`
Estado: `RESEARCH`

## Objetivo

Documentar las pantallas, comprobantes y flujos reales observados en MaxiRest para decidir que parte debe replicar COMANDA, que parte debe integrarse y que parte no debe prometerse todavia.

## Modulos clasificados

- Caja
- Ticket
- Precuenta
- Factura / comprobante fiscal
- Nota de credito
- Arqueo / cierre
- Reportes
- Maestro de clientes

## Capturas relevadas

### Imagen: `WhatsApp Image 2026-05-11 at 23.32.32.jpeg`

Pantalla: detalle de mesa / cuenta activa  
Modulo: caja + salon  
Objetivo operativo: operar el consumo de una mesa y disparar acciones comerciales o fiscales.  
Datos visibles:

- items consumidos
- cantidad
- precio unitario
- total
- promedio
- duracion
- estado visual de mesa controlada

Acciones visibles:

- sumar / restar
- borrar item
- reubicar
- incluir / invitar
- pendiente
- marchar
- observacion
- descuento
- anular
- transferir
- factura B
- fac. A elect
- fac. B elect
- fac. parcial

Reglas inferidas:

- la caja trabaja sobre la cuenta viva de la mesa
- desde la misma pantalla se emite comprobante
- existe separacion entre comprobante no fiscal operativo y comprobante fiscal
- el boton de tipo de factura depende de categoria IVA del cliente

Aplica a COMANDA:

- si
- la cuenta viva por mesa
- descuentos
- anulaciones con permisos
- selector del tipo de comprobante antes del cierre

No aplica por ahora:

- exceso de botones en una sola pantalla
- mezcla de operacion, fiscal y administracion en el mismo panel

Notas:

- para COMANDA conviene separar `cuenta`, `cobro` y `facturacion` en pasos claros.

### Imagen: `2.jpeg`

Pantalla: ticket de control del pedido  
Modulo: ticket / precuenta  
Objetivo operativo: imprimir un comprobante interno o comercial simple para mostrar consumo y total.  
Datos visibles:

- mesa
- fecha y hora
- mozo
- items
- subtotal
- descuento
- total
- leyenda `DOCUMENTO NO VALIDO COMO FACTURA`

Acciones visibles:

- no visibles en el papel; es una salida impresa

Reglas inferidas:

- existe un comprobante no fiscal separado del fiscal
- este papel sirve para control de mesa o entrega al cliente antes de facturar
- el texto final evita confundirlo con una factura valida ante ARCA

Aplica a COMANDA:

- si
- debe existir como `precuenta` o `ticket comercial no fiscal`

No aplica por ahora:

- ninguno

Notas:

- este documento es imprescindible aunque despues exista factura electronica.

### Imagen: `3.jpeg`

Pantalla: parte trasera / identificacion de impresora  
Modulo: hardware de impresion  
Objetivo operativo: relevar impresora termica usada para ticket no fiscal o soporte de impresion comercial.  
Datos visibles:

- modelo `LEX 850-USE`
- papel 80 mm
- conexiones `USB + Serial + Ethernet`
- protocolo `ESC/POS`

Acciones visibles:

- no aplica

Reglas inferidas:

- la impresora es una termica comun compatible con ESC/POS
- sirve para tickets operativos y comerciales simples
- no demuestra por si sola que sea impresora fiscal

Aplica a COMANDA:

- si
- para tickets internos, precuentas y posiblemente impresion de factura electronica ya autorizada

No aplica por ahora:

- asumir que la impresora resuelve cumplimiento fiscal sin software y sin autorizacion ARCA

Notas:

- buena señal para una primera etapa: COMANDA puede imprimir tickets 80 mm sin esperar integracion fiscal completa.

### Imagen: `4.jpeg`

Pantalla: factura B electronica impresa  
Modulo: comprobante fiscal  
Objetivo operativo: entregar comprobante fiscal valido al consumidor final.  
Datos visibles:

- razon social
- domicilio comercial
- CUIT
- ingresos brutos
- tipo de IVA: responsable inscripto
- numeracion `Fcb-0003`
- CAE
- fecha y hora
- items
- subtotal y total
- transparencia fiscal al consumidor
- IVA contenido

Acciones visibles:

- no visibles en el papel; es una salida final

Reglas inferidas:

- el comprobante fiscal ya sale con CAE autorizado
- al ser `Factura B Electronica`, el emisor es responsable inscripto y el receptor consumidor final
- se informa IVA contenido por regimen de transparencia fiscal

Aplica a COMANDA:

- si
- es el comprobante final minimo para RI vendiendo a consumidor final

No aplica por ahora:

- simplificarlo como un ticket cualquiera sin CAE, numeracion ni datos fiscales

Notas:

- este papel muestra con claridad que el negocio necesita dos capas distintas: una `comercial/operativa` y otra `fiscal`.

### Imagen: `5.jpeg`

Pantalla: nota de credito B electronica impresa  
Modulo: comprobante fiscal  
Objetivo operativo: revertir o anular una factura fiscal previa.  
Datos visibles:

- leyenda `Nota de Credito B Electronica`
- CAE
- numeracion `NCB`
- importe negativo referenciado contra una factura previa
- transparencia fiscal al consumidor

Acciones visibles:

- no visibles en el papel

Reglas inferidas:

- las anulaciones fiscales no se resuelven borrando ventas
- hace falta emitir nota de credito sobre comprobante previo
- la trazabilidad del comprobante original es obligatoria

Aplica a COMANDA:

- si
- al menos a nivel de modelo de datos y auditoria

No aplica por ahora:

- permitir al staff "borrar" una factura emitida como si nada

Notas:

- cualquier roadmap serio de facturacion debe incluir notas de credito desde el dia 1 del modulo fiscal.

### Imagen: `6.jpeg`

Pantalla: edicion de ventas  
Modulo: ventas / historial fiscal  
Objetivo operativo: listar comprobantes emitidos y operar anulaciones o reimpresiones.  
Datos visibles:

- listado de comprobantes
- tipo y numeracion
- caja
- mesa
- mozo
- total
- cobros
- vista previa del comprobante
- marca de comprobante `APLICADA`

Acciones visibles:

- nuevo
- editar
- imprimir
- anular

Reglas inferidas:

- existe un libro operativo de ventas y comprobantes
- la nota de credito queda vinculada al comprobante original
- hace falta reimpresion y consulta historica

Aplica a COMANDA:

- si
- historial de comprobantes y reimpresion

No aplica por ahora:

- pantalla tan densa para primera version

Notas:

- una vista de `ventas/comprobantes` en staff es necesaria para soporte operativo.

### Imagen: `7.jpeg`

Pantalla: movimientos de caja  
Modulo: arqueo / caja  
Objetivo operativo: registrar ingresos, egresos y saldo de caja.  
Datos visibles:

- fecha
- turno
- cajero
- punto de venta
- movimientos de ajuste
- recaudacion del turno
- egresos varios
- saldo de caja

Acciones visibles:

- rendicion
- ajustes de caja
- aporte de caja mayor
- aporte de bancos
- cobranza cuenta corriente
- pago a empleados
- gastos varios
- pago a proveedores
- retiros a bancos
- retiros a caja mayor

Reglas inferidas:

- la facturacion no vive sola; esta pegada a caja real
- los ingresos por ventas conviven con ajustes y egresos
- cierre y arqueo son parte central del sistema

Aplica a COMANDA:

- si
- la caja operativa debe existir antes o junto al modulo fiscal

No aplica por ahora:

- cubrir toda tesoreria del local en la primera iteracion

Notas:

- este modulo confirma que `facturar` sin `caja` deja el flujo incompleto.

### Imagen: `8.jpeg` y `9.jpeg`

Pantalla: busqueda / alta de cliente  
Modulo: maestro de clientes para facturacion  
Objetivo operativo: identificar al receptor del comprobante cuando no es simple consumidor final anonimo.  
Datos visibles:

- nombre y apellido
- telefono
- direccion
- localidad y provincia
- email
- tipo de documento
- razon social
- tipo IVA
- CUIT
- descuento

Acciones visibles:

- buscar
- alta nueva
- guardar

Reglas inferidas:

- antes de emitir factura A o una B nominada hace falta completar padrón de cliente
- `tipo IVA` y `CUIT` cambian el tipo de comprobante a emitir
- la capa fiscal necesita un maestro de clientes, no solo una mesa y un pedido

Aplica a COMANDA:

- si
- al menos version reducida con `razon social`, `tipo IVA`, `CUIT/DNI`, `email`

No aplica por ahora:

- ficha gigante de CRM completa

Notas:

- para COMANDA conviene un `modal de datos fiscales` corto y rapido, no una ficha interminable.

### Imagen: `10.jpeg`

Pantalla: resumen de ventas  
Modulo: reportes / cierre  
Objetivo operativo: consolidar ventas del turno por tipo de cobro y tipo de comprobante.  
Datos visibles:

- total vendido
- efectivo
- tarjetas
- otros
- factura B electronica
- nota de credito B electronica
- anulaciones
- descuentos
- salon
- neto 21%
- IVA 21%
- ventas por forma de cobro

Acciones visibles:

- no visibles en el papel

Reglas inferidas:

- el cierre separa cobro, comprobante y base imponible
- hace falta distinguir ventas netas, IVA y anulaciones
- la transparencia fiscal no es solo el ticket final; tambien impacta en reportes

Aplica a COMANDA:

- si
- reporte por turno y cierre por forma de pago

No aplica por ahora:

- reporteria demasiado extensa en la primera version

Notas:

- este resumen es la prueba de que `facturacion + caja + cierre` deben diseñarse juntos.

### Imagen: `11.jpeg`

Pantalla: totales del dia / movimientos de caja  
Modulo: arqueo / cierre diario  
Objetivo operativo: ver apertura, cierre, ingresos, egresos y saldo final.  
Datos visibles:

- sucursal
- condicion IVA `Resp. Inscripto`
- CUIT
- cierre numero
- apertura y cierre con usuario
- ingresos
- egresos
- subtotales
- saldo de caja

Acciones visibles:

- no visibles en el papel

Reglas inferidas:

- el usuario que abre/cierra caja queda auditado
- hay corte por turno con responsable
- el dato fiscal del emisor forma parte del cierre

Aplica a COMANDA:

- si
- auditoria de apertura/cierre por usuario

No aplica por ahora:

- detalle fino de todos los egresos si el producto aun no gestiona tesoreria completa

Notas:

- para un MVP util conviene llegar al menos a `apertura -> cobro -> cierre -> reporte`.

## Hallazgos consolidados

1. MaxiRest separa claramente `ticket no fiscal` de `factura fiscal`.
2. La categoria IVA del cliente cambia botones, flujo y tipo de comprobante.
3. La anulacion fiscal se resuelve con `nota de credito`, no borrando ventas.
4. El frente de facturacion real depende de `caja`, `maestro de clientes`, `cierres` y `reportes`.
5. Una impresora termica ESC/POS cubre bien tickets operativos, pero no reemplaza por si sola la capa fiscal.
6. Para COMANDA, el orden correcto sigue siendo:
   - precuenta / ticket no fiscal
   - cobro
   - datos fiscales del cliente
   - emision del comprobante correcto
   - reimpresion / nota de credito / cierre
