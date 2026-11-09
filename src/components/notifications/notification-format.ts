import { AtSign, Bell, ListChecks, MessageSquare, UserPlus, type LucideIcon } from "lucide-react";

// ---------- Tipos de notificação ----------
// Tipo desconhecido (criado no banco depois desta tela) cai no genérico, sem quebrar.
// Cores: roxo = menção, verde = trabalho para você, azul = conversa.
type TypeMeta = { icon: LucideIcon; phrase: string; badge: string };

const TYPE_META: Record<string, TypeMeta> = {
  mention: { icon: AtSign, phrase: "mencionou você", badge: "bg-primary-strong text-primary-foreground" },
  assigned: { icon: UserPlus, phrase: "atribuiu um card a você", badge: "bg-success text-success-foreground" },
  subtask_assigned: { icon: ListChecks, phrase: "passou uma subtarefa para você", badge: "bg-success text-success-foreground" },
  comment: { icon: MessageSquare, phrase: "comentou num card seu", badge: "bg-info text-info-foreground" },
};
const GENERIC_META: TypeMeta = { icon: Bell, phrase: "atualizou um card", badge: "bg-muted text-muted-foreground" };

export function typeMeta(type: string): TypeMeta {
  return TYPE_META[type] ?? GENERIC_META;
}

// ---------- Pessoas ----------
export function initials(name?: string | null) {
  const s = (name ?? "?").trim() || "?";
  const parts = s.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || s[0].toUpperCase();
}

// Mesma cor por pessoa do resto do app (hash do id → um dos 8 tons de avatar)
const TONES = ["bg-avatar-1", "bg-avatar-2", "bg-avatar-3", "bg-avatar-4", "bg-avatar-5", "bg-avatar-6", "bg-avatar-7", "bg-avatar-8"] as const;
export function avatarTone(id?: string | null) {
  if (!id) return "bg-muted";
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

// ---------- Datas ----------
const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Diferença em dias de calendário (0 = mesmo dia, 1 = ontem...)
const daysBetween = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);

/** "agora", "há 5 min", "há 2 h", "ontem às 14:30", "12 set" ou "12/09/25" */
export function timeAgoBR(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const days = daysBetween(d, now);
  if (days <= 0) return `há ${Math.floor(mins / 60)} h`;
  if (days === 1) return `ontem às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return d
    .toLocaleDateString("pt-BR", d.getFullYear() === now.getFullYear()
      ? { day: "2-digit", month: "short" }
      : { day: "2-digit", month: "2-digit", year: "2-digit" })
    .replace(" de ", " ")
    .replace(".", "");
}

/** Data completa para o title: "quinta-feira, 2 de outubro de 2026 às 14:30" */
export function fullDateTimeBR(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
}

export type DayGroupKey = "today" | "yesterday" | "week" | "older";
const GROUP_LABEL: Record<DayGroupKey, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  week: "Esta semana",
  older: "Anteriores",
};

function dayGroup(iso: string, now: Date): DayGroupKey {
  const d = new Date(iso);
  const days = daysBetween(d, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  // Semana começa na segunda-feira
  const weekStart = startOfDay(now).getTime() - ((now.getDay() + 6) % 7) * DAY;
  return d.getTime() >= weekStart ? "week" : "older";
}

/** Agrupa (lista já em ordem do mais novo) em Hoje / Ontem / Esta semana / Anteriores */
export function groupByDay<T extends { created_at: string }>(items: T[], now = new Date()) {
  const order: DayGroupKey[] = ["today", "yesterday", "week", "older"];
  const map = new Map<DayGroupKey, T[]>();
  for (const it of items) {
    const k = dayGroup(it.created_at, now);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return order
    .filter((k) => map.has(k))
    .map((k) => ({ key: k, label: GROUP_LABEL[k], items: map.get(k)! }));
}

// ---------- Prazos ----------
/** "Atrasado há 3 dias", "Atrasado desde ontem", "Vence hoje", "Vence amanhã" */
export function deadlineLabel(days: number): string {
  if (days < -1) return `Atrasado há ${-days} dias`;
  if (days === -1) return "Atrasado desde ontem";
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return `Vence em ${days} dias`;
}

/** Cor do rótulo: atrasado (vermelho), hoje (âmbar), amanhã (neutro) */
export function deadlineTone(days: number): { pill: string; icon: string } {
  if (days < 0) return { pill: "border-destructive/30 bg-destructive/10 text-destructive", icon: "bg-destructive/10 text-destructive" };
  if (days === 0) return { pill: "border-warning/30 bg-warning/10 text-warning", icon: "bg-warning/10 text-warning" };
  return { pill: "border-border bg-muted text-muted-foreground", icon: "bg-muted text-muted-foreground" };
}
