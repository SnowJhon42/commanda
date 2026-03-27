function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sectorLabel(sector) {
  if (sector === "KITCHEN") return "COCINA";
  if (sector === "BAR") return "BAR";
  if (sector === "WAITER") return "MOZO";
  return sector || "-";
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("es-AR");
  } catch {
    return String(value);
  }
}

function buildItemRows(items = []) {
  return items
    .map((item) => {
      const note = String(item?.notes || "").trim();
      return `
        <li class="ticket-item">
          <div class="ticket-line">
            <strong>${escapeHtml(item.qty)}x ${escapeHtml(item.item_name)}</strong>
          </div>
          <div class="ticket-line meta">${escapeHtml(sectorLabel(item.sector))}</div>
          ${note ? `<div class="ticket-line note">Aclaracion: ${escapeHtml(note)}</div>` : ""}
        </li>
      `;
    })
    .join("");
}

function buildTicketSection({ detail, title, subtitle, items }) {
  return `
    <section class="ticket-sheet">
      <header class="ticket-header">
        <div class="ticket-kicker">COMANDA</div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="ticket-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      </header>
      <div class="ticket-meta">
        <div>Mesa: <strong>${escapeHtml(detail.table_code)}</strong></div>
        <div>Pedido: <strong>#${escapeHtml(detail.order_id)}</strong></div>
        <div>Ticket: <strong>${escapeHtml(detail.ticket_number)}</strong></div>
        <div>Fecha: <strong>${escapeHtml(formatDate(new Date().toISOString()))}</strong></div>
      </div>
      <ul class="ticket-items">
        ${buildItemRows(items)}
      </ul>
    </section>
  `;
}

function buildPrintDocument(sections) {
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Comanda</title>
        <style>
          @page {
            margin: 8mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            color: #111;
            background: #fff;
            font-family: "Courier New", monospace;
            font-size: 12px;
          }
          .ticket-sheet {
            width: 100%;
            max-width: 80mm;
            margin: 0 auto;
            padding: 4mm 0;
            page-break-after: always;
          }
          .ticket-sheet:last-child {
            page-break-after: auto;
          }
          .ticket-kicker {
            font-size: 11px;
            letter-spacing: 0.14em;
          }
          .ticket-header h1 {
            margin: 6px 0 4px;
            font-size: 18px;
          }
          .ticket-subtitle {
            margin: 0 0 8px;
            font-size: 12px;
          }
          .ticket-meta {
            border-top: 1px dashed #111;
            border-bottom: 1px dashed #111;
            padding: 8px 0;
            display: grid;
            gap: 4px;
          }
          .ticket-items {
            list-style: none;
            margin: 10px 0 0;
            padding: 0;
            display: grid;
            gap: 10px;
          }
          .ticket-item {
            border-bottom: 1px dotted #666;
            padding-bottom: 8px;
          }
          .ticket-line {
            line-height: 1.4;
          }
          .ticket-line.meta,
          .ticket-line.note {
            color: #444;
            font-size: 11px;
          }
        </style>
      </head>
      <body>
        ${sections.join("")}
        <script>
          window.onload = function () {
            setTimeout(function () {
              window.print();
            }, 150);
          };
          window.onafterprint = function () {
            window.close();
          };
        </script>
      </body>
    </html>
  `;
}

function openPrintWindow(html) {
  const popup = window.open("", "_blank", "width=420,height=760");
  if (!popup) {
    throw new Error("El navegador bloqueo la ventana de impresion.");
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

export function printFullOrderTicket(detail) {
  const html = buildPrintDocument([
    buildTicketSection({
      detail,
      title: "Pedido completo",
      subtitle: `Mesa ${detail.table_code}`,
      items: detail.items || [],
    }),
  ]);
  openPrintWindow(html);
}

export function printOrderCommands(detail) {
  const sectors = ["BAR", "KITCHEN", "WAITER"]
    .map((sector) => ({
      sector,
      items: (detail.items || []).filter((item) => item.sector === sector),
    }))
    .filter((entry) => entry.items.length > 0);

  if (sectors.length === 0) {
    throw new Error("Este pedido no tiene comandas por sector para imprimir.");
  }

  const html = buildPrintDocument(
    sectors.map((entry) =>
      buildTicketSection({
        detail,
        title: `Comanda ${sectorLabel(entry.sector)}`,
        subtitle: `Sector ${sectorLabel(entry.sector)}`,
        items: entry.items,
      })
    )
  );
  openPrintWindow(html);
}

export function printSectorCommand(detail, sector) {
  const items = (detail.items || []).filter((item) => item.sector === sector);
  if (items.length === 0) {
    throw new Error(`Este pedido no tiene items para ${sectorLabel(sector)}.`);
  }

  const html = buildPrintDocument([
    buildTicketSection({
      detail,
      title: `Comanda ${sectorLabel(sector)}`,
      subtitle: `Sector ${sectorLabel(sector)}`,
      items,
    }),
  ]);
  openPrintWindow(html);
}
