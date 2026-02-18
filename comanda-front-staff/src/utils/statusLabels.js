export function statusLabel(status) {
  if (status === "RECEIVED") return "Recibido";
  if (status === "IN_PROGRESS") return "En preparacion";
  if (status === "DONE") return "Listo";
  if (status === "DELIVERED") return "Entregado";
  if (status === "PARCIAL") return "Parcial";
  return status;
}
