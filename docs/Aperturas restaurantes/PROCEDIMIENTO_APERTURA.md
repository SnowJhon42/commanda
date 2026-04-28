# Procedimiento de apertura

Fecha base: 2026-04-16  
Estado: operativo local

## Objetivo

Abrir un restaurante nuevo en COMANDA con el menor rozamiento posible, de modo que el duenio pueda entrar a Staff, cargar su menu e imagenes y dejar el local operativo.

## Resultado esperado

Al terminar la apertura debe existir:

- `tenant` creado
- `store` creado
- mesas `M1..Mn` creadas
- usuarios de staff iniciales creados
- password inicial del duenio configurado
- PIN inicial del staff configurado

Con eso, el restaurante queda listo para que el duenio entre a `http://localhost:5174`, cargue su menu y sus imagenes.

## Datos minimos de entrada

Para abrir un restaurante nuevo hacen falta como minimo:

- nombre del restaurante
- cantidad de mesas
- password inicial del duenio

Opcionales recomendados:

- nombre del store o sucursal
- PIN inicial de staff
- prefijo de usernames

## Regla operativa

COMANDA hoy abre restaurantes nuevos por alta vacia. Eso significa:

1. se crea estructura operativa base
2. se habilita acceso del duenio
3. el menu y las imagenes se cargan despues desde Staff

No conviene considerar "demo-ready" a un restaurante si todavia no tiene al menos una categoria y un producto cargados.

## Comando canonico

Desde la raiz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open_restaurant.ps1 `
  -Tenant "Los Perros" `
  -Tables 14 `
  -OwnerPassword "4321"
```

Ejemplo completo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open_restaurant.ps1 `
  -Tenant "Los Perros" `
  -Store "Los Perros Centro" `
  -Tables 14 `
  -OwnerPassword "4321" `
  -Pin "1234" `
  -UsernamePrefix "perros"
```

Atajo via `npm`:

```powershell
npm.cmd run restaurant:open -- `
  -Tenant "Los Perros" `
  -Tables 14 `
  -OwnerPassword "4321"
```

## Que hace el comando

El wrapper [scripts/open_restaurant.ps1](</C:/Users/agust/Desktop/COMANDA_LOCAL/scripts/open_restaurant.ps1>) ejecuta internamente [comanda-backend/scripts/add_empty_tenant.py](</C:/Users/agust/Desktop/COMANDA_LOCAL/comanda-backend/scripts/add_empty_tenant.py:1>) y:

- asegura `tenant`
- asegura `store`
- crea mesas `M1..Mn`
- crea usuarios:
  - `admin_<prefijo>`
  - `cocina_<prefijo>`
  - `barra_<prefijo>`
  - `mozo_<prefijo>`
- informa credenciales y URLs

## Checklist operativo

1. Confirmar que existe la DB local del backend.
2. Ejecutar el comando de apertura.
3. Verificar que la salida termine con `APERTURA_OK`.
4. Entrar a `http://localhost:5174`.
5. Ingresar con el owner password informado.
6. Cargar categorias.
7. Cargar productos.
8. Cargar imagenes de productos.
9. Abrir `http://localhost:5173` y validar que la carta se vea.
10. Hacer una orden de prueba.

## OK para el duenio

Se puede dar el OK al duenio cuando se cumpla esto:

- apertura creada sin error
- Staff abre en `http://localhost:5174`
- owner puede entrar
- puede crear o editar categorias
- puede crear o editar productos
- puede cargar imagenes

Texto corto recomendado para reportar:

```txt
APERTURA_OK
Restaurante creado en COMANDA local.
El duenio ya puede entrar a Staff, cargar menu e imagenes y dejarlo operativo.
```

## Frase operativa para pedir aperturas

Frase recomendada:

```txt
Abrime el restaurante "Los Perros" con 14 mesas y owner password 4321.
Dejame el OK para que el duenio entre a Staff y cargue su menu.
```

Si queres fijar prefijo y sucursal:

```txt
Abrime el restaurante "Los Perros", store "Los Perros Centro", 14 mesas,
owner password 4321, PIN staff 1234 y prefijo perros.
```

## Limites del proceso actual

- no carga menu automaticamente
- no carga imagenes automaticamente
- no deja el cliente listo para vender si el menu esta vacio
- trabaja sobre entorno local SQLite

## Siguiente mejora recomendada

El siguiente paso natural es sumar una segunda automatizacion:

- `open_restaurant_with_menu.ps1`

Ese flujo deberia abrir el restaurante y luego importar una carta inicial con categorias, productos e imagenes para dejarlo realmente demo-ready en un solo paso.
