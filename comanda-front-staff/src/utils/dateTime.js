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

function formatWithOptions(value, options) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: ARG_TZ,
      ...options,
    }).format(parseBackendDate(value));
  } catch {
    return String(value);
  }
}

export function formatArgentinaDateTime(value) {
  return formatWithOptions(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatArgentinaTime(value) {
  return formatWithOptions(value, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
