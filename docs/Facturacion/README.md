# Facturacion

Fecha base: `2026-05-07`
Estado: carpeta operativa
Owner: `CTO-Agent`

## Objetivo

Centralizar todo el trabajo de facturacion, caja, tickets, comprobantes e integraciones externas para construir el frente de trabajo dentro de COMANDA sin mezclarlo con pedidos, salon o marketing.

## Alcance inicial

Esta carpeta se crea para ordenar 4 cosas:

1. Relevamiento visual y operativo de sistemas reales como Maxi Rest.
2. Definicion funcional de tickets, pre-cuenta, comprobantes y cierres.
3. Backlog tecnico por fases para COMANDA.
4. Evidencia de decisiones y diferencias entre `no fiscal`, `fiscal` e `integrado con tercero`.

## Archivos esperados

- `README.md`
  Punto de entrada y mapa de trabajo.
- `AVANCE_TECNICO_2026-05-12.md`
  Estado real de implementacion y roadmap inmediato.
- `RELEVAMIENTO_MAXI_REST.md`
  Notas de pantallas, flujos y campos observados.
- `BACKLOG_FACTURACION.md`
  Tareas concretas CTO -> agentes.
- `MODELO_OPERATIVO.md`
  Flujo ideal COMANDA para caja, cobro, cierre y facturacion.
- `IMAGENES/`
  Capturas de referencia y material visual.

## Fuente existente ya detectada

- [../INVESTIGACION_FACTURACION_CAJAS_2026-04-21.md](C:/Users/agust/Desktop/COMANDA_LOCAL/docs/INVESTIGACION_FACTURACION_CAJAS_2026-04-21.md:1)

Resumen util de esa investigacion:

- COMANDA ya deberia cubrir `caja operativa + cobro + cierre`.
- No conviene prometer `facturacion fiscal propia` en esta etapa.
- El camino mas razonable es primero ordenar comprobantes no fiscales y despues decidir integracion o emision fiscal.

## Hipotesis de producto para este frente

Fase 1:
- ticket interno de pedido
- pre-cuenta
- registro de cobro
- cierre de caja
- resumen de turno

Fase 2:
- comprobante comercial no fiscal mas prolijo
- historial de cobros y anulaciones
- roles y auditoria minima

Fase 3:
- decision de integracion con sistema externo o flujo fiscal

## Protocolo de relevamiento

Cuando entren imagenes o referencias externas, registrar siempre:

1. Nombre de la pantalla.
2. Para que sirve operativamente.
3. Que datos muestra.
4. Que acciones habilita.
5. Que parte aplica a COMANDA y cual no.
6. Si pertenece a `caja`, `ticket`, `factura`, `cuenta corriente`, `arqueo` o `reportes`.

## Criterio CTO para bajar esto a tareas

No arrancar por "emitir factura AFIP".

Arrancar por:

1. relevamiento de pantallas reales
2. modelo operativo objetivo dentro de COMANDA
3. backlog por fases
4. recien despues definicion tecnica de integracion

## Proximo paso

Mirar primero:

- `AVANCE_TECNICO_2026-05-12.md`
- `ESTRATEGIA_FACTURACION_ARGENTINA_2026-05-11.md`
- `RELEVAMIENTO_MAXI_REST.md`

Y mantener actualizado el orden de sprints siguientes ahi mismo.

Estado operativo actual:

- Sprint 1: base fiscal minima y precuenta no fiscal ya implementadas
- Sprint 2: configuracion fiscal privada del local ya iniciada

Cuando entren las imagenes de Maxi Rest:

- guardarlas en `IMAGENES/`
- documentarlas en `RELEVAMIENTO_MAXI_REST.md`
- separar hallazgos en:
  - `imprescindible MVP`
  - `mejora operativa`
  - `fuera de alcance por ahora`
