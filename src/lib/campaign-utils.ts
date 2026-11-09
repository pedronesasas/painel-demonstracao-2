export function getPhaseFromDate(date: Date | string | null | undefined): "nurture" | "sale" {
  if (!date) return "nurture";
  const d = typeof date === "string" ? new Date(date) : date;
  const day = d.getDay(); // 0 Sun, 6 Sat
  return day === 0 || day === 6 ? "sale" : "nurture";
}

export function rate(num: number, denom: number): number {
  if (!denom) return 0;
  return num / denom;
}

/**
 * O export do GetResponse traz a tag de nome como {{CONTACT `subscriber_first_name`}}.
 * No NEXUS ela vira [[firstname]], a forma que o time usa na copy.
 */
export const FIRSTNAME_TAG = "[[firstname]]";
export function normalizeMergeTags(text: string): string {
  return text.replace(/\{\{\s*CONTACT\s*`subscriber_first_name`\s*\}\}/gi, FIRSTNAME_TAG);
}

export function formatPercent(v: number, digits = 2): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatCurrencyBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatCurrency(v: number, currency = "BRL", locale?: string): string {
  const lc = locale ?? (currency === "BRL" ? "pt-BR" : currency === "MXN" ? "es-MX" : currency === "EUR" ? "de-DE" : "en-US");
  try {
    return v.toLocaleString(lc, { style: "currency", currency });
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function formatCampaignCode(week: number): string {
  return `S${String(week).padStart(2, "0")}`;
}

/**
 * Código completo da campanha: `S01 - PRODUTO [MERCADO]`.
 * Inclui o mercado para que a constraint UNIQUE(code, year) permita a
 * mesma semana/produto em mercados diferentes.
 */
export function buildCampaignCode(
  week: number,
  productName: string,
  marketCode: string | null | undefined,
): string {
  const base = `${formatCampaignCode(week)} - ${productName.toUpperCase()}`;
  const m = (marketCode ?? "").trim().toUpperCase();
  return m ? `${base} [${m}]` : base;
}

export const DAYS_OF_WEEK = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
] as const;

export function dayToPhase(day: string): "nurture" | "sale" {
  return day === "Sábado" || day === "Domingo" ? "sale" : "nurture";
}

// --- Email spreadsheet auto-detection ---

import * as XLSX from "xlsx";

const EMAIL_FIELD_ALIASES: Record<string, string[]> = {
  subject: ["assunto"],
  message_name: ["nome da mensagem", "nome"],
  sent_at: ["enviado em"],
  created_at: ["criado em"],
  sent_count: ["enviado", "enviados"],
  opened_count: ["aberta", "abertos", "abertas"],
  clicked_count: ["clicados", "cliques"],
  unsubscribed_count: ["descadastro", "descadastros"],
};

/**
 * Extracts the real send date from a message name like
 * "S25 - BRASIL - 20/06/2026 - 11H". Returns null if no DD/MM/AAAA found.
 */
export function parseDateFromMessageName(name: unknown): Date | null {
  if (!name) return null;
  const s = String(name);
  const m = s.match(/\b(\d{2})\/(\d{2})\/(\d{4})(?:\s*-\s*(\d{1,2})\s*H)?/i);
  if (!m) return null;
  const [, dd, mm, yyyy, hh] = m;
  const day = Number(dd), month = Number(mm) - 1, year = Number(yyyy);
  const hour = hh ? Number(hh) : 0;
  const d = new Date(year, month, day, hour, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function normalize(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface EmailSheetDetection {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  mapping: Record<string, string>; // system field -> header name
  matchedFields: string[];
}

/**
 * Scans all sheets in a workbook (XLSX.WorkBook) and returns the first one that
 * looks like an email-messages export (has Assunto + at least a few metrics).
 * Returns null if nothing matches — caller should fall back to manual mapping.
 */
export function detectEmailSheet(workbook: XLSX.WorkBook): EmailSheetDetection | null {
  let best: EmailSheetDetection | null = null;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    if (!json.length) continue;
    const headers = Object.keys(json[0]);
    const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalize(h) }));

    const mapping: Record<string, string> = {};
    for (const [field, aliases] of Object.entries(EMAIL_FIELD_ALIASES)) {
      const hit = normalizedHeaders.find((h) => aliases.includes(h.norm));
      if (hit) mapping[field] = hit.raw;
    }

    // Must have subject + at least 2 other metrics to count as email sheet
    if (!mapping.subject) continue;
    const matchedFields = Object.keys(mapping);
    if (matchedFields.length < 3) continue;

    if (!best || matchedFields.length > best.matchedFields.length) {
      best = { sheetName: name, headers, rows: json, mapping, matchedFields };
    }
  }

  return best;
}
