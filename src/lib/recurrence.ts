// Recorrência do card (coluna cards.recurrence, jsonb). Mesmo formato de CardDetailSheet.tsx.
export type Recurrence = {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly" | "weekdays";
  interval: number;
  days?: number[]; // 0=Dom..6=Sáb (apenas quando frequency='weekdays')
};

const DAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Rótulo curto para o chip do card; null quando a recorrência está desligada
export function recurrenceLabel(rec: Recurrence | null | undefined): string | null {
  if (!rec?.enabled) return null;
  const n = Math.max(1, Number(rec.interval) || 1);
  // Sem frequência o banco (spawn_recurring_card) usa semanal
  switch (rec.frequency ?? "weekly") {
    case "daily": return n === 1 ? "diária" : `a cada ${n} d`;
    case "weekly": return n === 1 ? "semanal" : `a cada ${n} sem`;
    case "monthly": return n === 1 ? "mensal" : `a cada ${n} meses`;
    case "weekdays": {
      const days = [...new Set((rec.days ?? []).map(Number))].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
      const key = days.join(",");
      if (!days.length) return null; // sem dias o banco não cria a próxima ocorrência
      if (days.length === 7) return "diária";
      if (key === "1,2,3,4,5") return "seg–sex";
      if (key === "0,6") return "fim de semana";
      return days.map((d) => DAY_SHORT[d]).join(", ");
    }
    default: return null;
  }
}
