import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, ChevronDown, ChevronRight, FlaskConical, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import {
  marketLabel, marketsInUse, productTitle,
  useAllFunnels, useFunnelProducts, useFunnelTests, useMarkets,
  type Funnel, type FunnelProduct, type Market,
} from "./funnel-data";

/** Tela inicial: um card por produto principal (da tela de Produtos), com uma bolinha por mercado. */
export function FunisHome() {
  const { data: products = [], isLoading } = useFunnelProducts();
  const { data: markets = [] } = useMarkets();
  const { data: funnels = [] } = useAllFunnels();
  const { data: tests = [] } = useFunnelTests();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const offers = useMemo(() => products.filter((p) => p.kind === "principal"), [products]);
  const visibleIds = useMemo(() => new Set(offers.filter((p) => !p.archived).map((p) => p.id)), [offers]);
  const shownMarkets = useMemo(() => marketsInUse(markets, funnels, visibleIds), [markets, funnels, visibleIds]);

  const funnelsByProduct = useMemo(() => {
    const m = new Map<string, Funnel[]>();
    for (const f of funnels) m.set(f.product_id, [...(m.get(f.product_id) ?? []), f]);
    return m;
  }, [funnels]);

  const withRunningTest = useMemo(
    () => new Set(tests.filter((t) => t.status === "running" && t.product_id).map((t) => t.product_id as string)),
    [tests],
  );

  const term = search.trim().toLowerCase();
  const match = (p: FunnelProduct) =>
    !term || p.name.toLowerCase().includes(term) || (p.code ?? "").toLowerCase().includes(term);
  const byTitle = (a: FunnelProduct, b: FunnelProduct) => productTitle(a).localeCompare(productTitle(b), "pt-BR");

  const active = offers.filter((p) => !p.archived && match(p)).sort(byTitle);
  const archived = offers.filter((p) => p.archived && match(p)).sort(byTitle);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funis"
        description="Ofertas da tela de Produtos. Escolha uma para ver o funil por mercado, front-end ou back-end"
        actions={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar oferta"
              className="h-9 w-full sm:w-60 pl-8 pr-8"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Rodando (front ou back)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Parado ou sem funil</span>
        <span>Oferta nova, sigla ou arquivar: na tela de <Link to="/products" className="text-primary hover:underline">Produtos</Link></span>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : active.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhuma oferta encontrada.</div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {active.map((p) => (
            <OfferCard key={p.id} product={p} markets={shownMarkets}
              funnels={funnelsByProduct.get(p.id) ?? []} hasTest={withRunningTest.has(p.id)} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {showArchived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Archive className="h-4 w-4" />
            Arquivados ({archived.length})
          </button>
          {showArchived && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-70">
              {archived.map((p) => (
                <OfferCard key={p.id} product={p} markets={markets}
                  funnels={funnelsByProduct.get(p.id) ?? []} hasTest={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OfferCard({
  product, markets, funnels, hasTest,
}: {
  product: FunnelProduct;
  markets: Market[];
  funnels: Funnel[];
  hasTest: boolean;
}) {
  const shown = markets;
  return (
    <Link
      to="/funis/$productId"
      params={{ productId: product.id }}
      className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/30"
    >
      <div className="flex items-center justify-between gap-2 min-h-5">
        <span className="font-mono text-xs text-muted-foreground">{product.code ?? "sem sigla"}</span>
        {hasTest && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
            <FlaskConical className="h-3 w-3" /> Teste rodando
          </span>
        )}
      </div>
      <div className="mt-1 mb-3 font-medium leading-snug">{productTitle(product)}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {shown.length === 0 && <span className="text-[11px] text-muted-foreground">Nenhum funil cadastrado</span>}
        {shown.map((m) => {
          const mine = funnels.filter((f) => f.language_id === m.id);
          const running = mine.some((f) => f.is_running);
          const tip = mine.length === 0
            ? `${marketLabel(m)}: sem funil`
            : `${marketLabel(m)}: ${mine.map((f) => `${f.stage === "BACK" ? "back" : "front"} ${f.is_running ? "rodando" : "parado"}`).join(", ")}`;
          return (
            <span key={m.id} title={tip} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", running ? "bg-success" : "bg-muted-foreground/40")} />
              {m.region}
            </span>
          );
        })}
      </div>
    </Link>
  );
}
