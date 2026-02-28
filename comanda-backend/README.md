# comanda-backend

Backend MVP para COMANDA (FastAPI + SQLite + SQLAlchemy).

## Requisitos

- Python 3.11+

## Instalacion

```bash
pip install -r requirements.txt
```

## Variables de entorno opcionales

- `DATABASE_URL` (default: `sqlite:///./comanda_dev.db`)
- `JWT_SECRET_KEY`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_PUBLIC_HOST` (default `https://pub-5d4b544badf2444a82ffa24a0f757908.r2.dev`)

## Inicializar base de datos (opcional)

Por defecto FastAPI crea tablas ORM al arrancar.
Si queres cargar esquema/seed oficial SQL de `docs/`, ejecuta:

```bash
python scripts/init_db.py
```

## Arranque recomendado (PowerShell - Windows)

```powershell
cd C:\Users\agust\OneDrive\Desktop\COMANDA\comanda-backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:DATABASE_URL="sqlite:///C:/Users/agust/OneDrive/Desktop/COMANDA/comanda-backend/comanda_dev.db"
python scripts/init_db.py
python -m uvicorn app.main:app --reload
```

Verificacion rapida:

- `http://localhost:8000/docs`
- `http://localhost:8000/menu?store_id=1`

## Endpoints principales

- `POST /auth/sector-login`
- `GET /menu?store_id=1`
- `POST /orders`
- `GET /orders/{order_id}`
- `GET /staff/orders?...`
- `PATCH /staff/orders/{order_id}/sectors/{sector}/status`
- `GET /admin/orders?...`
- `GET /admin/orders/{order_id}`
