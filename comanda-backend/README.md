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
- `JWT_SECRET_KEY` (obligatoria fuera de `ENVIRONMENT=dev`)
- `ACCESS_TOKEN_EXPIRE_MINUTES` (default `120`)
- `CORS_ALLOW_ORIGINS` (lista separada por comas; en produccion dejar solo dominios reales)
- `CORS_ALLOW_ORIGIN_REGEX` (si no se define, solo queda activo por defecto en `ENVIRONMENT=dev`)
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_PUBLIC_HOST` (default `https://pub-5d4b544badf2444a82ffa24a0f757908.r2.dev`)
- `SMTP_HOST`
- `SMTP_PORT` (default `587`)
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_USE_TLS` (default `true`)
- `SMTP_FROM_EMAIL`

## Regla local oficial

Para desarrollo local en este repo, el backend oficial corre en:

- `http://localhost:8001`

Y la base local oficial es:

- `C:\Users\agust\Desktop\COMANDA_LOCAL\comanda-backend\comanda_dev.db`

No arrancar el backend desde la raiz del repo con SQLite relativa. En esta copia existe un `comanda_dev.db` adicional en la raiz que puede confundir el runtime.

## Inicializar base de datos

El backend ya no modifica esquema al arrancar. Antes de levantarlo, carga esquema/seed oficial con:

```bash
python scripts/init_db.py
```

## Arranque recomendado (PowerShell - Windows)

La forma oficial de levantar backend local es mediante el script unificado del repo. Ese script fuerza `DATABASE_URL` a la SQLite local del backend y evita usar configuraciones remotas por error.

Desde la raiz del repo:

```powershell
cd C:\Users\agust\Desktop\COMANDA_LOCAL
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 -Action backend-up
```

O para levantar todo el stack:

```powershell
cd C:\Users\agust\Desktop\COMANDA_LOCAL
powershell -ExecutionPolicy Bypass -File .\scripts\comanda_local.ps1 -Action up
```

Verificacion rapida:

- `http://localhost:8001/health`
- `http://localhost:5173`
- `http://localhost:5174`

## Arranque manual (solo si sabés lo que estás haciendo)

```powershell
cd C:\Users\agust\Desktop\COMANDA_LOCAL\comanda-backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:DATABASE_URL="sqlite:///C:/Users/agust/Desktop/COMANDA_LOCAL/comanda-backend/comanda_dev.db"
python scripts/init_db.py
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Verificacion rapida:

- `http://localhost:8001/docs`
- `http://localhost:8001/menu?store_id=1`

## Endpoints principales

- `POST /auth/sector-login`
- `GET /menu?store_id=1`
- `POST /orders`
- `GET /orders/{order_id}`
- `GET /staff/orders?...`
- `PATCH /staff/orders/{order_id}/sectors/{sector}/status`
- `GET /admin/orders?...`
- `GET /admin/orders/{order_id}`
