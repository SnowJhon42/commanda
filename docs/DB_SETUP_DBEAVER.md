# COMANDA - Setup DB en DBeaver (SQLite)

## Archivos

- Esquema: `docs/DB_SCHEMA_SQLITE.sql`
- Seed minimo: `docs/DB_SEED_MIN.sql`

## Pasos en DBeaver

1. Crear conexion nueva: `SQLite`.
2. Elegir archivo DB (ejemplo): `C:\Users\agust\OneDrive\Desktop\COMANDA\docs\comanda_dev.db`.
3. Abrir `SQL Editor` sobre esa conexion.
4. Ejecutar primero contenido de `docs/DB_SCHEMA_SQLITE.sql`.
5. Ejecutar despues contenido de `docs/DB_SEED_MIN.sql`.
6. Refrescar esquema y validar tablas:
   - `orders`
   - `order_items`
   - `order_sector_status`
   - `order_status_events`
   - `staff_accounts`

## Checks rapidos

- Debe haber 4 usuarios staff (`admin`, `kitchen`, `bar`, `waiter`).
- Deben existir mesas `M1` a `M20`.
- Deben existir productos en 3 sectores (`KITCHEN`, `BAR`, `WAITER`).

## Nota

`pin_hash` en seed es placeholder (`CHANGE_ME_HASH_1234`).
Cuando armemos backend, se reemplaza por hash real (bcrypt/argon2).
