# Modelo Operativo

Fecha base: `2026-05-07`
Estado: borrador

## Meta

Definir como deberia resolver COMANDA el frente de caja y facturacion antes de decidir integracion fiscal o emision propia.

## Flujo base propuesto

1. Pedido creado
2. Consumo consolidado por mesa / sesion
3. Solicitud de cuenta o cobro
4. Registro del medio de pago
5. Emision de comprobante operativo
6. Cierre de mesa
7. Cierre de caja
8. Cierre de turno

## Tipos de salida a distinguir

- Ticket interno de cocina/bar
- Ticket comercial no fiscal
- Precuenta
- Comprobante de cobro
- Factura fiscal

## Decision de alcance vigente

Por ahora, COMANDA debe enfocarse primero en:

- operacion de caja
- registro de cobro
- cierres
- comprobantes operativos

No asumir todavia:

- emision fiscal completa propia
- integracion cerrada con AFIP/ARCA
- reemplazo total de Maxi Rest o POS externo

## Pendientes

- completar con el relevamiento visual
- mapear campos minimos por comprobante
- definir que sale impreso y que solo queda digital
