import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCampaignMetrics } from "@/hooks/use-campaign-metrics";
import {
  TIMING_BADGE,
  TIMING_LABEL,
  formatInt,
  formatPeriod,
  formatRate,
  formatRevenueList,
  groupTitle,
  memberLabels,
  sumMetrics,
  weightedRate,
  type CampaignGroup,
  type CampaignLike,
  type CampaignMetricsRow,
  type GroupLanguage,
} from "@/lib/campaign-groups";
import { languageChipClass } from "@/components/campaigns/chip-styles";

const PAGE_SIZE = 24;
// Quantas campanhas futuras aparecem no destaque do topo (as mais próximas); as outras abrem no botão
const MAX_UPCOMING_HIGHLIGHT = 3;
// Espera a pessoa parar de digitar ou filtrar antes de pedir as métricas (evita uma chamada por tecla)
const METRICS_DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type ViewProps = {
  groups: CampaignGroup[];
  langById: Map<string, GroupLanguage>;
  /** Língua escolhida no filtro de mercado: o chip dela fica destacado */
  highlightLangId?: string;
};

/** Visão "Agrupada": um cartão por semana + produto, com as línguas como chips. */
export function CampaignGroupsView({ groups, langById, highlightLangId }: ViewProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  // Destaque do topo: em andamento + futuras (pela data de início).
  // "Demais campanhas": encerradas e sem datas, da mais recente para a mais antiga. As futuras ficam
  // fora daqui, senão semanas cadastradas com antecedência empurrariam as recentes para baixo.
  const { running, upcoming, rest } = useMemo(() => {
    return {
      running: groups.filter((g) => g.timing === "running"),
      upcoming: groups
        .filter((g) => g.timing === "upcoming")
        .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "")),
      rest: groups.filter((g) => g.timing !== "running" && g.timing !== "upcoming"),
    };
  }, [groups]);

  const shownUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, MAX_UPCOMING_HIGHLIGHT);
  const hiddenUpcoming = upcoming.length - shownUpcoming.length;
  const current = [...running, ...shownUpcoming];
  const shownRest = rest.slice(0, visible);

  // Uma chamada só do RPC com todas as campanhas que estão na tela. Os ids viram texto para o
  // debounce comparar por valor: digitar na busca não dispara uma chamada a cada tecla.
  const idsKey = [...current, ...shownRest].flatMap((g) => g.members.map((m) => m.id)).join(",");
  const debouncedIdsKey = useDebouncedValue(idsKey, METRICS_DEBOUNCE_MS);
  const ids = useMemo(() => (debouncedIdsKey ? debouncedIdsKey.split(",") : []), [debouncedIdsKey]);
  const { data: metricsById, isError } = useCampaignMetrics(ids, "all", { keepPrevious: true });

  return (
    <div className="space-y-6">
      {current.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Em andamento e próximas
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {current.map((g) => (
              <CampaignGroupCard
                key={g.key}
                group={g}
                langById={langById}
                metricsById={metricsById}
                metricsError={isError}
                highlightLangId={highlightLangId}
                emphasized
              />
            ))}
          </div>
          {upcoming.length > MAX_UPCOMING_HIGHLIGHT && (
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setShowAllUpcoming((v) => !v)}>
                {showAllUpcoming
                  ? "Mostrar menos campanhas futuras"
                  : `Mostrar mais ${hiddenUpcoming} ${hiddenUpcoming === 1 ? "campanha futura" : "campanhas futuras"}`}
              </Button>
            </div>
          )}
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-3">
          {current.length > 0 && (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Demais campanhas
            </h2>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shownRest.map((g) => (
              <CampaignGroupCard
                key={g.key}
                group={g}
                langById={langById}
                metricsById={metricsById}
                metricsError={isError}
                highlightLangId={highlightLangId}
              />
            ))}
          </div>
          {rest.length > visible && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Mostrar mais ({rest.length - visible} restantes)
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

type CardProps = {
  group: CampaignGroup<CampaignLike>;
  langById: Map<string, GroupLanguage>;
  /** Sem métricas (undefined + showMetrics=false) o cartão mostra só título, período e línguas */
  metricsById?: Map<string, CampaignMetricsRow>;
  metricsError?: boolean;
  showMetrics?: boolean;
  highlightLangId?: string;
  /** Cartão do destaque do topo (borda na cor primária) */
  emphasized?: boolean;
};

// O link do título cobre o cartão inteiro (after:inset-0); os chips ficam por cima (relative z-10)
const titleLinkClass =
  "block truncate font-semibold text-foreground after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring";

export function CampaignGroupCard({
  group,
  langById,
  metricsById,
  metricsError,
  showMetrics = true,
  highlightLangId,
  emphasized,
}: CardProps) {
  const single = group.members.length === 1;
  const period = formatPeriod(group.startDate, group.endDate);
  const labels = memberLabels(group.members, langById);
  const loaded = !!metricsById && group.members.every((m) => metricsById.has(m.id));
  const totals = loaded ? sumMetrics(group.members, metricsById, langById) : null;

  return (
    <Card
      className={cn(
        "relative p-4 transition-colors hover:border-border-strong hover:bg-card-hover",
        emphasized && "border-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {single ? (
            <Link
              to="/campaigns/$campaignId"
              params={{ campaignId: group.members[0].id }}
              className={titleLinkClass}
            >
              {groupTitle(group)}
            </Link>
          ) : (
            <Link
              to="/campaigns/grupo/$groupKey"
              params={{ groupKey: group.key }}
              className={titleLinkClass}
            >
              {groupTitle(group)}
            </Link>
          )}
          <div className="mt-0.5 text-xs text-muted-foreground">
            {period ?? `Campanha ${group.week} / ${group.year}`}
          </div>
        </div>
        <Badge variant={TIMING_BADGE[group.timing]} className="shrink-0">
          {TIMING_LABEL[group.timing]}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.members.map((m) => {
          const lang = m.language_id ? langById.get(m.language_id) : undefined;
          const active = !!highlightLangId && (highlightLangId === "none" ? !m.language_id : m.language_id === highlightLangId);
          return (
            <Link
              key={m.id}
              to="/campaigns/$campaignId"
              params={{ campaignId: m.id }}
              title={`${lang?.name ?? "Sem mercado"} · ${m.code}`}
              className={languageChipClass(active, "relative z-10")}
            >
              {lang?.flag && <span aria-hidden="true">{lang.flag}</span>}
              <span className="font-mono">{labels.get(m.id)}</span>
            </Link>
          );
        })}
      </div>

      {showMetrics && (
        <div className="mt-3 border-t pt-3">
          {!totals ? (
            <p className="text-xs text-muted-foreground">
              {metricsError ? "Métricas indisponíveis no momento." : "Carregando métricas…"}
            </p>
          ) : totals.withData === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados importados ainda.</p>
          ) : (
            <>
              <dl className="grid grid-cols-4 gap-2">
                <Stat label="E-mails" value={formatInt(totals.sent)} />
                <Stat label="Abertura" value={formatRate(weightedRate(totals.opened, totals.sent), 1)} />
                <Stat label="CTR" value={formatRate(weightedRate(totals.clicked, totals.sent), 1)} />
                <Stat label="Vendas" value={formatInt(totals.sales)} />
              </dl>
              <p className="mt-2 text-xs">
                <span className="text-muted-foreground">Receita </span>
                <span className="font-medium tabular-nums">{formatRevenueList(totals.revenue)}</span>
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
