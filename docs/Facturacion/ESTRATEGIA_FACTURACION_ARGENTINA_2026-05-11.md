# Estrategia Facturacion Argentina

Fecha: `2026-05-11`
Owner: `CTO-Agent`
Estado: `RESEARCH`

## Objetivo

Definir como deberia resolver COMANDA la facturacion para restaurantes de Argentina sin mezclar tickets operativos con comprobantes fiscales y sin prometer mas de lo que hoy conviene construir.

## Punto de partida

Hay dos necesidades distintas:

1. `Comprobante operativo/no fiscal`
   - precuenta
   - ticket de control
   - ticket comercial simple
   - comprobante de cobro interno

2. `Comprobante fiscal real`
   - Factura B para consumidor final cuando el emisor es responsable inscripto
   - Factura A para responsable inscripto o monotributista cuando corresponde
   - Factura C si el emisor es monotributista
   - Nota de credito para anular o revertir una factura emitida

Si COMANDA mezcla ambas capas, se vuelve riesgoso operativa y legalmente.

## Lo que muestran las capturas

- MaxiRest usa un `ticket no valido como factura` para control o precuenta.
- Despues emite una `Factura B Electronica` real con CAE.
- La anulacion fiscal se hace con `Nota de Credito B Electronica`.
- El flujo fiscal cuelga de una caja viva, de un maestro de clientes y de cierres por turno.
- El tipo IVA del cliente es parte del flujo, no un dato decorativo.

## Normativa y reglas actuales verificadas

Fecha de verificacion web: `2026-05-11`

### 1. Tipos de comprobante segun condicion fiscal

Segun ARCA:

- `Responsable inscripto -> consumidor final / exento`: comprobante `B`
- `Responsable inscripto -> monotributista`: comprobante `A`
- `Responsable inscripto -> responsable inscripto`: comprobante `A`
- `Monotributista / exento -> cualquier receptor local`: comprobante `C`

### 2. Modalidades habilitadas

ARCA permite:

- `facturacion electronica`
- `controlador fiscal de nueva tecnologia`
- o ambas en conjunto

Para COMANDA, la opcion mas razonable es priorizar `facturacion electronica` y no depender de hardware fiscal especial en la primera etapa.

### 3. Consumidor final

ARCA informa que el comprobante a consumidor final debe llevar la leyenda `A CONSUMIDOR FINAL`.

Ademas, al `2026-05-11`, ARCA publica que si el importe de la operacion es igual o superior a `$10.000.000`, deben informarse datos identificatorios como `CUIT/CUIL/CDI o DNI`.

### 4. Transparencia fiscal al consumidor

La RG `5614/2024` implementa el regimen de transparencia fiscal al consumidor.

Esto impacta directamente en restaurantes responsables inscriptos porque en el comprobante final al consumidor debe mostrarse el `IVA contenido` y, cuando corresponda, `Otros Impuestos Nacionales Indirectos`.

Las capturas de MaxiRest muestran esto mismo en la parte inferior de la factura.

### 5. Notas de credito

Las notas de credito deben estar vinculadas al comprobante original. No corresponde "borrar" una factura fiscal emitida como si no hubiera existido.

## Decision CTO recomendada

### Lo que no haria ahora

- no construir primero una `facturacion ARCA completa end-to-end` como si fuera una mejora chica
- no emitir un "ticket lindo" haciendolo pasar por factura
- no depender de una impresora termica comun como si resolviera cumplimiento fiscal
- no dejar el cambio de categoria IVA solo como una opcion visual del front

### Lo que si haria

#### Fase 1. Caja y comprobantes operativos

Construir dentro de COMANDA:

- precuenta
- ticket no fiscal
- registro de cobro
- cierre de mesa
- apertura / cierre de caja
- reporte simple por turno

Esto da valor inmediato y ordena el producto.

#### Fase 2. Base fiscal minima

Agregar estructuras para:

- datos fiscales del emisor por local
- puntos de venta
- condicion IVA del cliente
- razon social / CUIT / DNI / email
- tipo de comprobante esperado
- numeracion y estado del comprobante
- relacion entre factura y nota de credito

Todavia sin prometer toda la emision en produccion.

#### Fase 3. Emision fiscal real

Dos caminos posibles:

1. `Integracion directa con ARCA`
   - mayor control
   - mayor complejidad tecnica y operativa
   - requiere certificados, autenticacion, manejo de CAE/CAEA, contingencia, reintentos y auditoria

2. `Integracion con tercero/POS`
   - salida mas rapida si el partner ya resuelve normativa y soporte
   - menos control sobre UX y dependencias comerciales

Mi recomendacion hoy es:

- diseñar COMANDA para soportar ambos caminos
- no casarse aun con uno solo hasta definir cliente pagador y volumen

## Arquitectura de producto sugerida

### Separacion obligatoria

COMANDA deberia tener 4 capas:

1. `Cuenta`
   - items consumidos
   - descuentos
   - invitados
   - parciales

2. `Cobro`
   - medio de pago
   - monto
   - fecha
   - operador

3. `Comprobante operativo`
   - precuenta
   - ticket no fiscal
   - recibo interno

4. `Comprobante fiscal`
   - tipo A/B/C
   - CAE
   - numero
   - vencimiento CAE si aplica
   - estado emitido/anulado
   - nota de credito relacionada

### Flujo recomendado en staff

1. Abrir cuenta de mesa
2. Consolidar consumos
3. Pedir datos fiscales solo si hacen falta
4. Elegir tipo de salida:
   - precuenta
   - cobrar sin factura inmediata
   - emitir factura
5. Registrar cobro
6. Emitir comprobante fiscal si corresponde
7. Reimprimir o emitir nota de credito si hay reversa
8. Cerrar caja y turno

## Boton de IVA / condicion fiscal que hoy falta

Segun las capturas y la normativa, ese boton no es cosmético. Define:

- si el cliente queda como consumidor final o identificado
- si corresponde factura A, B o C
- si hay que pedir CUIT y razon social
- si la interfaz debe exigir datos fiscales antes de emitir

Conclusion:

- ese boton o selector debe existir
- pero no como un switch suelto
- debe vivir dentro de un bloque `Datos fiscales del receptor`

## Riesgos principales

### Riesgo 1. Confundir ticket con factura

Impacto:

- alto
- riesgo comercial y fiscal

Mitigacion minima:

- leyenda explicita `Documento no valido como factura` en todo ticket no fiscal
- separar botones y estados

### Riesgo 2. Modelar solo consumidor final

Impacto:

- alto
- bloquea restaurantes que necesitan A/B/C segun receptor

Mitigacion minima:

- modelo de cliente fiscal y condicion IVA desde la primera iteracion del modulo

### Riesgo 3. No contemplar nota de credito

Impacto:

- alto
- rompe anulaciones reales

Mitigacion minima:

- disenar entidad de comprobante con referencias al comprobante original

### Riesgo 4. Meter ARCA en el MVP sin caja

Impacto:

- alto
- complejiza soporte antes de ordenar operacion

Mitigacion minima:

- secuenciar: caja y cobro primero; emision fiscal despues

## Tareas recomendadas

```txt
Tarea ID: FAC-001
Owner: CTO-Agent
Objetivo: definir alcance fiscal minimo de COMANDA
Contexto: el producto necesita distinguir ticket no fiscal de comprobante fiscal
Alcance: decision de fases, tipos de comprobante y riesgos
Criterio de aceptacion: documento de alcance aprobado
No incluye: implementacion tecnica
Dependencias: ninguna
Entrega esperada: estrategia validada
```

```txt
Tarea ID: FAC-002
Owner: Staff-Desktop-Agent
Objetivo: disenar flujo de cuenta -> cobro -> datos fiscales -> comprobante
Contexto: hoy no existe frente de caja/facturacion claro en staff
Alcance: UX y pantallas de staff
Criterio de aceptacion: wireflow navegable y estados definidos
No incluye: integracion ARCA real
Dependencias: FAC-001
Entrega esperada: propuesta visual/funcional
```

```txt
Tarea ID: FAC-003
Owner: Backend-Agent
Objetivo: modelar entidades de caja, cobro y comprobante
Contexto: hoy el backend cubre pedidos pero no contabilidad operativa/fiscal
Alcance: schema inicial y contratos internos
Criterio de aceptacion: modelo soporta ticket no fiscal, factura y nota de credito
No incluye: WS fiscal productivo
Dependencias: FAC-001
Entrega esperada: propuesta de modelo y endpoints
```

```txt
Tarea ID: FAC-004
Owner: Security-Agent
Objetivo: revisar riesgos de emision fiscal y datos sensibles
Contexto: el modulo tratara CUIT, razon social y operaciones de caja
Alcance: riesgos de abuso, fraude interno, anulaciones y exposicion de datos
Criterio de aceptacion: checklist de release y bloqueos criticos definidos
No incluye: hardening total de infraestructura
Dependencias: FAC-001, FAC-003
Entrega esperada: informe de seguridad
```

```txt
Tarea ID: FAC-005
Owner: Santiago (Infra-Ops-Agent)
Objetivo: decidir camino de integracion fiscal real
Contexto: falta definir si COMANDA ira directo con ARCA o via tercero
Alcance: discovery tecnico/comercial
Criterio de aceptacion: matriz comparativa con costo, riesgo y soporte
No incluye: contrato comercial cerrado
Dependencias: FAC-001
Entrega esperada: recomendacion de integracion
```

## Fuentes

- ARCA - tipos de comprobantes: https://www.arca.gob.ar/facturacion/regimen-general/comprobantes.asp
- ARCA - modalidades de emision: https://www.arca.gob.ar/facturacion/regimen-general/modalidades.asp
- ARCA - factura electronica vs controlador fiscal: https://www.arca.gob.ar/facturacion/comprobantes/fe-vs-cf.asp
- ARCA - datos de comprobantes y consumidor final: https://www.arca.gob.ar/fe/emision-autorizacion/datos-comprobantes.asp
- ARCA - webservices de factura electronica: https://arca.gob.ar/ws/documentacion/ws-factura-electronica.asp
- ARCA - ayuda y normativa FE: https://www.arca.gob.ar/fe/ayuda/normativa.asp
- Boletin Oficial - RG 5614/2024: https://www.boletinoficial.gob.ar/detalleAviso/primera/318151/2024121
