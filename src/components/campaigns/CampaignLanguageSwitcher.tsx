import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguages } from "@/hooks/use-languages";
import { useWeekCampaigns } from "@/hooks/use-campaign-metrics";
import {
  buildGroupKey,
  memberLabels,
  productSlug,
  sortByLanguage,
  type CampaignLike,
} from "@/lib/campaign-groups";
import { languageChipClass } from "@/components/campaigns/chip-styles";

type Props = {
  year: number;
  week: number;
  /** Slug do produto (productSlug do product_name) */
  slug: string;
  /**
   * Campanha aberta; sem ela, "Todas as línguas" fica destacado.
   * O chip dela aparece sempre, mesmo enquanto as outras línguas carregam ou se a busca falhar.
   */
  current?: CampaignLike;
  /** Aba aberta na campanha, mantida ao trocar de língua */
  tab?: string;
  className?: string;
};

/**
 * Chips para trocar de língua dentro da mesma semana + produto.
 * "Todas as línguas" abre a página do grupo (comparativo); cada língua abre a sua campanha.
 */
export function CampaignLanguageSwitcher({ year, week, slug, current, tab, className }: Props) {
  const { data: languages = [], isLoading: languagesLoading } = useLanguages({ onlyActive: false });
  const langById = useMemo(() => new Map(languages.map((l) => [l.id, l])), [languages]);
  const { data: weekRows, isLoading } = useWeekCampaigns(year, week);
  const currentId = current?.id;

  const members = useMemo(() => {
    const rows: CampaignLike[] = (weekRows ?? []).filter((r) => productSlug(r.product_name) === slug);
    // A campanha aberta entra mesmo sem a lista da semana (carregando ou erro): o mercado dela nunca some
    if (current && !rows.some((r) => r.id === current.id)) rows.push(current);
    return sortByLanguage(rows, langById);
  }, [weekRows, slug, current, langById]);
  const labels = useMemo(() => memberLabels(members, langById), [members, langById]);

  // Sem as línguas carregadas o rótulo sairia "Sem mercado"; segura o espaço até chegarem
  if (languagesLoading || (members.length === 0 && isLoading)) {
    return <div className={cn("h-7", className)} aria-hidden="true" />;
  }
  if (members.length === 0) return null;

  const allActive = !currentId;

  return (
    <nav aria-label="Línguas da campanha" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {members.length > 1 && (
        <Link
          to="/campaigns/grupo/$groupKey"
          params={{ groupKey: buildGroupKey(year, week, slug) }}
          aria-current={allActive ? "page" : undefined}
          className={languageChipClass(allActive)}
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          Todas as línguas
        </Link>
      )}
      {members.map((m) => {
        const lang = m.language_id ? langById.get(m.language_id) : undefined;
        const active = m.id === currentId;
        return (
          <Link
            key={m.id}
            to="/campaigns/$campaignId"
            params={{ campaignId: m.id }}
            search={{ tab }}
            aria-current={active ? "page" : undefined}
            title={`${lang?.name ?? "Sem mercado"} · ${m.code}`}
            className={languageChipClass(active)}
          >
            {lang?.flag && <span aria-hidden="true">{lang.flag}</span>}
            <span className="font-mono">{labels.get(m.id)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
