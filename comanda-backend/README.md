# comanda-backend

Backend MVP para COMANDA (FastAPI + SQLite + SQLAlchemy).

## Requisitos

- Python 3.11+

## Instalación

```bash
pip install -r requirements.txt
```

## Variables de entorno opcionales

- `DATABASE_URL` (default: `sqlite:///./comanda_dev.db`)
- `JWT_SECRET_KEY`
- `ACCESS_TOKEN_EXPIRE_MINUTES`

## Inicializar base de datos (opcional)

Por defecto FastAPI crea tablas ORM al arrancar.
Si querés cargar esquema/seed oficial SQL de `docs/`, ejecutá:

```bash
python scripts/init_db.py
```

## Correr API

```bash
uvicorn app.main:app --reload
```

## Endpoints principales

- `POST /auth/sector-login`
- `GET /menu?store_id=1`
- `POST /orders`
- `GET /orders/{order_id}`
- `GET /staff/orders?...`
- `PATCH /staff/orders/{order_id}/sectors/{sector}/status`
- `GET /admin/orders?...`
- `GET /admin/orders/{order_id}`
