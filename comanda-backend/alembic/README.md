# Alembic

MVP v0.1 usa esquema SQL base definido en `docs/DB_SCHEMA_SQLITE.sql`.

Hasta configurar Alembic runtime, el init se hace con:

```bash
python scripts/init_db.py
```

Próximo paso:
- generar revision `0001_init_schema`
- mover DDL SQL a migración Alembic nativa
