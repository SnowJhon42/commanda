**Objetivo**
Dejar una DB Postgres limpia en Railway usando el schema real del backend y un seed mínimo de demo.

**Estado**
- El SQL viejo del repo está orientado a SQLite:
  - [DB_SCHEMA_SQLITE.sql](C:/Users/agust/Desktop/COMANDA_LOCAL/docs/DB_SCHEMA_SQLITE.sql)
  - [DB_SEED_MIN.sql](C:/Users/agust/Desktop/COMANDA_LOCAL/docs/DB_SEED_MIN.sql)
- Para Railway/Postgres la fuente de verdad nueva pasa a ser:
  - [bootstrap_postgres.py](C:/Users/agust/Desktop/COMANDA_LOCAL/comanda-backend/scripts/bootstrap_postgres.py)

**Qué hace el bootstrap**
- crea tablas desde los modelos actuales de SQLAlchemy
- evita drift con el código real
- carga seed mínimo idempotente

**Seed que deja**
- tenant: `Comanda Demo`
- store: `Local Centro`
- mesas: `M1` a `M20`
- usuarios:
  - `dueno`
  - `admin`
  - `kitchen`
  - `bar`
  - `waiter`
- pin demo para todos:
  - `1234`
- categorías y productos mínimos de demo

**Precondición**
- `DATABASE_URL` debe apuntar a Postgres
- no funciona con `sqlite:///...`

**Comando**
Desde [comanda-backend](C:/Users/agust/Desktop/COMANDA_LOCAL/comanda-backend):

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require"
.venv\Scripts\python.exe .\scripts\bootstrap_postgres.py
```

**Resultado esperado**
- tablas creadas
- seed cargado
- login staff disponible con pin `1234`

**Uso recomendado**
1. crear Postgres en Railway
2. copiar `DATABASE_URL`
3. correr `bootstrap_postgres.py` apuntando a esa URL
4. validar local contra esa DB
5. recién después cambiar producción

**No hace**
- no migra datos reales desde Neon
- no borra tablas existentes
- no reemplaza producción automáticamente
