// Prioridade do card: rótulo e cor da bandeira num lugar só (esteira e card aberto).
// Cores só por token (styles.css): Urgente = destructive, Alta = warning,
// Média = priority-medium (azul claro), Baixa = priority-low (cinza claro).

export type Priority = "low" | "medium" | "high" | "urgent";

// Ordem do seletor, da menor para a maior
export const PRIORITY_ORDER: Priority[] = ["low", "medium", "high", "urgent"];

export const PRIORITY_META: Record<Priority, {
  label: string;
  /** Cor da bandeira (usar junto com fill-current: bandeira sempre preenchida) */
  flag: string;
  /** Chip do card na esteira: borda, fundo e texto na cor da prioridade */
  chip: string;
}> = {
  urgent: { label: "Urgente", flag: "text-destructive", chip: "border-destructive/30 bg-destructive/10 text-destructive" },
  high: { label: "Alta", flag: "text-warning", chip: "border-warning/30 bg-warning/10 text-warning" },
  medium: { label: "Média", flag: "text-priority-medium", chip: "border-priority-medium/30 bg-priority-medium/10 text-priority-medium" },
  low: { label: "Baixa", flag: "text-priority-low", chip: "border-priority-low/30 bg-priority-low/10 text-priority-low" },
};

// Na esteira a bandeira só aparece em Alta e Urgente (Média é o padrão e vira ruído)
export function showsFlagOnCard(p: string): p is "high" | "urgent" {
  return p === "high" || p === "urgent";
}
