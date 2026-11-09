import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ExternalLink, FlaskConical, ListOrdered, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STEPS, STAGE_HINT, STAGE_LABEL, formatPrice, funnelKeys, marketLabel, marketsInUse, productTitle,
  useAllFunnels, useFunnelProducts, useFunnelSteps, useFunnelTests, useMarkets, useProductLocalizations,
  useProductVsls, vslTypeForStep,
  type Funnel, type FunnelStage, type Market,
} from "./funnel-data";
import { FunnelChart, StepDetail, shortUrl, type StepView } from "./FunnelChart";
import { FunnelInfoDialog, StepDialog, StepsEditor } from "./FunnelEditors";
import { FunnelTests } from "./FunnelTests";

const PLATFORM_NAME: Record<string, string> = { plataforma_a: "Plataforma A", plataforma_b: "Plataforma B" };

export function FunnelPage({
  productId, region: regionParam, stage: stageParam,
}: {
  productId: string;
  /** Região do mercado no link (BR, LATAM, ALE, FRA, ITA…) */
  region?: string;
  stage?: FunnelStage;
}) {
  const { canEditTab, user } = useAuth();
  // Admin ou perfil com "editar Funis" (mesma regra da RLS)
  const canEdit = canEditTab("funnels");
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: products = [], isLoading: loadingProducts } = useFunnelProducts();
  const { data: markets = [] } = useMarkets();
  const { data: funnels = [] } = useAllFunnels();
  const { data: tests = [] } = useFunnelTests();
  const { data: locs = [] } = useProductLocalizations(productId);
  const { data: vsls = [] } = useProductVsls(productId);
  const product = products.find((p) => p.id === productId) ?? null;

  const myFunnels = useMemo(() => funnels.filter((f) => f.product_id === productId), [funnels, productId]);

  // Mercados: os que têm funil em alguma oferta ativa, mais os desta oferta
  const shownMarkets = useMemo(() => {
    const visible = new Set(products.filter((p) => p.kind === "principal" && !p.archived).map((p) => p.id));
    visible.add(productId);
    return marketsInUse(markets, funnels, visible);
  }, [markets, funnels, products, productId]);
  const otherMarkets = markets.filter((m) => m.active && !shownMarkets.some((s) => s.id === m.id));

  // Sem mercado/etapa no link: abre o primeiro funil que existe (rodando primeiro, na ordem dos mercados)
  const fallback = useMemo(() => {
    const pos = (f: Funnel) => {
      const i = shownMarkets.findIndex((m) => m.id === f.language_id);
      return (f.is_running ? 0 : 1000) + (i < 0 ? 999 : i) * 2 + (f.stage === "FRONT" ? 0 : 1);
    };
    return [...myFunnels].sort((a, b) => pos(a) - pos(b))[0];
  }, [myFunnels, shownMarkets]);

  const market: Market | null =
    markets.find((m) => m.region === regionParam)
    ?? markets.find((m) => m.id === fallback?.language_id)
    ?? shownMarkets[0] ?? markets[0] ?? null;
  const stage: FunnelStage = stageParam ?? (regionParam ? undefined : fallback?.stage) ?? "FRONT";

  const funnel = market ? myFunnels.find((f) => f.language_id === market.id && f.stage === stage) ?? null : null;
  const loc = market ? locs.find((l) => l.language_id === market.id) ?? null : null;
  const platform = loc?.platform ?? null;

  const { data: steps = [] } = useFunnelSteps(funnel?.id ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Etapa + o que vem dos outros cadastros (VSL e preço de Produtos)
  const views: StepView[] = useMemo(() => steps.map((s) => {
    const vsl = s.vsl_id ? vsls.find((v) => v.id === s.vsl_id) ?? null : null;
    if (s.price != null) {
      return { ...s, vsl, shownPrice: s.price, shownCurrency: s.currency ?? market?.currency ?? null, priceFromProducts: false };
    }
    if (s.kind === "entrada" && loc?.price) {
      return { ...s, vsl, shownPrice: loc.price, shownCurrency: loc.currency ?? market?.currency ?? null, priceFromProducts: true };
    }
    return { ...s, vsl, shownPrice: null, shownCurrency: null, priceFromProducts: false };
  }), [steps, vsls, loc, market]);

  useEffect(() => {
    const sorted = [...views].sort((a, b) => a.position - b.position);
    if (!sorted.some((s) => s.id === selectedId)) setSelectedId(sorted[0]?.id ?? null);
  }, [views, selectedId]);

  const refreshAll = () => qc.invalidateQueries({ queryKey: funnelKeys.all });

  const go = (next: { region?: string; stage?: FunnelStage }) =>
    navigate({
      to: "/funis/$productId",
      params: { productId },
      search: {
        mercado: next.region ?? market?.region ?? undefined,
        etapa: (next.stage ?? stage) === "BACK" ? "back" : "front",
      },
      replace: true,
    });

  const createFunnel = async () => {
    if (!market) return;
    const { data, error } = await supabase.from("funnels" as never)
      .insert({ product_id: productId, language_id: market.id, stage, created_by: userId } as never)
      .select("id").single();
    if (error) { toast.error(error.message); return; }
    const id = (data as { id: string }).id;
    // Etapas padrão, já com a VSL que está no ar no inventário (quando houver uma só)
    const rows = DEFAULT_STEPS.map((d) => {
      const type = vslTypeForStep(d.key, stage);
      const live = vsls.filter((v) => v.language_id === market.id && v.funnel_stage === stage && !v.parent_id && v.is_live && v.type === type);
      return { ...d, funnel_id: id, created_by: userId, vsl_id: live.length === 1 ? live[0].id : null };
    });
    const ins = await supabase.from("funnel_steps" as never).insert(rows as never);
    if (ins.error) toast.error(ins.error.message);
    else toast.success("Funil criado com as etapas padrão");
    refreshAll();
  };

  const toggleRunning = async (value: boolean) => {
    if (!funnel) return;
    const { error } = await supabase.from("funnels" as never).update({
      is_running: value, running_changed_at: new Date().toISOString(), running_changed_by: userId,
    } as never).eq("id" as never, funnel.id as never);
    if (error) { toast.error(error.message); return; }
    refreshAll();
  };

  if (loadingProducts) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  if (!product) {
    return (
      <div className="space-y-3">
        <BackLink />
        <div className="text-sm text-muted-foreground">Oferta não encontrada.</div>
      </div>
    );
  }

  const runningTests = funnel ? tests.filter((t) => t.funnel_id === funnel.id && t.status === "running") : [];
  const selected = views.find((s) => s.id === selectedId) ?? null;
  const editing = steps.find((s) => s.id === editingStepId) ?? null;

  return (
    <div className="space-y-5">
      <BackLink />

      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">{product.code ?? "sem sigla"}{product.archived ? " · arquivada" : ""}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{productTitle(product)}</h1>
        </div>
        <Link to="/products" className="text-xs text-muted-foreground hover:text-primary">
          Preços, plataforma e sigla: tela de Produtos
        </Link>
      </div>

      {/* Mercado e front/back */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {shownMarkets.map((m) => {
            const running = myFunnels.some((f) => f.language_id === m.id && f.is_running);
            return (
              <button
                key={m.id}
                onClick={() => go({ region: m.region ?? undefined })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                  market?.id === m.id ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", running ? "bg-success" : "bg-muted-foreground/40")} />
                {marketLabel(m)}
              </button>
            );
          })}
          {market && !shownMarkets.some((m) => m.id === market.id) && (
            <span className="inline-flex items-center rounded-full border border-primary bg-primary/15 px-3 py-1 text-sm">{marketLabel(market)}</span>
          )}
          {canEdit && otherMarkets.length > 0 && (
            <Select value="" onValueChange={(id) => go({ region: markets.find((m) => m.id === id)?.region ?? undefined })}>
              <SelectTrigger className="hidden h-8 w-auto gap-1 rounded-full text-xs md:inline-flex"><SelectValue placeholder="Outro mercado" /></SelectTrigger>
              <SelectContent>
                {otherMarkets.map((m) => <SelectItem key={m.id} value={m.id}>{marketLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="inline-flex rounded-full border p-0.5">
          {(["FRONT", "BACK"] as const).map((c) => (
            <button
              key={c}
              onClick={() => go({ stage: c })}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                c === stage ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {STAGE_LABEL[c]} <span className="hidden text-xs text-muted-foreground sm:inline">({STAGE_HINT[c]})</span>
            </button>
          ))}
        </div>
      </div>

      {!market ? (
        <div className="text-sm text-muted-foreground">Nenhum mercado com região em Idiomas.</div>
      ) : !funnel ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <div className="font-medium">Funil ainda não cadastrado</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {productTitle(product)} · {marketLabel(market)} · {STAGE_LABEL[stage]}
          </div>
          {canEdit && (
            <Button className="mt-4" onClick={createFunnel}><Plus className="h-4 w-4" /> Criar funil com as etapas padrão</Button>
          )}
        </div>
      ) : (
        <>
          {/* Status */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-3">
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="mt-1 flex items-center gap-2">
                {canEdit && <Switch checked={funnel.is_running} onCheckedChange={toggleRunning} aria-label="Rodando" className="hidden md:inline-flex" />}
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", funnel.is_running ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                  {funnel.is_running ? "Rodando" : "Parado"}
                </span>
              </div>
              {funnel.running_changed_at && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  marcado em {new Date(funnel.running_changed_at).toLocaleDateString("pt-BR")}
                </div>
              )}
            </div>
            <div className="rounded-xl border bg-card p-3">
              <div className="text-xs text-muted-foreground">Teste</div>
              <div className="mt-1">
                {runningTests.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                    <FlaskConical className="h-3 w-3" /> {runningTests.length === 1 ? "1 rodando" : `${runningTests.length} rodando`}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Nenhum rodando</span>
                )}
              </div>
              {runningTests[0] && <div className="mt-1 truncate text-[11px] text-muted-foreground">{runningTests[0].name}</div>}
            </div>
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  Funil na {platform ? PLATFORM_NAME[platform] ?? platform : "plataforma"}
                </div>
                {canEdit && (
                  <button onClick={() => setInfoOpen(true)} className="hidden text-muted-foreground hover:text-foreground md:inline" aria-label="Editar dados do funil">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-1 font-mono text-sm">{funnel.platform_funnel_code ?? "—"}</div>
              <div className="truncate text-[11px] text-muted-foreground">{funnel.platform_funnel_name ?? "nome não informado"}</div>
              {!platform && (
                <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning">
                  <AlertTriangle className="h-3 w-3" /> plataforma não cadastrada em Produtos
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <div className="text-muted-foreground">
              Entrada em Produtos: {loc ? formatPrice(loc.price, loc.currency ?? market.currency) : "sem preço neste mercado"}
            </div>
            {funnel.entry_page_url && (
              <div>
                <span className="text-muted-foreground">Página de entrada: </span>
                <a href={funnel.entry_page_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
                  {shortUrl(funnel.entry_page_url)} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {funnel.notes && <div className="whitespace-pre-wrap text-muted-foreground">{funnel.notes}</div>}
          </div>

          {/* Fluxograma */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Funil imediato</h2>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setStepsOpen(true)} className="hidden md:inline-flex">
                  <ListOrdered className="h-4 w-4" /> Editar etapas
                </Button>
              )}
            </div>
            {views.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma etapa cadastrada.
                {canEdit && <> Use <strong>Editar etapas</strong> para criar.</>}
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
                <FunnelChart steps={views} selectedId={selectedId} onSelect={setSelectedId} />
                {selected && (
                  <div className="lg:sticky lg:top-4">
                    <StepDetail step={selected} platform={platform} canEdit={canEdit} onEdit={() => setEditingStepId(selected.id)} />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Testes */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Testes deste funil</h2>
            <FunnelTests
              productId={productId}
              funnelId={funnel.id}
              tests={tests}
              canEdit={canEdit}
              userId={userId}
              onChanged={refreshAll}
            />
          </section>
        </>
      )}

      {editing && funnel && (
        <StepDialog
          step={editing}
          steps={steps}
          platform={platform}
          funnel={funnel}
          vsls={vsls}
          productPrice={loc?.price != null ? String(loc.price) : null}
          onClose={() => setEditingStepId(null)}
          onSaved={refreshAll}
        />
      )}
      {stepsOpen && funnel && (
        <StepsEditor funnelId={funnel.id} steps={steps} userId={userId} onClose={() => setStepsOpen(false)} onSaved={refreshAll} />
      )}
      {infoOpen && funnel && (
        <FunnelInfoDialog funnel={funnel} platform={platform} onClose={() => setInfoOpen(false)} onSaved={refreshAll} />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/funis" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Funis
    </Link>
  );
}
