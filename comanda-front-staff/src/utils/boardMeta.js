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
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

export function itemAlertClass(item, actorSector) {
  const minutes = elapsedMinutes(item.updated_at || item.created_at);
  const medium = actorSector === "WAITER" ? 5 : 12;
  const high = actorSector === "WAITER" ? 10 : 20;
  if (minutes >= high) return "alert-high";
  if (minutes >= medium) return "alert-medium";
  return "";
}
