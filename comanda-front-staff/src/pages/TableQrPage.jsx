"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./TableQrPage.module.css";

const DEFAULT_CLIENT_URL = "https://comanda-cliente.vercel.app";
const DEFAULT_QR_SIZE = 220;

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();
  return trimmed.replace(/\/+$/, "");
}

function buildTableCode(prefix, number) {
  return `${String(prefix || "M").trim() || "M"}${number}`;
}

function buildTableUrl(baseUrl, storeId, tableCode) {
  const url = new URL(`${normalizeBaseUrl(baseUrl) || DEFAULT_CLIENT_URL}/`);
  url.searchParams.set("store_id", String(storeId));
  url.searchParams.set("mesa", tableCode);
  return url.toString();
}

function buildTableUrlWithMode(baseUrl, storeId, tableCode, serviceMode) {
  const url = new URL(buildTableUrl(baseUrl, storeId, tableCode));
  if (serviceMode === "BAR") {
    url.searchParams.set("service_mode", "BAR");
  }
  return url.toString();
}

function buildQrImageUrl(targetUrl, size = DEFAULT_QR_SIZE) {
  const params = new URLSearchParams({
    size: `${size}x${size}`,
    data: targetUrl,
    format: "png",
    qzone: "1",
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

function printQrSheet(cards) {
  if (typeof window === "undefined" || !cards.length) return;
  const win = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
  if (!win) return;

  const html = `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>QR mesas</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; background: #fff; }
        .sheet { padding: 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        .card { border: 1px solid #cbd5e1; border-radius: 18px; padding: 16px; display: grid; gap: 10px; page-break-inside: avoid; }
        .card h2 { margin: 0; font-size: 26px; }
        .meta { color: #475569; font-size: 13px; }
        .qr { width: 100%; aspect-ratio: 1; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 14px; padding: 10px; }
        .url { font-size: 11px; line-height: 1.35; word-break: break-word; color: #334155; }
        @media print {
          .sheet { padding: 12px; gap: 12px; }
          .card { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        ${cards
          .map(
            (card) => `
              <article class="card">
                <div class="meta">Store ID ${card.storeId}</div>
                <h2>${card.tableCode}</h2>
                <img class="qr" src="${card.qrUrl}" alt="QR ${card.tableCode}" />
                <div class="url">${card.targetUrl}</div>
              </article>
            `
          )
          .join("")}
      </div>
      <script>
        window.onload = function () {
          window.print();
        };
      </script>
    </body>
  </html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function TableQrPage({ storeId, initialServiceMode = "RESTAURANTE", title = "QR de mesas" }) {
  const [clientBaseUrl, setClientBaseUrl] = useState(DEFAULT_CLIENT_URL);
  const [tablePrefix, setTablePrefix] = useState("M");
  const [startNumber, setStartNumber] = useState(1);
  const [tableCount, setTableCount] = useState(12);
  const [serviceMode, setServiceMode] = useState(initialServiceMode);
  const [copyState, setCopyState] = useState("");

  useEffect(() => {
    setServiceMode(initialServiceMode === "BAR" ? "BAR" : "RESTAURANTE");
  }, [initialServiceMode]);

  const cards = useMemo(() => {
    const safeStart = Math.max(1, Number(startNumber) || 1);
    const safeCount = Math.min(150, Math.max(1, Number(tableCount) || 1));
    const safeStoreId = Math.max(1, Number(storeId) || 1);

    return Array.from({ length: safeCount }, (_, index) => {
      const tableCode = buildTableCode(tablePrefix, safeStart + index);
      const targetUrl = buildTableUrlWithMode(clientBaseUrl, safeStoreId, tableCode, serviceMode);
      return {
        storeId: safeStoreId,
        tableCode,
        targetUrl,
        qrUrl: buildQrImageUrl(targetUrl),
      };
    });
  }, [clientBaseUrl, serviceMode, startNumber, storeId, tableCount, tablePrefix]);

  const handleCopy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(label);
      window.setTimeout(() => setCopyState(""), 1800);
    } catch {
      setCopyState("No se pudo copiar");
      window.setTimeout(() => setCopyState(""), 1800);
    }
  };

  return (
    <section className="ops-panel menu-admin-shell">
      <div className={`menu-admin-header ${styles.header}`}>
        <div>
          <span className="menu-admin-kicker">Acceso cliente</span>
          <h3>{title}</h3>
          <p className="muted">
            {serviceMode === "BAR"
              ? "Genera QR BAR para mesas con prepago y confirmacion antes de entrar a operacion."
              : "Genera lotes por cantidad de mesas y deja cada QR listo para imprimir o copiar."}
          </p>
        </div>
        <div className="menu-admin-header-actions">
          <button className="btn-secondary" type="button" onClick={() => handleCopy(cards.map((card) => `${card.tableCode} -> ${card.targetUrl}`).join("\n"), "Lote copiado")}>
            Copiar lote
          </button>
          <button className="btn-primary" type="button" onClick={() => printQrSheet(cards)}>
            Imprimir QR
          </button>
        </div>
      </div>

      <div className="menu-admin-overview">
        <div className="menu-overview-stat">
          <span>Store activo</span>
          <strong>{storeId}</strong>
        </div>
        <div className="menu-overview-stat">
          <span>Mesas a generar</span>
          <strong>{cards.length}</strong>
        </div>
        <div className="menu-overview-stat">
          <span>Primera mesa</span>
          <strong>{cards[0]?.tableCode || "-"}</strong>
        </div>
        <div className="menu-overview-stat menu-overview-stat-highlight">
          <span>Base cliente</span>
          <strong>{normalizeBaseUrl(clientBaseUrl) || DEFAULT_CLIENT_URL}</strong>
        </div>
      </div>

      <div className="menu-editor-card">
        <div className="section-head">
          <h4>Configuración del lote</h4>
          <span className="muted">{copyState || "Listo para generar"}</span>
        </div>
        <div className={`form-grid ${styles.formGrid}`}>
          <label className="field">
            URL base cliente
            <input value={clientBaseUrl} onChange={(e) => setClientBaseUrl(e.target.value)} placeholder={DEFAULT_CLIENT_URL} />
          </label>
          <label className="field">
            Flujo QR
            <select value={serviceMode} onChange={(e) => setServiceMode(e.target.value)}>
              <option value="RESTAURANTE">Restaurante</option>
              <option value="BAR">Bar prepago</option>
            </select>
          </label>
          <label className="field">
            Prefijo de mesa
            <input value={tablePrefix} onChange={(e) => setTablePrefix(e.target.value.toUpperCase())} placeholder="M" maxLength={4} />
          </label>
          <label className="field">
            Mesa inicial
            <input type="number" min="1" value={startNumber} onChange={(e) => setStartNumber(e.target.value)} />
          </label>
          <label className="field">
            Cantidad de mesas
            <input type="number" min="1" max="150" value={tableCount} onChange={(e) => setTableCount(e.target.value)} />
          </label>
        </div>
      </div>

      <div className={styles.grid}>
        {cards.map((card) => (
          <article key={card.tableCode} className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <span className={styles.kicker}>Store ID {card.storeId}</span>
                <h4>{card.tableCode}</h4>
              </div>
              <button className="btn-secondary" type="button" onClick={() => handleCopy(card.targetUrl, `${card.tableCode} copiado`)}>
                Copiar link
              </button>
            </div>
            <div className={styles.imageWrap}>
              <img className={styles.image} src={card.qrUrl} alt={`QR ${card.tableCode}`} />
            </div>
            <a className={styles.link} href={card.targetUrl} target="_blank" rel="noreferrer">
              {card.targetUrl}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

export default TableQrPage;
