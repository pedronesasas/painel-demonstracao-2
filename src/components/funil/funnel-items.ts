/**
 * Estrutura do funil de uma oferta em uma região/canal.
 *
 * Guardado em offer_regions.funnel_items. Aceita dois formatos:
 *  - novo:    [{ key, label, on }]           — lista editável por oferta
 *  - legado:  { "upsell_1": true, ... }      — mapa das etapas padrão
 * A leitura converte o legado para o novo formato automaticamente.
 */

export type FunnelItem = { key: string; label: string; on: boolean };

/** Linha de offer_region_checkouts: ID da plataforma ligado a uma estrutura. */
export type CheckoutRef = {
  id: string;
  offer_region_id: string;
  platform: string;
  external_id: string;
  label: string | null;
  funnel_item_key?: string | null;
  checkout_url?: string | null;
  page_url?: string | null;
  price?: number | null;
  currency?: string | null;
  /** 'product' = ID do produto na plataforma; 'plan' = ID do plano (checkout). */
  id_kind?: string | null;
  /** Codigo do produto ao qual este plano pertence. */
  product_code?: string | null;
};

export const PLATFORMS = [
  { value: "plataforma_a", label: "Plataforma A" },
  { value: "plataforma_b", label: "Plataforma B" },
];

/** Etapas sugeridas para uma oferta nova. */
export const DEFAULT_FUNNEL_ITEMS: Array<{ key: string; label: string }> = [
  { key: "front", label: "Front" },
  { key: "upsell_1", label: "Upsell 1" },
  { key: "downsell_1", label: "Downsell 1" },
  { key: "upsell_2", label: "Upsell 2" },
  { key: "downsell_2", label: "Downsell 2" },
  { key: "upsell_3", label: "Upsell 3" },
  { key: "downsell_3", label: "Downsell 3" },
  { key: "order_bump", label: "Order bump" },
  { key: "backredirect", label: "Backredirect" },
];

/** Ordem canônica do funil: front, upsells/downsells intercalados, extras no fim. */
const ORDER: Record<string, number> = Object.fromEntries(
  DEFAULT_FUNNEL_ITEMS.map((d, i) => [d.key, i]),
);

/** Order bumps extras e etapas personalizadas entram depois das padrão. */
export function sortFunnelItems(items: FunnelItem[]): FunnelItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const oa = ORDER[a.item.key] ?? (/^order_bump/.test(a.item.key) ? 100 : 200);
      const ob = ORDER[b.item.key] ?? (/^order_bump/.test(b.item.key) ? 100 : 200);
      return oa === ob ? a.i - b.i : oa - ob;
    })
    .map((x) => x.item);
}

const defaultLabel = (key: string) =>
  DEFAULT_FUNNEL_ITEMS.find((d) => d.key === key)?.label ?? key;

/** Converte o valor cru do banco na lista de etapas. */
export function parseFunnelItems(raw: unknown): FunnelItem[] {
  if (Array.isArray(raw)) {
    const parsed = raw
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        key: String(x.key ?? ""),
        label: String(x.label ?? defaultLabel(String(x.key ?? ""))),
        on: x.on === true,
      }))
      .filter((x) => x.key.length > 0);
    return withFront(parsed);
  }
  if (raw && typeof raw === "object") {
    // Formato legado: mapa {chave: ligado}
    const map = raw as Record<string, unknown>;
    return withFront(DEFAULT_FUNNEL_ITEMS.map((d) => ({
      key: d.key, label: d.label, on: d.key === "front" ? true : map[d.key] === true,
    })));
  }
  // Sem nada salvo ainda: sugere as etapas padrão, todas desligadas
  return withFront(DEFAULT_FUNNEL_ITEMS.map((d) => ({ key: d.key, label: d.label, on: false })));
}

/** O Front é a entrada do funil: sempre existe. */
function withFront(items: FunnelItem[]): FunnelItem[] {
  const list = items.some((i) => i.key === "front")
    ? items
    : [{ key: "front", label: "Front", on: true }, ...items];
  return sortFunnelItems(list);
}

export function countFunnelOn(items: FunnelItem[]): number {
  return items.reduce((n, i) => n + (i.on ? 1 : 0), 0);
}

/** Rótulos das etapas que faltam — usado no tooltip do card. */
export function missingFunnelLabels(items: FunnelItem[]): string[] {
  return items.filter((i) => !i.on).map((i) => i.label);
}

/** Chave única para uma etapa personalizada nova. */
export function newFunnelKey(): string {
  return `custom_${Math.random().toString(36).slice(2, 8)}`;
}

/** Como cada plataforma chama o identificador do checkout. */
export const PLATFORM_FIELDS: Record<string, { idLabel: string; hint: string }> = {
  plataforma_b: { idLabel: "ID do Plano", hint: "ex.: PPLQQQ8KG" },
  plataforma_a: { idLabel: "ID do produto", hint: "ID do checkout na Plataforma A" },
};

export function platformFields(platform: string | null | undefined) {
  return (platform && PLATFORM_FIELDS[platform]) || { idLabel: "ID do checkout", hint: "" };
}

export function platformLabel(platform: string | null | undefined) {
  return PLATFORMS.find((p) => p.value === platform)?.label ?? platform ?? "";
}

/** Na Plataforma B o prefixo revela o tipo do ID. */
export function inferIdKind(platform: string, externalId: string): "product" | "plan" | null {
  if (platform !== "plataforma_b") return null;
  const v = externalId.trim().toUpperCase();
  if (v.startsWith("PPL")) return "plan";
  if (v.startsWith("PPP")) return "product";
  return null;
}

export const ID_KIND_LABEL: Record<string, string> = {
  product: "ID do Produto",
  plan: "ID do Plano",
};
