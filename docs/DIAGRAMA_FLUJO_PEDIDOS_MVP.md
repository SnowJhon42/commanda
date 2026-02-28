# COMANDA - Diagrama de Flujo de Pedidos (MVP)

Fecha: 2026-02-19
Estado: activo

## 1) Flujo principal (end-to-end)

```mermaid
flowchart TD
    A[Cliente abre app en celular] --> B[Ingresa mesa y comensales]
    B --> C[POST /table/session/open]
    C --> D{Mesa valida y activa?}
    D -- No --> E[Error: mesa inexistente/inactiva]
    D -- Si --> F[Sesion de mesa abierta/reutilizada]

    F --> G[Cliente arma carrito]
    G --> H[POST /orders/upsert-by-table]
    H --> I{Hay pedido activo de esa mesa?}
    I -- No --> J[Crear pedido nuevo + ticket_number]
    I -- Si --> K[Agregar items al pedido existente]

    J --> L[Enrutar items por sector]
    K --> L
    L --> M[Items en estado RECEIVED]
    M --> N[Publicar eventos tiempo real]

    N --> O[Staff ve pedido en tablero]
    O --> P[Staff cambia estado de items]
    P --> Q[PATCH /staff/items/{item_id}/status]
    Q --> R{Transicion permitida y rol autorizado?}
    R -- No --> S[Error 400/403]
    R -- Si --> T[Guardar evento + recalcular estado agregado]

    T --> U[Cliente ve tracking actualizado]
    U --> V{Pedido totalmente DELIVERED?}
    V -- No --> O
    V -- Si --> W[Admin puede cerrar mesa]
    W --> X[POST /staff/tables/{table_code}/close-session]
```

## 2) Secuencia entre actores

```mermaid
sequenceDiagram
    participant C as Cliente (Celular)
    participant B as Backend (FastAPI)
    participant S as Staff (PC)

    C->>B: POST /table/session/open (store_id, table_code, guest_count)
    B-->>C: table_session_id (+ active_order_id si existe)

    C->>B: POST /table/session/{id}/join (client_id, alias)
    B-->>C: connected_clients

    C->>B: POST /orders/upsert-by-table (items)
    B-->>C: order_id, ticket_number, status_aggregated=RECEIVED
    B-->>S: Evento SSE order.created/items.changed

    S->>B: GET /staff/items/board
    B-->>S: Items visibles por sector

    S->>B: PATCH /staff/items/{item_id}/status
    B-->>S: previous_status, current_status, status_aggregated
    B-->>C: Evento SSE items.changed

    C->>B: GET /orders/{order_id} (o SSE)
    B-->>C: Tracking actualizado

    S->>B: POST /staff/tables/{table_code}/close-session (admin)
    B-->>S: Mesa cerrada (si no hay pendientes)
    B-->>C: Evento table.session.closed
```

## 3) Estados operativos

```txt
RECEIVED -> IN_PROGRESS -> DONE -> DELIVERED
```

Notas:
- El cambio de estado se hace a nivel item.
- El estado agregado del pedido se recalcula automaticamente.
- Si una mesa tiene pedido activo, nuevos items se agregan al pedido existente.
