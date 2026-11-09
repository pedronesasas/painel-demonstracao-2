import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------- Date helpers (pt-BR) ----------
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    // Plain ISO date "YYYY-MM-DD" → parse as local date to avoid TZ shift.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateBR(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTimeBR(value: Date | string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// "Hoje" no fuso local, em "AAAA-MM-DD" (toISOString usa UTC e vira o dia às 21h de Brasília)
export function todayLocalISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Prazo curto: "Hoje", "Amanhã", "Ontem", "há 3 dias", "qua", "12 out" ou "12/10/27" (outro ano)
export function relativeDueBR(iso: string, today = todayLocalISO()): string {
  const d = toDate(iso);
  const t = toDate(today);
  if (!d || !t) return "—";
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  if (diff < -1) return `há ${-diff} dias`;
  if (diff <= 6) return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return d
    .toLocaleDateString("pt-BR", d.getFullYear() === t.getFullYear()
      ? { day: "2-digit", month: "short" }
      : { day: "2-digit", month: "2-digit", year: "2-digit" })
    .replace(" de ", " ")
    .replace(".", "");
}

// ---------- Duration helpers ----------
export function formatDurationMinutes(seconds: number): string {
  const totalMin = Math.round((seconds ?? 0) / 60);
  return `${totalMin} min`;
}

export function formatDurationHM(seconds: number): string {
  const totalMin = Math.round((seconds ?? 0) / 60);
  if (totalMin < 60) return `${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const r = totalMin % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

export function formatDurationDual(seconds: number): string {
  return `${formatDurationMinutes(seconds)} · ${formatDurationHM(seconds)}`;
}

export function formatDurationHMS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}min`);
  if (rem > 0 || parts.length === 0) parts.push(`${rem}s`);
  return parts.join(" ");
}

export function secondsToHMS(seconds: number): { h: number; m: number; s: number } {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function hmsToSeconds(h: number | string, m: number | string, s: number | string): number {
  const H = Math.max(0, Math.floor(Number(h) || 0));
  const M = Math.max(0, Math.floor(Number(m) || 0));
  const S = Math.max(0, Math.floor(Number(s) || 0));
  return H * 3600 + M * 60 + S;
}
