# COMANDA - Mapping de Mockups a MVP Tecnico

Fuente: `docs/APP mockup/`
Fecha: 2026-02-16

## 1) Objetivo

Traducir pantallas de diseño a requerimientos técnicos implementables en backend/frontend MVP.

## 2) Pantallas detectadas (resumen)

- Splash / bienvenida
- Login social cliente (Google/Facebook)
- Escaneo QR
- Selector de cantidad de personas
- Menú por categorías + buscador
- Listado de productos por categoría
- Carrito / resumen de pedido
- Estados de pedido con número de ticket
- Flujo de pago (medios de pago, tarjeta, dividir cuenta)
- Pantalla de gracias
- Calificación final
- Menú lateral de cuenta/favoritos/promociones

## 3) Qué entra al MVP v0.1

- Escaneo QR y apertura de mesa
- Cantidad de comensales (`guest_count`)
- Menú por categorías
- Agregado de items al pedido
- Confirmación de pedido
- Seguimiento de pedido por estados
- Número de ticket (`ticket_number`)
- Operación staff por sectores (`ADMIN`, `KITCHEN`, `BAR`, `WAITER`)

## 4) Qué queda fuera del MVP v0.1

- Login social de cliente
- Pagos (efectivo/tarjetas)
- Dividir cuenta
- Favoritos, promociones, perfil
- Calificación/comentarios

## 5) Impacto en backend

- DB:
  - `orders.guest_count`
  - `orders.ticket_number`
  - `menu_categories`
  - `products.category_id`
- API:
  - `GET /menu` devuelve `categories` y `products`
  - `POST /orders` recibe `guest_count` y devuelve `ticket_number`
  - `GET /orders/{id}` devuelve `ticket_number` y estados por sector

## 6) Gap detectado

En `APP mockup` no se ven tableros detallados de staff web (admin/cocina/barra/mozo) para desktop.

Impacto:
- Los contratos API staff se mantienen correctos para implementación.
- Faltan decisiones de UX de tablero (columnas, filtros, orden por prioridad, acciones rápidas).

## 7) Recomendación para continuar

1. Mantener backend según contratos actuales (`docs/API_OPENAPI_MVP.md`).
2. Diseñar wireframe simple de `front-staff` en base a:
   - lista por sector
   - detalle de pedido
   - botones de transición de estado
3. Cuando tengas mockups staff, ajustar solo presentación, no contrato.
