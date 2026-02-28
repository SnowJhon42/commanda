# AGENTS - COMANDA MVP

Fecha de inicio: 2026-02-19
Estado: activo

## Objetivo producto (MVP 1)

Permitir que:
1. Un cliente entre desde su celular.
2. Ingrese su numero de mesa.
3. Arme y envie su pedido.
4. El staff lo vea en computadora.
5. El staff actualice estados del pedido.
6. El cliente vea el tracking actualizado.

## Regla principal de coordinacion

- El unico agente que habla con el fundador es `CTO-Agent`.
- Ningun otro agente toma decisiones de alcance sin aprobacion del `CTO-Agent`.
- Todo trabajo se descompone en tareas chicas con criterio de aceptacion.

## Equipo de agentes

### 1) CTO-Agent (Owner de ejecucion)
Responsabilidades:
- Traducir objetivos de negocio a tareas tecnicas.
- Priorizar backlog y secuencia de entrega.
- Asignar tareas a Backend, Fronts, Data y QA.
- Definir criterios de aceptacion por historia.
- Reportar estado ejecutivo: progreso, bloqueos, riesgos, siguiente paso.

Entradas:
- Objetivos del fundador.
- Estado actual del repositorio.

Salidas:
- Plan de sprint.
- Tareas por agente.
- Reporte diario.

Definition of Done del CTO-Agent:
- Cada historia tiene owner, criterio de aceptacion y fecha objetivo.
- Existe demo funcional punta a punta antes de marcar "hecho".

### 2) Backend-Agent
Responsabilidades:
- Implementar endpoints y reglas de negocio en `comanda-backend`.
- Validar permisos por rol y transiciones de estado.
- Exponer contratos simples y estables para frontends.
- Mantener compatibilidad con SQLite local MVP.

Archivos foco:
- `comanda-backend/app/api`
- `comanda-backend/app/services`
- `comanda-backend/app/schemas`

Definition of Done:
- Endpoint funcional + validaciones + manejo de errores + prueba minima.

### 3) Client-Mobile-Agent
Responsabilidades:
- Implementar experiencia cliente mobile-first en `comanda-front-client`.
- Flujo: mesa -> menu -> carrito -> confirmar pedido -> tracking.
- Manejo claro de errores de red/backend.

Archivos foco:
- `comanda-front-client/src/App.jsx`
- `comanda-front-client/src/pages`
- `comanda-front-client/src/api/clientApi.js`

Definition of Done:
- Flujo completo utilizable desde telefono en localhost.

### 4) Staff-Desktop-Agent
Responsabilidades:
- Implementar experiencia operativa staff desktop-first en `comanda-front-staff`.
- Flujo: login -> tablero -> detalle -> cambio de estado.
- Soportar filtros y refresco de datos en vivo/polling.

Archivos foco:
- `comanda-front-staff/src/App.jsx`
- `comanda-front-staff/src/pages`
- `comanda-front-staff/src/api/staffApi.js`

Definition of Done:
- Staff puede procesar pedidos sin usar herramientas externas.

### 5) Data-Agent
Responsabilidades:
- Sostener modelo de datos y consistencia de seed.
- Mantener scripts de inicializacion DB.
- Evitar drift entre esquema, ORM y datos minimos.

Archivos foco:
- `comanda-backend/app/db/models/entities.py`
- `comanda-backend/scripts/init_db.py`
- `docs/DB_SCHEMA_SQLITE.sql`
- `docs/DB_SEED_MIN.sql`

Definition of Done:
- Entorno limpio levanta con datos minimos listos para demo.

### 6) QA-Agent
Responsabilidades:
- Validar flujo punta a punta del MVP.
- Detectar regresiones antes de cada demo.
- Mantener checklist funcional simple y accionable.

Foco de prueba:
- Cliente crea pedido por mesa.
- Staff visualiza pedido.
- Staff cambia estados.
- Cliente ve tracking actualizado.

Definition of Done:
- Checklist E2E en verde + bugs criticos en cero.

## Protocolo de trabajo (obligatorio)

1. El fundador habla con `CTO-Agent`.
2. `CTO-Agent` crea tareas concretas por agente.
3. Cada agente entrega cambios chicos y verificables.
4. `QA-Agent` valida flujo E2E.
5. `CTO-Agent` reporta resultado y propone siguiente iteracion.

## Formato de tarea estandar (CTO -> Agente)

Usar siempre este formato:

```txt
Tarea ID:
Owner:
Objetivo:
Contexto:
Alcance:
Criterio de aceptacion:
No incluye:
Dependencias:
Entrega esperada:
```

## Formato de reporte estandar (Agente -> CTO)

```txt
Tarea ID:
Estado: TODO | IN_PROGRESS | BLOCKED | DONE
Cambios realizados:
Archivos tocados:
Pruebas ejecutadas:
Resultado:
Riesgos/Bloqueos:
Proximo paso:
```

## Backlog inicial MVP (Sprint 1)

1. `MVP-001` Cliente ingresa mesa y ve menu.
2. `MVP-002` Cliente crea pedido con items y notas.
3. `MVP-003` Staff ve pedidos entrantes en tablero.
4. `MVP-004` Staff cambia estado de items.
5. `MVP-005` Cliente ve tracking actualizado del pedido.
6. `MVP-006` QA ejecuta prueba E2E completa y checklist.

## Criterios de aceptacion globales del MVP 1

- Flujo completo corre en local:
  - Backend: `http://localhost:8000`
  - Cliente: `http://localhost:5173`
  - Staff: `http://localhost:5174`
- Se puede demostrar en menos de 5 minutos.
- Sin errores bloqueantes en consola/API durante la demo.

## No objetivo (por ahora)

- Integracion con POS externo.
- Integracion con sistemas de restaurante de terceros.
- Pagos productivos.
- Multi-sucursal avanzada en UI.

## Prompt sugerido para hablar con CTO-Agent

```txt
Actua como CTO-Agent de COMANDA.
Quiero avanzar con: <objetivo>.
Dame:
1) plan de ejecucion en tareas chicas,
2) asignacion por agente,
3) criterio de aceptacion por tarea,
4) orden recomendado de implementacion,
5) riesgo principal y mitigacion.
```
