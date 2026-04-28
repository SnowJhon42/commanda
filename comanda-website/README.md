# comanda-website

Sitio publico aislado de COMANDA.

Este frontend queda separado de:
- `comanda-front-client`
- `comanda-front-staff`

No toca los puertos operativos actuales del producto.

## Run

```powershell
npm.cmd --prefix comanda-website install
npm.cmd --prefix comanda-website run dev -- -H 0.0.0.0 -p 5180
```

## Objetivo

Construir la web comercial de COMANDA sin interferir con:
- `http://localhost:5173`
- `http://localhost:5174`
