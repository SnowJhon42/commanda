# CTO Reminders

Fecha de actualizacion: 2026-03-28

## Estado ejecutivo

Infraestructura publica confirmada:

- Neon remoto operativo
- Render backend operativo sobre `main`
- Vercel cliente operativo
- Vercel staff operativo

URLs:

- Backend: `https://commanda-apy.onrender.com`
- Cliente: `https://comanda-cliente.vercel.app`
- Staff: `https://comanda-staff.vercel.app`

## Riesgos principales vigentes

1. Confusion entre `COMANDA_LOCAL`, SQLite local y Neon.
2. Mensajes de error genericos en frontend que ocultan `401` o `500` reales.
3. Deploys parciales donde Vercel y Render quedan en commits distintos.
4. Seeds minimos aplicados sobre Neon por error.

## Politica actual

- Todo deploy sale desde `main`.
- Todo cambio que impacte cloud debe quedar documentado.
- Neon no se toca con seeds minimos para "recuperar" menu real.
- Si el frontend dice "no conecta", revisar `Network` antes de asumir red.

## Siguiente objetivo operativo

- consolidar smoke test E2E:
  - cliente crea pedido
  - staff admin ve pedido
  - staff cambia estado
  - cliente ve tracking

## Handoff esperado de cualquier agente

- commit exacto
- que servidor toco
- que endpoint valido
- que deploy quedo live
- riesgo residual
