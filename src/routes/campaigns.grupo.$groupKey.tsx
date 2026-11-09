import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, BarChart3, Languages, TriangleAlert } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useLanguages } from "@/hooks/use-languages";
import { useCampaignMetrics, useWeekCampaigns } from "@/hooks/use-campaign-metrics";
import { CampaignLanguageSwitcher } from "@/components/campaigns/CampaignLanguageSwitcher";
import { CampaignGroupCard } from "@/components/campaigns/CampaignGroupsView";
import { chartAxisProps, chartGridProps, chartTooltipProps } from "@/lib/chart-theme";
import {
  TIMING_BADGE,
  TIMING_LABEL,
  currencyOf,
  formatInt,
  formatMoney,
  formatPeriod,
  formatRate,
  formatRevenueList,
  formatWeekCode,
  groupCampaigns,
  groupTitle,
  hasMetricsData,
  memberLabels,
  parseCampaignGroupKey,
  revenueOf,
  sumMetrics,
  weightedRate,
  type CampaignLike,
  type CampaignMetricsRow,
  type CurrencyAmount,
  type GroupLanguage,
  type MetricTotals,
  type MetricsPhase,
} from "@/lib/campaign-groups";

export const Route = createFileRoute("/campaigns/grupo/$groupKey")({
  head: () => ({
    meta: [
      { title: "Campanha — NEXUS" },
      { name: "description", content: "A campanha em todas as línguas." },
      { property: "og:title", content: "Campanha — NEXUS" },
      { property: "og:description", content: "A campanha em todas as línguas." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="campaigns">
      <AppLayout><CampaignGroupPage /></AppLayout>
    </RequireTabAccess>
  ),
});

const PHASE_LABEL: Record<MetricsPhase, string> = {
  all: "Todas as fases",
  nurture: "Só nutrição",
  sale: "Só venda",
};

function BackButton() {
  return (
    <div className="flex items-center gap-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/campaigns">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </Button>
    </div>
  );
}

function CampaignGroupPage() {
  const { groupKey } = Route.useParams();
  const parsed = parseCampaignGroupKey(groupKey);
  const [phase, setPhase] = useState<MetricsPhase>("all");
  const [tab, setTab] = useState("overview");
  const { data: languages = [] } = useLanguages({ onlyActive: false });
  const langById = useMemo(() => new Map(languages.map((l) => [l.id, l])), [languages]);
  const { data: weekRows, isLoading, isError } = useWeekCampaigns(parsed?.year, parsed?.week);

  const weekGroups = useMemo(() => groupCampaigns(weekRows ?? [], langById), [weekRows, langById]);
  const group = parsed ? weekGroups.find((g) => g.slug === parsed.slug) : undefined;

  const ids = group ? group.members.map((m) => m.id) : [];
  const { data: metricsById, isLoading: metricsLoading, isError: metricsError } = useCampaignMetrics(ids, phase);

  if (!parsed) {
    return (
      <div className="space-y-6">
        <BackButton />
        <Card className="p-8 text-center text-muted-foreground">
          Endereço de campanha inválido.
        </Card>
      </div>
    );
  }

  if (isLoading) return <div className="text-muted-foreground">Carregando...</div>;

  if (isError) {
    return (
      <div className="space-y-6">
        <BackButton />
        <Card className="p-8 text-center text-muted-foreground">
          Não foi possível carregar esta campanha.
        </Card>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-6">
        <BackButton />
        <PageHeader title={`${formatWeekCode(parsed.week)} · ${parsed.year}`} />
        <Card className="flex items-start gap-3 border-warning/40 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              Não achamos o produto "{parsed.slug}" na {formatWeekCode(parsed.week)} de {parsed.year}.
            </p>
            <p className="text-muted-foreground">
              {weekGroups.length > 0
                ? "O nome do produto pode ter mudado. Estas são as cadastradas com este número:"
                : "Não há campanhas cadastradas com este número."}
            </p>
          </div>
        </Card>
        {weekGroups.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {weekGroups.map((g) => (
              <CampaignGroupCard key={g.key} group={g} langById={langById} showMetrics={false} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const period = formatPeriod(group.startDate, group.endDate);

  return (
    <div className="space-y-6">
      <BackButton />

      <div className="space-y-3">
        <div>
          <div className="font-mono text-sm text-primary">Todas as línguas</div>
          <PageHeader title={groupTitle(group)} />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>Campanha {group.week} / {group.year}</span>
            {period && <span>{period}</span>}
            <Badge variant={TIMING_BADGE[group.timing]}>{TIMING_LABEL[group.timing]}</Badge>
            <span>
              {group.members.length} {group.members.length === 1 ? "língua" : "línguas"}
            </span>
          </div>
        </div>
        <CampaignLanguageSwitcher year={group.year} week={group.week} slug={group.slug} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="self-start">
            <TabsTrigger value="overview"><BarChart3 className="h-4 w-4" /> Visão geral</TabsTrigger>
            <TabsTrigger value="compare"><Languages className="h-4 w-4" /> Comparativo entre línguas</TabsTrigger>
          </TabsList>
          <Select value={phase} onValueChange={(v) => setPhase(v as MetricsPhase)}>
            <SelectTrigger className="h-9 w-full sm:w-[180px]" aria-label="Fase">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{PHASE_LABEL.all}</SelectItem>
              <SelectItem value="nurture">{PHASE_LABEL.nurture}</SelectItem>
              <SelectItem value="sale">{PHASE_LABEL.sale}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {metricsError ? (
          <Card className="mt-4 p-8 text-center text-muted-foreground">
            Não foi possível carregar as métricas.
          </Card>
        ) : metricsLoading || !metricsById ? (
          <div className="mt-4 text-muted-foreground">Carregando métricas...</div>
        ) : (
          <>
            <TabsContent value="overview" className="mt-4 space-y-4">
              <GroupOverview members={group.members} metricsById={metricsById} langById={langById} phase={phase} />
            </TabsContent>
            <TabsContent value="compare" className="mt-4 space-y-4">
              <GroupComparison members={group.members} metricsById={metricsById} langById={langById} phase={phase} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

type SectionProps = {
  members: CampaignLike[];
  metricsById: Map<string, CampaignMetricsRow>;
  langById: Map<string, GroupLanguage>;
  phase: MetricsPhase;
};

function PhaseSalesNote({ phase }: { phase: MetricsPhase }) {
  if (phase === "all") return null;
  return (
    <p className="text-xs text-muted-foreground">
      Receita, vendas, leads e conversão não são separados por fase. Escolha "Todas as fases" para ver esses números.
    </p>
  );
}

// ---------- Visão geral (somado da semana) ----------

function GroupOverview({ members, metricsById, langById, phase }: SectionProps) {
  const totals = sumMetrics(members, metricsById, langById);
  const labels = memberLabels(members, langById);
  const missing = members.filter((m) => !hasMetricsData(metricsById.get(m.id)));

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Soma {members.length === 1 ? "da língua" : `das ${members.length} línguas`} desta campanha
        {phase !== "all" ? ` (${PHASE_LABEL[phase].toLowerCase()})` : ""}. As taxas são calculadas sobre o
        total (ex.: abertos de todas as línguas ÷ enviados de todas as línguas), não pela média das taxas.
      </p>
      {missing.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Sem dados importados: {missing.map((m) => labels.get(m.id)).join(", ")}.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiBox label="E-mails enviados" value={formatInt(totals.sent)} />
        <KpiBox
          label="Taxa de abertura"
          value={formatRate(weightedRate(totals.opened, totals.sent))}
          sub={`${formatInt(totals.opened)} abertos`}
        />
        <KpiBox
          label="CTR"
          value={formatRate(weightedRate(totals.clicked, totals.sent))}
          sub={`${formatInt(totals.clicked)} cliques`}
        />
        <KpiBox
          label="Descadastro"
          value={formatRate(weightedRate(totals.unsubscribed, totals.sent))}
          sub={`${formatInt(totals.unsubscribed)} descadastros`}
        />
        <KpiBox label="Mensagens WhatsApp" value={formatInt(totals.waMessages)} />
        <KpiBox
          label="Leitura WhatsApp"
          value={formatRate(weightedRate(totals.waReads, totals.waRecipients))}
          sub={`${formatInt(totals.waReads)} leituras`}
        />
        <KpiBox label="Reações" value={formatInt(totals.waReactions)} />
        {phase === "all" && (
          <>
            <KpiBox label="Receita total" value={<RevenueLines list={totals.revenue} />} sub={revenueSub(totals)} />
            <KpiBox
              label="Vendas"
              value={formatInt(totals.sales)}
              sub={`${formatInt(totals.salesEmail)} e-mail · ${formatInt(totals.salesWhatsapp)} WhatsApp`}
            />
            <KpiBox label="Leads" value={formatInt(totals.leads)} />
            <KpiBox
              label="Conversão"
              value={formatRate(weightedRate(totals.sales, totals.leads))}
              sub="vendas ÷ leads"
            />
          </>
        )}
      </div>
      <PhaseSalesNote phase={phase} />
    </>
  );
}

function revenueSub(totals: MetricTotals): string | undefined {
  const currencies = totals.revenue.filter((r) => r.value !== 0).length;
  return currencies > 1 ? "Cada moeda separada (moedas diferentes não são somadas)" : undefined;
}

function RevenueLines({ list }: { list: CurrencyAmount[] }) {
  const nonZero = list.filter((r) => r.value !== 0);
  if (nonZero.length === 0) {
    return <>{formatMoney(0, list[0]?.currency ?? "BRL")}</>;
  }
  if (nonZero.length === 1) return <>{formatMoney(nonZero[0].value, nonZero[0].currency)}</>;
  return (
    <div className="space-y-0.5 text-lg">
      {nonZero.map((r) => (
        <div key={r.currency}>{formatMoney(r.value, r.currency)}</div>
      ))}
    </div>
  );
}

function KpiBox({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ---------- Comparativo entre línguas ----------

type Column = {
  member: CampaignLike;
  label: string;
  flag: string | null;
  currency: string;
  metrics: CampaignMetricsRow | undefined;
  hasData: boolean;
};

type MetricRowDef = {
  label: string;
  /** Linhas de taxa destacam a melhor língua ("high" = maior é melhor, "low" = menor é melhor) */
  best?: "high" | "low";
  /** Só faz sentido em "Todas as fases" (vendas não são separadas por fase) */
  onlyAllPhases?: boolean;
  value: (m: CampaignMetricsRow) => number | null;
  format: (v: number, col: Column) => string;
  total: string;
};

function GroupComparison({ members, metricsById, langById, phase }: SectionProps) {
  const labels = memberLabels(members, langById);
  const columns: Column[] = members.map((member) => {
    const lang = member.language_id ? langById.get(member.language_id) : undefined;
    const metrics = metricsById.get(member.id);
    return {
      member,
      label: labels.get(member.id) ?? "",
      flag: lang?.flag ?? null,
      currency: currencyOf(lang),
      metrics,
      hasData: hasMetricsData(metrics),
    };
  });
  const totals = sumMetrics(members, metricsById, langById);

  const rows: MetricRowDef[] = [
    {
      label: "E-mails enviados",
      value: (m) => m.emails_sent,
      format: (v) => formatInt(v),
      total: formatInt(totals.sent),
    },
    {
      label: "Taxa de abertura",
      best: "high",
      value: (m) => weightedRate(m.emails_opened, m.emails_sent),
      format: (v) => formatRate(v),
      total: formatRate(weightedRate(totals.opened, totals.sent)),
    },
    {
      label: "CTR",
      best: "high",
      value: (m) => weightedRate(m.emails_clicked, m.emails_sent),
      format: (v) => formatRate(v),
      total: formatRate(weightedRate(totals.clicked, totals.sent)),
    },
    {
      label: "Descadastro",
      best: "low",
      value: (m) => weightedRate(m.emails_unsubscribed, m.emails_sent),
      format: (v) => formatRate(v),
      total: formatRate(weightedRate(totals.unsubscribed, totals.sent)),
    },
    {
      label: "Mensagens WhatsApp",
      value: (m) => m.wa_messages,
      format: (v) => formatInt(v),
      total: formatInt(totals.waMessages),
    },
    {
      label: "Leitura WhatsApp",
      best: "high",
      value: (m) => weightedRate(m.wa_reads, m.wa_recipients),
      format: (v) => formatRate(v),
      total: formatRate(weightedRate(totals.waReads, totals.waRecipients)),
    },
    {
      label: "Reações",
      value: (m) => m.wa_reactions,
      format: (v) => formatInt(v),
      total: formatInt(totals.waReactions),
    },
    {
      label: "Receita",
      onlyAllPhases: true,
      value: (m) => revenueOf(m),
      format: (v, col) => formatMoney(v, col.currency),
      total: formatRevenueList(totals.revenue),
    },
    {
      label: "Vendas",
      onlyAllPhases: true,
      value: (m) => m.sales_count,
      format: (v) => formatInt(v),
      total: formatInt(totals.sales),
    },
    {
      label: "Vendas pelo e-mail",
      onlyAllPhases: true,
      value: (m) => m.sales_email_count,
      format: (v) => formatInt(v),
      total: formatInt(totals.salesEmail),
    },
    {
      label: "Vendas pelo WhatsApp",
      onlyAllPhases: true,
      value: (m) => m.sales_whatsapp_count,
      format: (v) => formatInt(v),
      total: formatInt(totals.salesWhatsapp),
    },
    {
      label: "Leads",
      onlyAllPhases: true,
      value: (m) => m.leads_count,
      format: (v) => formatInt(v),
      total: formatInt(totals.leads),
    },
    {
      label: "Conversão",
      best: "high",
      onlyAllPhases: true,
      value: (m) => weightedRate(m.sales_count, m.leads_count),
      format: (v) => formatRate(v),
      total: formatRate(weightedRate(totals.sales, totals.leads)),
    },
  ];
  const visibleRows = rows.filter((r) => phase === "all" || !r.onlyAllPhases);

  const chartCols = columns.filter((c) => c.metrics && c.metrics.emails_sent > 0);
  const toPct = (num: number, den: number) => Math.round((num / den) * 10000) / 100;
  const openData = chartCols.map((c) => ({
    name: c.label,
    value: toPct(c.metrics!.emails_opened, c.metrics!.emails_sent),
  }));
  const ctrData = chartCols.map((c) => ({
    name: c.label,
    value: toPct(c.metrics!.emails_clicked, c.metrics!.emails_sent),
  }));

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card">Métrica</TableHead>
                {columns.map((c) => (
                  <TableHead key={c.member.id} className="text-right align-bottom">
                    <Link
                      to="/campaigns/$campaignId"
                      params={{ campaignId: c.member.id }}
                      title={c.member.code}
                      className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-foreground hover:text-primary"
                    >
                      {c.flag && <span aria-hidden="true">{c.flag}</span>}
                      {c.label}
                    </Link>
                    {!c.hasData && (
                      <div className="whitespace-nowrap text-[10px] font-normal text-warning">
                        sem dados importados
                      </div>
                    )}
                  </TableHead>
                ))}
                <TableHead className="text-right align-bottom">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const values = columns.map((c) => (c.hasData && c.metrics ? row.value(c.metrics) : null));
                const best = bestValue(values, row.best);
                return (
                  <TableRow key={row.label}>
                    <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-card font-medium">
                      {row.label}
                    </TableCell>
                    {columns.map((c, i) => {
                      const v = values[i];
                      const isBest = best !== null && v === best;
                      return (
                        <TableCell
                          key={c.member.id}
                          className={cn(
                            "whitespace-nowrap text-right tabular-nums",
                            v === null && "text-muted-foreground",
                            isBest && "font-semibold text-success",
                          )}
                        >
                          {v === null ? "—" : row.format(v, c)}
                        </TableCell>
                      );
                    })}
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                      {row.total}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <p>
              Em verde: a melhor taxa de cada linha (no descadastro, a menor). Volumes não são destacados.
              Receita de cada língua na moeda dela; o total separa por moeda.
            </p>
            <PhaseSalesNote phase={phase} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Abertura e CTR por língua</CardTitle>
          <CardDescription>
            Uma escala para cada taxa: no mesmo eixo, o CTR (perto de 1%) ficaria achatado ao lado da
            abertura (perto de 30%).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartCols.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma língua com e-mails importados nesta fase.
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <RateChart title="Taxa de abertura" data={openData} />
              <RateChart title="CTR" data={ctrData} />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Melhor valor entre as línguas com dado; null se não houver pelo menos duas taxas diferentes */
function bestValue(values: (number | null)[], mode: "high" | "low" | undefined): number | null {
  if (!mode) return null;
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length < 2) return null;
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  if (max === min) return null;
  return mode === "high" ? max : min;
}

// Um painel por taxa, na mesma ordem de línguas (eixo próprio em cada um; nunca dois eixos no mesmo gráfico)
function RateChart({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis dataKey="name" {...chartAxisProps} tickLine={false} />
          <YAxis {...chartAxisProps} tickLine={false} width={44} tickFormatter={(v) => `${v}%`} />
          <Tooltip {...chartTooltipProps} formatter={(v) => [`${Number(v).toFixed(2)}%`, title]} />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48}>
            <LabelList
              dataKey="value"
              position="top"
              fill="var(--muted-foreground)"
              fontSize={11}
              formatter={(v) => `${Number(v).toFixed(1)}%`}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
