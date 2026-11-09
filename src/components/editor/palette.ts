// Cores que o usuário aplica no conteúdo (texto, marca-texto, célula de tabela).
// São dados salvos no documento, não tokens do tema: por isso ficam em valores fixos.
// Os fundos usam transparência para funcionar sobre o tema escuro e o claro.
// A ordem segue a do ClickUp: vermelho, laranja, amarelo, azul, roxo, rosa, verde, cinza.

export const COLOR_NAMES = ["red", "orange", "yellow", "blue", "purple", "pink", "green", "gray"] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

export const COLOR_LABELS: Record<ColorName, string> = {
  red: "Vermelho",
  orange: "Laranja",
  yellow: "Amarelo",
  blue: "Azul",
  purple: "Roxo",
  pink: "Rosa",
  green: "Verde",
  gray: "Cinza",
};

const TEXT_HEX: Record<ColorName, string> = {
  red: "#f87171",
  orange: "#fb923c",
  yellow: "#facc15",
  blue: "#60a5fa",
  purple: "#a78bfa",
  pink: "#f472b6",
  green: "#34d399",
  gray: "#9ca3af",
};

const FILL_HSLA: Record<ColorName, string> = {
  red: "hsla(0, 80%, 60%, 0.25)",
  orange: "hsla(25, 90%, 60%, 0.28)",
  yellow: "hsla(48, 90%, 60%, 0.30)",
  blue: "hsla(220, 80%, 60%, 0.25)",
  purple: "hsla(265, 70%, 65%, 0.28)",
  pink: "hsla(330, 75%, 65%, 0.25)",
  green: "hsla(140, 60%, 50%, 0.25)",
  gray: "hsla(220, 10%, 50%, 0.25)",
};

export const TEXT_COLORS: Array<{ name: string; value: string }> = COLOR_NAMES.map((c) => ({
  name: COLOR_LABELS[c],
  value: TEXT_HEX[c],
}));

export const FILL_COLORS: Array<{ name: string; value: string }> = COLOR_NAMES.map((c) => ({
  name: COLOR_LABELS[c],
  value: FILL_HSLA[c],
}));

export const FONT_SIZES: Array<{ label: string; value: string | null }> = [
  { label: "Pequena", value: "14px" },
  { label: "Normal", value: null },
  { label: "Média", value: "18px" },
  { label: "Grande", value: "22px" },
  { label: "Enorme", value: "28px" },
];
