function parseBackendDate(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr);
  const normalized =
    /(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !raw.includes("T")
      ? raw
      : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function sectorLabel(sector) {
  if (sector === "KITCHEN") return "COCINA";
  if (sector === "BAR") return "BARRA";
  if (sector === "WAITER") return "MOZO";
  if (sector === "ADMIN") return "ADMIN";
  return sector || "-";
}

export function sectorClass(sector) {
  if (sector === "KITCHEN") return "sector-tag sector-kitchen";
  if (sector === "BAR") return "sector-tag sector-bar";
  if (sector === "WAITER") return "sector-tag sector-waiter";
  return "sector-tag";
}

export function elapsedMinutes(dateStr) {
  const parsed = parseBackendDate(dateStr);
  if (!parsed) return 0;
  const ms = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

export function itemAlertClass(item, actorSector) {
  const minutes = elapsedMinutes(item.created_at || item.updated_at);
  const medium = actorSector === "WAITER" ? 5 : 12;
  const high = actorSector === "WAITER" ? 10 : 20;
  if (minutes >= high) return "alert-high";
  if (minutes >= medium) return "alert-medium";
  return "";
}
