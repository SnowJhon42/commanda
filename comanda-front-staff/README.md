# comanda-front-staff

Frontend staff (Next.js) para `ADMIN`, `KITCHEN`, `BAR`, `WAITER`.

## Run

```bash
npm install
npm run dev -- -H 0.0.0.0 -p 5174
```

## Env

- `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`)
- `STAFF_APP_BASIC_AUTH_USER` (activar en Vercel para cerrar el deploy de staff)
- `STAFF_APP_BASIC_AUTH_PASSWORD` (activar en Vercel para cerrar el deploy de staff)

## Produccion privada

Para que el deploy de staff no entregue HTML, JS ni assets sin credenciales:

- configurar `STAFF_APP_BASIC_AUTH_USER`
- configurar `STAFF_APP_BASIC_AUTH_PASSWORD`
- redeployar en Vercel

Sin esas variables, la proteccion no se activa.
