# Aperturas restaurantes

Fecha base: 2026-04-16
Estado: documento vivo

## Objetivo

Guardar en un solo lugar cómo se abre un restaurante nuevo en COMANDA desde backend, para poder retomarlo y seguir completándolo en próximas sesiones.

## Documentos operativos

- [PROCEDIMIENTO_APERTURA.md](</C:/Users/agust/Desktop/COMANDA_LOCAL/docs/Aperturas restaurantes/PROCEDIMIENTO_APERTURA.md>)
- [COMANDO_RAPIDO.md](</C:/Users/agust/Desktop/COMANDA_LOCAL/docs/Aperturas restaurantes/COMANDO_RAPIDO.md>)

## Modelo actual en backend

La relación base hoy es:

- `Tenant` = entidad padre del restaurante / negocio
- `Store` = sucursal o instancia operativa que depende de un `tenant`

En código:

- `Tenant` está definido en [comanda-backend/app/db/models/entities.py](C:/Users/agust/Desktop/COMANDA_LOCAL/comanda-backend/app/db/models/entities.py:60)
- `Store` está definido en [comanda-backend/app/db/models/entities.py](C:/Users/agust/Desktop/COMANDA_LOCAL/comanda-backend/app/db/models/entities.py:68)

Punto clave:

- `stores.tenant_id` referencia `tenants.id`
- Entonces `store` depende de `tenant`

## Flujo actual para abrir un restaurante

Orden actual del backend:

1. Crear o asegurar el `tenant`
2. Crear o asegurar el `store` dentro de ese `tenant`
3. Crear mesas
4. Crear usuarios de staff
5. Opcionalmente cargar categorías y productos

## Scripts identificados

### 1. Alta base vacía

Script:

- [comanda-backend/scripts/add_empty_tenant.py](C:/Users/agust/Desktop/COMANDA_LOCAL/comanda-backend/scripts/add_empty_tenant.py:1)

Qué hace:

- asegura `tenant`
- asegura `store`
- crea mesas `M1..Mn`
- crea usuarios de staff por sector
- deja el restaurante listo para carga manual de menú

Funciones clave:

- `ensure_tenant(...)`
- `ensure_store(...)`
- `ensure_tables(...)`
- `ensure_staff(...)`

Parámetros relevantes:

- `--tenant`
- `--store`
- `--tables`
- `--pin`
- `--owner-password`
- `--username-prefix`

### 2. Alta con seed de ejemplo

Script:

- [comanda-backend/scripts/add_restaurant.py](C:/Users/agust/Desktop/COMANDA_LOCAL/comanda-backend/scripts/add_restaurant.py:1)

Qué hace:

- asegura `tenant`
- asegura `store`
- crea mesas
- crea staff
- crea categorías
- crea productos

Sirve como referencia de apertura completa con datos de demo.

## Resumen técnico confirmado

- `tenant` es la entidad raíz
- `store` no se crea solo: necesita `tenant_id`
- mesas, staff, categorías y productos cuelgan del `store`

## Credenciales y defaults vistos en scripts

Defaults observados:

- PIN inicial típico: `1234`
- owner password típico: `1234`
- nombre por defecto del store en alta vacía: `"<tenant> Centro"`

Usuarios de staff típicos:

- `admin_<prefijo>`
- `cocina_<prefijo>`
- `barra_<prefijo>`
- `mozo_<prefijo>`

## Estado actual del proceso

Queda definido el flujo operativo local:

- comando canonico de apertura
- checklist operativo
- criterio de OK para el duenio
- frase estandar para pedir aperturas al agente

Pendientes para una segunda iteracion:

- apertura con menu inicial automatizado
- conexion entre apertura local y despliegue online
- versionado de menus, mesas y credenciales iniciales

## Casos guardados

- Apertura Postgres lista para `Los Perros`:
  [SQL_LOS_PERROS_POSTGRES.sql](C:/Users/agust/Desktop/COMANDA_LOCAL/docs/Aperturas%20restaurantes/SQL_LOS_PERROS_POSTGRES.sql:1)
  Incluye tenant, store, mesas, staff, categorias, productos, variantes y extras iniciales.

## Nota de trabajo

Esta carpeta queda creada como base de referencia para futuras sesiones. La idea es seguir agregando documentos cortos y prácticos acá adentro a medida que definamos el proceso real de aperturas.
