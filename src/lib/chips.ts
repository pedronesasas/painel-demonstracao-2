// Chips de WhatsApp: tipos, status e regras de prazo de recarga.
// Sem React e sem Supabase (só regra), para a tela e quem mais precisar.

export type ChipStatus = "ativo" | "reserva" | "bloqueado" | "perdido";

export type Chip = {
  id: string;
  nickname: string;
  phone: string;
  carrier: string | null;
  usage: string | null;
  status: ChipStatus;
  last_recharge_date: string | null; // "AAAA-MM-DD"
  validity_days: number | null;
  expires_on: string | null; // "AAAA-MM-DD" — recarregar até esta data
  recharge_amount: number | null; // R$
  payer: string | null;
  notes: string | null;
};

export const CHIP_COLUMNS =
  "id,nickname,phone,carrier,usage,status,last_recharge_date,validity_days,expires_on,recharge_amount,payer,notes";

export const CHIP_STATUS_OPTIONS: Array<{
  value: ChipStatus;
  label: string;
  description: string;
  badge: "success" | "info" | "neutral";
}> = [
  { value: "ativo", label: "Ativo", description: "Em uso na operação.", badge: "success" },
  { value: "reserva", label: "Reserva", description: "Guardado para substituir um chip que cair.", badge: "info" },
  { value: "bloqueado", label: "Bloqueado", description: "Número bloqueado no WhatsApp. Não gera alerta de prazo.", badge: "neutral" },
  { value: "perdido", label: "Perdido", description: "Linha cancelada ou chip perdido. Não gera alerta de prazo.", badge: "neutral" },
];

export const CHIP_STATUS: Record<ChipStatus, (typeof CHIP_STATUS_OPTIONS)[number]> = Object.fromEntries(
  CHIP_STATUS_OPTIONS.map((o) => [o.value, o]),
) as Record<ChipStatus, (typeof CHIP_STATUS_OPTIONS)[number]>;

// Prazo só alerta para chip ativo ou reserva; bloqueado/perdido nunca alertam
const ALERT_STATUSES: ReadonlySet<ChipStatus> = new Set<ChipStatus>(["ativo", "reserva"]);
export const ALERT_WINDOW_DAYS = 7;

export function normalizeChip(row: Record<string, unknown>): Chip {
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
  const status = String(row.status ?? "ativo") as ChipStatus;
  return {
    id: String(row.id),
    nickname: String(row.nickname ?? ""),
    phone: String(row.phone ?? ""),
    carrier: str(row.carrier),
    usage: str(row.usage),
    status: status in CHIP_STATUS ? status : "ativo",
    last_recharge_date: str(row.last_recharge_date),
    validity_days: num(row.validity_days),
    expires_on: str(row.expires_on),
    recharge_amount: num(row.recharge_amount),
    payer: str(row.payer),
    notes: str(row.notes),
  };
}

// ---------- Datas "AAAA-MM-DD" ----------
// Sempre como data de calendário (nunca new Date("AAAA-MM-DD"), que é meia-noite
// UTC e vira o dia anterior no Brasil). A conta é feita em UTC só para não
// depender de fuso nem de horário de verão.
function ymd(iso: string | null | undefined): [number, number, number] | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  // Ano incompleto enquanto a pessoa digita no campo de data ("0002-...")
  if (y < 1900) return null;
  return [y, Number(m[2]), Number(m[3])];
}

// Dias inteiros de `fromIso` até `toIso` (negativo se `toIso` já passou)
export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = ymd(fromIso);
  const b = ymd(toIso);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

export function addDaysISO(iso: string, days: number): string | null {
  const p = ymd(iso);
  if (!p || !Number.isFinite(days)) return null;
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + Math.trunc(days)));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ---------- Prazo de recarga ----------
// overdue: vencido | soon: vence hoje ou em até 7 dias | ok: mais de 7 dias
// none: ativo/reserva sem prazo | inactive: bloqueado/perdido (nunca alerta)
export type DeadlineTone = "overdue" | "soon" | "ok" | "none" | "inactive";
export type Deadline = { tone: DeadlineTone; daysLeft: number | null };

export function chipDeadline(chip: Pick<Chip, "status" | "expires_on">, today: string): Deadline {
  const daysLeft = chip.expires_on ? daysBetween(today, chip.expires_on) : null;
  if (!ALERT_STATUSES.has(chip.status)) return { tone: "inactive", daysLeft };
  if (daysLeft === null) return { tone: "none", daysLeft: null };
  if (daysLeft < 0) return { tone: "overdue", daysLeft };
  if (daysLeft <= ALERT_WINDOW_DAYS) return { tone: "soon", daysLeft };
  return { tone: "ok", daysLeft };
}

export function deadlineLabel(daysLeft: number): string {
  if (daysLeft === 0) return "vence hoje";
  if (daysLeft > 0) return `vence em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`;
  const n = -daysLeft;
  return `vencido há ${n} ${n === 1 ? "dia" : "dias"}`;
}

const TONE_RANK: Record<DeadlineTone, number> = { overdue: 0, soon: 1, ok: 2, none: 3, inactive: 4 };

// Vencidos primeiro, depois os que vencem em até 7 dias, depois o resto pela
// data (mais próxima antes), depois os sem prazo; bloqueado/perdido por último.
export function sortChips(chips: Chip[], today: string): Chip[] {
  const byNickname = (a: Chip, b: Chip) =>
    a.nickname.localeCompare(b.nickname, "pt-BR", { numeric: true, sensitivity: "base" });
  return chips
    .map((chip) => ({ chip, d: chipDeadline(chip, today) }))
    .sort((x, y) => {
      const rank = TONE_RANK[x.d.tone] - TONE_RANK[y.d.tone];
      if (rank !== 0) return rank;
      if (x.d.tone === "inactive") {
        if (x.chip.status !== y.chip.status) return x.chip.status === "bloqueado" ? -1 : 1;
        return byNickname(x.chip, y.chip);
      }
      if (x.d.daysLeft !== null && y.d.daysLeft !== null && x.d.daysLeft !== y.d.daysLeft) {
        return x.d.daysLeft - y.d.daysLeft;
      }
      return byNickname(x.chip, y.chip);
    })
    .map((x) => x.chip);
}

export type ChipSummary = {
  total: number;
  active: number; // status ativo
  reserve: number; // status reserva
  dueSoon: number; // ativo/reserva que vencem hoje ou em até 7 dias
  dueToday: number;
  overdue: number; // ativo/reserva vencidos
  toRechargeCount: number; // vencidos + vencem em até 7 dias
  toRechargeAmount: number; // soma do valor da recarga desses
  toRechargeWithoutAmount: number; // quantos desses estão sem valor cadastrado
};

export function summarizeChips(chips: Chip[], today: string): ChipSummary {
  const s: ChipSummary = {
    total: chips.length, active: 0, reserve: 0, dueSoon: 0, dueToday: 0, overdue: 0,
    toRechargeCount: 0, toRechargeAmount: 0, toRechargeWithoutAmount: 0,
  };
  for (const chip of chips) {
    if (chip.status === "ativo") s.active++;
    if (chip.status === "reserva") s.reserve++;
    const d = chipDeadline(chip, today);
    if (d.tone !== "overdue" && d.tone !== "soon") continue;
    if (d.tone === "overdue") s.overdue++;
    else {
      s.dueSoon++;
      if (d.daysLeft === 0) s.dueToday++;
    }
    s.toRechargeCount++;
    if (chip.recharge_amount === null || !Number.isFinite(chip.recharge_amount)) s.toRechargeWithoutAmount++;
    else s.toRechargeAmount += chip.recharge_amount;
  }
  s.toRechargeAmount = Math.round(s.toRechargeAmount * 100) / 100;
  return s;
}

// ---------- Campos do formulário ----------
// Valor em R$: aceita "20", "20,5", "20,50", "1.234,56", "20.50", "R$ 20,00".
// Vazio = null; inválido = NaN.
export function parseMoneyBR(input: string): number | null {
  const s = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s) return null;
  let normalized: string;
  if (s.includes(",")) {
    // Vírgula é o decimal; ponto, se houver, é milhar
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d{0,2}$/.test(s)) return NaN;
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, ""); // "1.234" = mil duzentos e trinta e quatro
  } else {
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    normalized = s;
  }
  const v = Number(normalized.endsWith(".") ? normalized.slice(0, -1) : normalized);
  // numeric(10,2) no banco: até 99.999.999,99
  if (!Number.isFinite(v) || v >= 100_000_000) return NaN;
  return Math.round(v * 100) / 100;
}

export function moneyToInput(v: number | null): string {
  return v === null || !Number.isFinite(v) ? "" : v.toFixed(2).replace(".", ",");
}

// Número só com dígitos e sem o +55, para achar o mesmo chip digitado de
// jeitos diferentes ("+55 11 91234-5678" = "(11) 91234-5678")
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
}

// Validade em dias: inteiro > 0 (até 10 anos). Vazio = null; inválido = NaN.
export function parseValidityDays(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return NaN;
  const v = Number(s);
  return v > 0 && v <= 3650 ? v : NaN;
}

// ---------- Erros ----------
export const MISSING_TABLE_MESSAGE =
  "A tabela de chips ainda não existe no banco — a migração precisa ser aplicada.";

// Tabela ainda não criada (migração não aplicada): Postgres 42P01 ou PostgREST PGRST205
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42P01" || code === "PGRST205") return true;
  const msg = typeof message === "string" ? message.toLowerCase() : "";
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}

export function describeChipError(error: unknown): string {
  if (isMissingTableError(error)) return MISSING_TABLE_MESSAGE;
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (code === "42501") return "Sem permissão para alterar os chips.";
  return typeof message === "string" && message ? message : "Erro inesperado. Tente de novo.";
}
