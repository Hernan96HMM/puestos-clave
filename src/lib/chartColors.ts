// Espeja los valores de :root en src/app/globals.css — mismos colores que ya
// usan los Badge de riesgo (bg-risk-high-bg text-risk-high, etc.), para que
// un gráfico de "PUESTO CLAVE" use el mismo rojo que ya significa "riesgo
// alto" en el resto de la app, en vez de una paleta nueva de Recharts.
// Si globals.css cambia estos hex, actualizar acá también — Recharts recibe
// colores como props (fill/stroke), no puede leer clases de Tailwind.
export const CHART_COLORS = {
  riesgoAlto: "#b91c1c",
  riesgoMedio: "#92400e",
  riesgoBajo: "#15803d",
  secondary: "#2ba5d6",
  textMuted: "#5a6472",
  border: "#e2e8f0",
} as const;
