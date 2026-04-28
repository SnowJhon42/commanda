# Comando rapido de apertura

## Uso minimo

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open_restaurant.ps1 `
  -Tenant "Los Perros" `
  -Tables 14 `
  -OwnerPassword "4321"
```

## Respuesta esperada

Si sale bien, la salida incluye:

```txt
APERTURA_OK
tenant=Los Perros
store=Los Perros Centro
tables=14
owner_password=4321
staff_pin=1234
admin_user=admin_perros
staff_url=http://localhost:5174
client_url=http://localhost:5173
```

## Frase para pedirselo al agente

```txt
Abrime el restaurante "Los Perros" con 14 mesas y owner password 4321.
Dejame el OK para que el duenio entre a Staff y cargue su menu.
```
