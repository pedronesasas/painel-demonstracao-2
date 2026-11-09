import type { CSSProperties } from "react";

// Tema dos gráficos (recharts), só com tokens do styles.css.
// Uso: <XAxis dataKey="x" {...chartAxisProps} />, <CartesianGrid {...chartGridProps} />,
// <Tooltip {...chartTooltipProps} />

// Eixos X e Y: linha e texto em muted (o recharts pinta o texto com o stroke)
export const chartAxisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 12,
};

// Grade tracejada na cor da borda
export const chartGridProps = {
  strokeDasharray: "3 3",
  stroke: "var(--border)",
};

const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
};

const tooltipLabelStyle: CSSProperties = {
  color: "var(--popover-foreground)",
  fontWeight: 600,
};

// Tooltip na superfície de popover; a faixa de hover sai do cinza claro padrão
export const chartTooltipProps = {
  contentStyle: tooltipContentStyle,
  labelStyle: tooltipLabelStyle,
  cursor: { fill: "var(--muted)", fillOpacity: 0.6 },
};
