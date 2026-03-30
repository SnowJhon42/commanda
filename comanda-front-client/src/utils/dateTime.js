const ARG_TZ = "America/Argentina/Buenos_Aires";

function parseBackendDate(value) {
  if (!value) return null;
  const raw = String(value);
  const normalized =
    /(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !raw.includes("T")
      ? raw
      : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatArgentinaTime(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: ARG_TZ,
      hour: "2-digit",
      minute: "2-digit",
    }).format(parseBackendDate(value));
  } catch {
    return "-";
  }
}
