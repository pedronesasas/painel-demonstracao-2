// Agrupamento das campanhas por semana + produto.
// No banco existe UMA linha de campanha por língua (Campanha 3 BR, Campanha 3 LATAM, Campanha 3 ALE...);
// aqui elas viram um "grupo" (a semana daquele produto) com várias línguas.
// Arquivo puro: sem React, sem Supabase e sem xlsx (o campaign-utils.ts importa xlsx no topo).
import type { Language } from "@/hooks/use-languages";
import { todayLocalISO } from "@/lib/utils";

// ---------- Tipos ----------

export type GroupLanguage = Pick<
  Language,
  "id" | "code" | "name" | "currency" | "flag" | "position" | "region"
>;

export type CampaignLike = {
  id: string;
  code: string;
  product_name: string;
  week_number: number;
  year: number;
  language_id: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type CampaignTiming = "running" | "upcoming" | "ended" | "unknown";

export type CampaignGroup<T extends CampaignLike = CampaignLike> = {
  key: string;
  year: number;
  week: number;
  /** Nome do produto como está na primeira língua do grupo */
  productName: string;
  slug: string;
  /** Uma entrada por linha de campanha (pode haver duas da mesma língua) */
  members: T[];
  startDate: string | null;
  endDate: string | null;
  timing: CampaignTiming;
};

export type MetricsPhase = "all" | "nurture" | "sale";

/** Linha do RPC campaign_compare_metrics_by_phase (receita já convertida para número) */
export type CampaignMetricsRow = {
  campaign_id: string;
  emails_sent: number;
  emails_opened: number;
  emails_clicked: number;
  emails_unsubscribed: number;
  wa_messages: number;
  wa_reactions: number;
  wa_members: number;
  revenue_email: number;
  revenue_whatsapp: number;
  leads_count: number;
  sales_count: number;
  emails_bounced: number;
  emails_complaints: number;
  /** Soma de "pessoas nos grupos" de cada mensagem (base da taxa de leitura) */
  wa_recipients: number;
  wa_reads: number;
  wa_joined: number;
  wa_left: number;
  /** Receita de vendas sem UTM de campanha (para o total bater com a plataforma) */
  revenue_other: number;
  sales_email_count: number;
  sales_whatsapp_count: number;
  sales_other_count: number;
};

// ---------- Nome do produto, slug e chave do grupo ----------

/** "  Produto   Único " -> "PRODUTO UNICO" (sem acento, maiúsculas, espaços colapsados) */
export function normalizeProductName(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Produto Único" -> "produto-unico" */
export function productSlug(name: string | null | undefined): string {
  const slug = normalizeProductName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "sem-produto";
}

export function formatWeekCode(week: number): string {
  return `Campanha ${week}`;
}

export function buildGroupKey(year: number, week: number, slug: string): string {
  return `${year}-${week}-${slug}`;
}

/** Chave do grupo: "2026-3-produto-2" (ano, número da campanha, produto). Nunca usa o texto do code (sufixos de mercado variam). */
export function campaignGroupKey(c: Pick<CampaignLike, "year" | "week_number" | "product_name">): string {
  return buildGroupKey(c.year, c.week_number, productSlug(c.product_name));
}

export function parseCampaignGroupKey(
  key: string,
): { year: number; week: number; slug: string } | null {
  const m = /^(\d{4})-S?(\d{1,3})-([a-z0-9-]+)$/i.exec(String(key ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1) return null;
  return { year, week, slug: m[3].toLowerCase() };
}

// ---------- Situação pelas datas ----------

/** Situação pela data de hoje (o status do banco é "active" em todas, não serve). */
export function campaignTiming(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  today: string = todayLocalISO(),
): CampaignTiming {
  const start = startDate ? startDate.slice(0, 10) : null;
  const end = endDate ? endDate.slice(0, 10) : null;
  if (!start && !end) return "unknown";
  if (start && today < start) return "upcoming";
  if (end && today > end) return "ended";
  return "running";
}

export const TIMING_LABEL: Record<CampaignTiming, string> = {
  running: "Em andamento",
  upcoming: "Próxima",
  ended: "Encerrada",
  unknown: "Sem datas",
};

export const TIMING_BADGE: Record<CampaignTiming, "success" | "info" | "neutral"> = {
  running: "success",
  upcoming: "info",
  ended: "neutral",
  unknown: "neutral",
};

// ---------- Língua / mercado ----------

/** Rótulo curto do chip: região (BR, LATAM, ALE...) ou o código da língua; sem língua = "Sem mercado" */
export function marketLabel(lang: Pick<GroupLanguage, "code" | "region"> | null | undefined): string {
  if (!lang) return "Sem mercado";
  return lang.region || lang.code;
}

/**
 * Moeda das campanhas: sempre reais, em todas as línguas. As vendas de fora
 * (fora do Brasil, em dólar ou euro) entram convertidas pela PTAX do dia da venda, para dar
 * para somar e comparar regiões. A moeda da língua continua valendo em Produtos e Funis.
 */
export function currencyOf(_lang?: Pick<GroupLanguage, "currency"> | null): string {
  return "BRL";
}

/** Ordena pela posição da língua (sem língua por último), depois nome da língua e código */
export function sortByLanguage<T extends CampaignLike>(
  rows: T[],
  langById: Map<string, GroupLanguage>,
): T[] {
  return [...rows].sort((a, b) => {
    const la = a.language_id ? langById.get(a.language_id) : undefined;
    const lb = b.language_id ? langById.get(b.language_id) : undefined;
    if (la && !lb) return -1;
    if (!la && lb) return 1;
    if (la && lb) {
      if (la.position !== lb.position) return la.position - lb.position;
      const byName = la.name.localeCompare(lb.name, "pt-BR");
      if (byName !== 0) return byName;
    }
    return a.code.localeCompare(b.code, "pt-BR");
  });
}

/**
 * Rótulo de cada membro do grupo. Se a mesma língua aparece duas vezes na semana,
 * a segunda ganha " #2" para não parecer repetida.
 */
export function memberLabels<T extends CampaignLike>(
  members: T[],
  langById: Map<string, GroupLanguage>,
): Map<string, string> {
  const total = new Map<string, number>();
  for (const m of members) {
    const k = m.language_id ?? "__none__";
    total.set(k, (total.get(k) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const m of members) {
    const k = m.language_id ?? "__none__";
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    const base = marketLabel(m.language_id ? langById.get(m.language_id) : null);
    out.set(m.id, (total.get(k) ?? 0) > 1 ? `${base} #${n}` : base);
  }
  return out;
}

// ---------- Agrupamento ----------

function minDate(a: string | null, b: string | null | undefined): string | null {
  const v = b ? b.slice(0, 10) : null;
  if (!v) return a;
  return !a || v < a ? v : a;
}

function maxDate(a: string | null, b: string | null | undefined): string | null {
  const v = b ? b.slice(0, 10) : null;
  if (!v) return a;
  return !a || v > a ? v : a;
}

/**
 * Junta as linhas (uma por língua) em grupos de semana + produto.
 * Ordem: ano desc, semana desc, produto. Nenhuma linha é descartada.
 */
export function groupCampaigns<T extends CampaignLike>(
  rows: T[],
  langById: Map<string, GroupLanguage>,
  today: string = todayLocalISO(),
): CampaignGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    const key = campaignGroupKey(r);
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }

  const groups: CampaignGroup<T>[] = [];
  for (const [key, list] of byKey) {
    const members = sortByLanguage(list, langById);
    let startDate: string | null = null;
    let endDate: string | null = null;
    for (const m of members) {
      startDate = minDate(startDate, m.start_date);
      endDate = maxDate(endDate, m.end_date);
    }
    const first = members[0];
    groups.push({
      key,
      year: first.year,
      week: first.week_number,
      productName: first.product_name,
      slug: productSlug(first.product_name),
      members,
      startDate,
      endDate,
      timing: campaignTiming(startDate, endDate, today),
    });
  }

  return groups.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.week !== b.week) return b.week - a.week;
    return normalizeProductName(a.productName).localeCompare(normalizeProductName(b.productName), "pt-BR");
  });
}

/** "Campanha 3 · PRODUTO 2" */
export function groupTitle(g: Pick<CampaignGroup, "week" | "productName">): string {
  return `${formatWeekCode(g.week)} · ${g.productName.toUpperCase()}`;
}

/** "dd/mm/aaaa – dd/mm/aaaa" (ou null sem datas) */
export function formatPeriod(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = formatDateShort(start);
  const e = formatDateShort(end);
  if (!s && !e) return null;
  return `${s ?? "—"} – ${e ?? "—"}`;
}

function formatDateShort(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
}

// ---------- Métricas: soma, ponderação e receita por moeda ----------

/** Converte a linha crua do RPC (numeric pode vir como texto) */
export function toMetricsRow(raw: Record<string, unknown>): CampaignMetricsRow {
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    campaign_id: String(raw.campaign_id),
    emails_sent: n(raw.emails_sent),
    emails_opened: n(raw.emails_opened),
    emails_clicked: n(raw.emails_clicked),
    emails_unsubscribed: n(raw.emails_unsubscribed),
    wa_messages: n(raw.wa_messages),
    wa_reactions: n(raw.wa_reactions),
    wa_members: n(raw.wa_members),
    revenue_email: n(raw.revenue_email),
    revenue_whatsapp: n(raw.revenue_whatsapp),
    leads_count: n(raw.leads_count),
    sales_count: n(raw.sales_count),
    emails_bounced: n(raw.emails_bounced),
    emails_complaints: n(raw.emails_complaints),
    wa_recipients: n(raw.wa_recipients),
    wa_reads: n(raw.wa_reads),
    wa_joined: n(raw.wa_joined),
    wa_left: n(raw.wa_left),
    revenue_other: n(raw.revenue_other),
    sales_email_count: n(raw.sales_email_count),
    sales_whatsapp_count: n(raw.sales_whatsapp_count),
    sales_other_count: n(raw.sales_other_count),
  };
}

/** Receita total: e-mail + WhatsApp + outras origens */
export function revenueOf(m: CampaignMetricsRow | null | undefined): number {
  if (!m) return 0;
  return m.revenue_email + m.revenue_whatsapp + m.revenue_other;
}

/** Tem algum dado importado (e-mail, WhatsApp ou vendas)? */
export function hasMetricsData(m: CampaignMetricsRow | null | undefined): boolean {
  if (!m) return false;
  return (
    m.emails_sent > 0 ||
    m.wa_messages > 0 ||
    m.wa_members > 0 ||
    m.leads_count > 0 ||
    m.sales_count > 0 ||
    revenueOf(m) !== 0
  );
}

/** Taxa ponderada (soma do numerador / soma do denominador). null quando não há base. */
export function weightedRate(num: number, den: number): number | null {
  if (!den) return null;
  return num / den;
}

export type CurrencyAmount = { currency: string; value: number };

export type MetricTotals = {
  sent: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  waMessages: number;
  waReactions: number;
  waMembers: number;
  waRecipients: number;
  waReads: number;
  leads: number;
  sales: number;
  salesEmail: number;
  salesWhatsapp: number;
  /** Receita separada por moeda, na ordem das línguas. Nunca somar moedas diferentes. */
  revenue: CurrencyAmount[];
  /** Quantos membros têm algum dado */
  withData: number;
  /** Quantos membros já têm a linha de métricas carregada */
  loaded: number;
};

/** Soma as métricas dos membros (volumes somados; taxas ficam para weightedRate). */
export function sumMetrics(
  members: Pick<CampaignLike, "id" | "language_id">[],
  metricsById: Map<string, CampaignMetricsRow> | undefined,
  langById: Map<string, GroupLanguage>,
): MetricTotals {
  const t: MetricTotals = {
    sent: 0,
    opened: 0,
    clicked: 0,
    unsubscribed: 0,
    waMessages: 0,
    waReactions: 0,
    waMembers: 0,
    waRecipients: 0,
    waReads: 0,
    leads: 0,
    sales: 0,
    salesEmail: 0,
    salesWhatsapp: 0,
    revenue: [],
    withData: 0,
    loaded: 0,
  };
  const revenue = new Map<string, number>();
  for (const member of members) {
    const m = metricsById?.get(member.id);
    if (!m) continue;
    t.loaded += 1;
    if (hasMetricsData(m)) t.withData += 1;
    t.sent += m.emails_sent;
    t.opened += m.emails_opened;
    t.clicked += m.emails_clicked;
    t.unsubscribed += m.emails_unsubscribed;
    t.waMessages += m.wa_messages;
    t.waReactions += m.wa_reactions;
    t.waMembers += m.wa_members;
    t.waRecipients += m.wa_recipients;
    t.waReads += m.wa_reads;
    t.leads += m.leads_count;
    t.sales += m.sales_count;
    t.salesEmail += m.sales_email_count;
    t.salesWhatsapp += m.sales_whatsapp_count;
    const currency = currencyOf(member.language_id ? langById.get(member.language_id) : null);
    revenue.set(currency, (revenue.get(currency) ?? 0) + revenueOf(m));
  }
  t.revenue = Array.from(revenue, ([currency, value]) => ({ currency, value }));
  return t;
}

// ---------- Formatação leve (sem depender do campaign-utils/xlsx) ----------

function moneyLocale(currency: string): string {
  return currency === "BRL" ? "pt-BR" : currency === "MXN" ? "es-MX" : currency === "EUR" ? "de-DE" : "en-US";
}

/** Mesmo comportamento do formatCurrency do campaign-utils.ts */
export function formatMoney(v: number, currency = "BRL"): string {
  try {
    return v.toLocaleString(moneyLocale(currency), { style: "currency", currency });
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

/** Símbolo da moeda ("R$", "$", "€"); se a moeda for inválida, devolve o próprio código */
export function currencySymbol(currency = "BRL"): string {
  try {
    const parts = new Intl.NumberFormat(moneyLocale(currency), { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Receita por moeda em uma linha ("R$ 1.200,00 · US$ 80,00"); "—" quando tudo é zero */
export function formatRevenueList(list: CurrencyAmount[]): string {
  const nonZero = list.filter((r) => r.value !== 0);
  if (nonZero.length === 0) return "—";
  return nonZero.map((r) => formatMoney(r.value, r.currency)).join(" · ");
}

/** Taxa em % no mesmo formato do formatPercent do campaign-utils; "—" quando não há base */
export function formatRate(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatInt(v: number): string {
  return v.toLocaleString("pt-BR");
}
