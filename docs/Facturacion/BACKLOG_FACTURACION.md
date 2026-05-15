# Backlog Facturacion

Fecha base: `2026-05-07`
Estado: borrador inicial

## Tareas iniciales

```txt
Tarea ID: FACT-001
Owner: CTO-Agent
Objetivo: relevar las pantallas e impresos de referencia que vienen de Maxi Rest.
Contexto: hoy existe investigacion general de caja/facturacion, pero no un relevamiento visual estructurado.
Alcance: clasificar imagenes, detectar modulos y separar lo esencial de lo accesorio.
Criterio de aceptacion: existe documento base con cada imagen descrita y marcada como aplica/no aplica.
No incluye: implementacion UI o backend.
Dependencias: recepcion de imagenes.
Entrega esperada: docs/Facturacion/RELEVAMIENTO_MAXI_REST.md completo en primera pasada.
```

```txt
Tarea ID: FACT-002
Owner: CTO-Agent
Objetivo: definir el modelo operativo objetivo de COMANDA para caja, cobro y comprobantes.
Contexto: COMANDA ya tiene tickets internos, caja y cobros, pero no un modelo consolidado de facturacion operativa.
Alcance: definir flujo target de pedido -> consumo -> cobro -> comprobante -> cierre.
Criterio de aceptacion: documento de flujo con fases y decisiones de alcance.
No incluye: integracion fiscal con AFIP/ARCA.
Dependencias: FACT-001.
Entrega esperada: docs/Facturacion/MODELO_OPERATIVO.md.
```

```txt
Tarea ID: FACT-003
Owner: Backend-Agent
Objetivo: mapear que estructuras y endpoints actuales ya cubren caja, pagos, tickets y cierre.
Contexto: hoy hay piezas dispersas en billing, staff, orders y reportes.
Alcance: inventario tecnico de tablas, endpoints y restricciones actuales.
Criterio de aceptacion: documento con estado actual y gaps claros.
No incluye: cambios funcionales.
Dependencias: FACT-002.
Entrega esperada: seccion tecnica agregada al modelo operativo o documento aparte.
```

```txt
Tarea ID: FACT-004
Owner: Staff-Desktop-Agent
Objetivo: diseñar la primera experiencia de caja/facturacion visible para staff.
Contexto: parte del flujo ya existe, pero no esta presentado como modulo integral.
Alcance: proponer pantallas y jerarquia para caja, cobro, ticket, cierre y reportes.
Criterio de aceptacion: wireframe o especificacion de vistas con entradas/salidas claras.
No incluye: implementacion final.
Dependencias: FACT-001, FACT-002, FACT-003.
Entrega esperada: propuesta visual y funcional inicial.
```
