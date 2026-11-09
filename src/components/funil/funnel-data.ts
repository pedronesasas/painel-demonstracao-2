/**
 * Dados da área de Funis, no modelo de cadastro único:
 *  - oferta  = produto principal da tela de Produtos (products)
 *  - mercado = idioma da tela de Idiomas (languages, com a região)
 *  - funil   = produto + idioma + FRONT/BACK (tabela funnels)
 *  - preço e plataforma da entrada vêm de Produtos (product_localizations)
 *  - pitch e player da VTurb vêm da VSL (vsls)
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FunnelStage = "FRONT" | "BACK";

export const STAGE_LABEL: Record<FunnelStage, string> = { FRONT: "Front-end", BACK: "Back-end" };
export const STAGE_HINT: Record<FunnelStage, string> = { FRONT: "tráfego", BACK: "base" };

export type FunnelProduct = {
  id: string;
  name: string;
  code: string | null;
  kind: "principal" | "upsell";
  archived: boolean;
};

export type Market = {
  id: string;
  code: string;
  name: string;
  currency: string | null;
  flag: string | null;
  active: boolean;
  position: number;
  region: string | null;
};

export type Localization = {
  product_id: string;
  language_id: string;
  price: number | null;
  currency: string | null;
  platform: string | null;
};

export type Funnel = {
  id: string;
  product_id: string;
  language_id: string;
  stage: FunnelStage;
  is_running: boolean;
  running_changed_at: string | null;
  platform_funnel_code: string | null;
  platform_funnel_name: string | null;
  entry_page_url: string | null;
  notes: string | null;
};

export type StepKind = "entrada" | "upsell" | "downsell" | "extra" | "entregavel";

export type FunnelStep = {
  id: string;
  funnel_id: string;
  key: string;
  kind: StepKind;
  label: string;
  position: number;
  vsl_id: string | null;
  page_url: string | null;
  button_delay_seconds: number | null;
  product_name: string | null;
  product_external_id: string | null;
  offer_name: string | null;
  offer_external_id: string | null;
  checkout_url: string | null;
  price: number | null;
  currency: string | null;
  next_on_buy: string | null;
  next_on_decline: string | null;
  notes: string | null;
};

export type FunnelVsl = {
  id: string;
  name: string;
  product_id: string | null;
  language_id: string | null;
  type: string;
  funnel_stage: FunnelStage;
  pitch_time_seconds: number | null;
  vturb_player_id: string | null;
  is_live: boolean;
  parent_id: string | null;
  part: string | null;
};

export type TestStatus = "running" | "paused" | "finished";

export type FunnelTest = {
  id: string;
  product_id: string | null;
  funnel_id: string | null;
  name: string;
  description: string | null;
  hypothesis: string | null;
  result: string | null;
  conclusion: string | null;
  status: TestStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

export const TEST_STATUS_LABEL: Record<TestStatus, string> = {
  running: "Rodando", paused: "Pausado", finished: "Finalizado",
};

export const funnelKeys = {
  all: ["funis"] as const,
  products: ["funis", "products"] as const,
  markets: ["funis", "markets"] as const,
  funnels: ["funis", "funnels"] as const,
  tests: ["funis", "tests"] as const,
  localizations: (productId: string) => ["funis", "locs", productId] as const,
  vsls: (productId: string) => ["funis", "vsls", productId] as const,
  steps: (funnelId: string) => ["funis", "steps", funnelId] as const,
};

/** Produtos principais (as ofertas) e os upsells, da tela de Produtos. */
export function useFunnelProducts() {
  return useQuery({
    queryKey: funnelKeys.products,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products").select("id,name,code,kind,archived" as never).order("name");
      if (error) throw error;
      return (data ?? []) as unknown as FunnelProduct[];
    },
  });
}

/** Mercados = idiomas ativos com região, da tela de Idiomas. */
export function useMarkets() {
  return useQuery({
    queryKey: funnelKeys.markets,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("languages").select("*").order("position").order("name");
      if (error) throw error;
      return ((data ?? []) as unknown as Market[]).filter((l) => l.region);
    },
  });
}

export function useAllFunnels() {
  return useQuery({
    queryKey: funnelKeys.funnels,
    queryFn: async () => {
      const { data, error } = await supabase.from("funnels" as never).select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Funnel[];
    },
  });
}

export function useFunnelTests() {
  return useQuery({
    queryKey: funnelKeys.tests,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer_tests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FunnelTest[];
    },
  });
}

export function useProductLocalizations(productId: string) {
  return useQuery({
    queryKey: funnelKeys.localizations(productId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_localizations").select("product_id,language_id,price,currency,platform" as never)
        .eq("product_id", productId);
      if (error) throw error;
      return (data ?? []) as unknown as Localization[];
    },
  });
}

export function useProductVsls(productId: string) {
  return useQuery({
    queryKey: funnelKeys.vsls(productId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vsls")
        .select("id,name,product_id,language_id,type,funnel_stage,pitch_time_seconds,vturb_player_id,is_live,parent_id,part" as never)
        .eq("product_id", productId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as FunnelVsl[];
    },
  });
}

export function useFunnelSteps(funnelId: string | null) {
  return useQuery({
    queryKey: funnelKeys.steps(funnelId ?? "none"),
    enabled: !!funnelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_steps" as never).select("*").eq("funnel_id" as never, funnelId as never)
        .order("position" as never);
      if (error) throw error;
      return (data ?? []) as unknown as FunnelStep[];
    },
  });
}

/** Nome sem a sigla: "PR1 - PRODUTO 1" → "Produto 1". */
export function productTitle(p: Pick<FunnelProduct, "name" | "code">): string {
  const raw = p.code ? p.name.replace(new RegExp(`^${p.code}\\s*-\\s*`), "") : p.name;
  if (raw !== raw.toUpperCase()) return raw;
  const small = new Set(["de", "do", "da", "dos", "das", "e", "o", "a"]);
  return raw.toLowerCase().split(/\s+/).map((w, i) =>
    i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function marketLabel(m: Pick<Market, "name" | "flag">): string {
  return `${m.flag ? `${m.flag} ` : ""}${m.name}`;
}

export function formatPrice(price: number | null | undefined, currency: string | null | undefined): string {
  if (price == null) return "—";
  const cur = (currency || "BRL").toUpperCase();
  try {
    return price.toLocaleString("pt-BR", { style: "currency", currency: cur });
  } catch {
    return `${cur} ${price}`;
  }
}

/** Regra do botão: aparece 10 s antes do pitch. Devolve o valor certo quando está fora. */
export function buttonRuleIssue(pitch: number | null | undefined, delay: number | null | undefined): number | null {
  if (pitch == null || delay == null) return null;
  const expected = pitch - 10;
  return delay === expected ? null : expected;
}

/** Como cada plataforma chama os IDs de uma etapa. */
const ID_LABELS: Record<string, { product: string; offer: string; checkout: string; funnel: string }> = {
  plataforma_a: {
    product: "ID do produto (Plataforma A)",
    offer: "ID da oferta (Plataforma A)",
    checkout: "https://checkout.plataforma-a.com/…",
    funnel: "OlFX5u",
  },
  plataforma_b: {
    product: "Código do produto (PPP…)",
    offer: "Código do plano (PPL…)",
    checkout: "https://checkout.plataforma-b.com/…",
    funnel: "",
  },
};
const GENERIC_LABELS = { product: "ID do produto", offer: "ID da oferta / plano", checkout: "", funnel: "" };

export function stepIdLabels(platform: string | null | undefined) {
  return (platform && ID_LABELS[platform]) || GENERIC_LABELS;
}

/** Etapa do funil → tipo de VSL do inventário (para sugerir a VSL certa). */
export function vslTypeForStep(key: string, stage: FunnelStage): string | null {
  if (key === "front") return stage === "BACK" ? "BACK" : "FRONT";
  const m = /^(up|down)sell_(\d)$/.exec(key);
  return m ? `${m[1].toUpperCase()}${m[2]}` : null;
}

/** Etapas padrão sugeridas para um funil novo. */
export const DEFAULT_STEPS: Array<Pick<FunnelStep, "key" | "kind" | "label" | "position">> = [
  { key: "front", kind: "entrada", label: "Entrada", position: 0 },
  { key: "upsell_1", kind: "upsell", label: "Upsell 1", position: 10 },
  { key: "downsell_1", kind: "downsell", label: "Downsell 1", position: 11 },
  { key: "upsell_2", kind: "upsell", label: "Upsell 2", position: 20 },
  { key: "downsell_2", kind: "downsell", label: "Downsell 2", position: 21 },
  { key: "upsell_3", kind: "upsell", label: "Upsell 3", position: 30 },
  { key: "downsell_3", kind: "downsell", label: "Downsell 3", position: 31 },
  { key: "deliverable", kind: "entregavel", label: "Entregável", position: 90 },
];

export const STEP_KIND_LABEL: Record<StepKind, string> = {
  entrada: "Entrada", upsell: "Upsell", downsell: "Downsell", extra: "Etapa extra", entregavel: "Entregável",
};

/**
 * Mercados que aparecem na tela: os que têm funil em alguma oferta não arquivada.
 * Assim nada fica escrito no código (um mercado novo aparece quando ganhar funil).
 */
export function marketsInUse(markets: Market[], funnels: Funnel[], visibleProductIds: Set<string>): Market[] {
  const used = new Set(funnels.filter((f) => visibleProductIds.has(f.product_id)).map((f) => f.language_id));
  return markets.filter((m) => used.has(m.id));
}
