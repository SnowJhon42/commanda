# COMANDA - Fuente de Verdad de DB

Ultima actualizacion: `2026-05-04`
Owner: `CTO-Agent -> Mateo (Local-Ops-Agent)`

## DB local oficial

La unica DB local oficial para desarrollo y pruebas manuales es:

- `C:\Users\agust\Desktop\COMANDA_LOCAL\comanda-backend\comanda_dev.db`

El backend local la toma desde:

- `comanda-backend/.env`
- `DATABASE_URL=sqlite:///./comanda_dev.db`

## DB online oficial

La DB online oficial es la configurada por `DATABASE_URL` en Render.

No asumir que coincide con SQLite local.

La referencia operativa del entorno online vive en:

- `docs/ONLINE_STACK.md`

## Archivos DB que no son fuente de verdad operativa

Estos archivos pueden existir en el repo, pero no forman parte del flujo local oficial:

- `comanda-backend/archive/test-artifacts/comanda_local.db`
- `comanda-backend/archive/test-artifacts/smoke_*.db`
- `comanda-backend/archive/db-backups/comanda_dev.db.backup_*`

Uso esperado:

- `comanda_local.db`: historico / no oficial hasta migracion explicita
- `smoke_*.db`: pruebas puntuales
- `*.db.backup_*`: backups manuales

La raiz de `comanda-backend` debe dejar visible solo la DB oficial activa:

- `comanda_dev.db`

## Regla operativa

Cuando haya dudas sobre datos locales:

1. mirar `comanda-backend/.env`
2. confirmar `DATABASE_URL`
3. inspeccionar `comanda-backend/comanda_dev.db`
4. no usar otras DBs para concluir comportamiento del stack local oficial

## Regla de lanzamiento

Antes de release o debugging fuerte:

- local se valida solo sobre `comanda_dev.db`
- online se valida solo sobre la DB remota real
- no mezclar conclusiones entre ambas
