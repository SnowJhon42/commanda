import "./globals.css";

export const metadata = {
  title: "COMANDA | Orden operativo y mejor experiencia para restaurantes",
  description:
    "COMANDA ayuda a restaurantes y bares a ordenar pedidos, reducir errores, mejorar tiempos y captar feedback real para ofrecer una experiencia mas clara y generar difusion organica.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
