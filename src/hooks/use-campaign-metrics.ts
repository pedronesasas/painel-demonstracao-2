import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  toMetricsRow,
  type CampaignMetricsRow,
  type MetricsPhase,
} from "@/lib/campaign-groups";

// Fora do componente para o React Query não recalcular o Map a cada render
function indexById(rows: CampaignMetricsRow[]): Map<string, CampaignMetricsRow> {
  return new Map(rows.map((r) => [r.campaign_id, r]));
}

/**
 * Métricas de várias campanhas numa chamada só (RPC campaign_compare_metrics_by_phase).
 * `data` é um Map campaign_id -> métricas. Receita, vendas e leads NÃO são separados por fase.
 * `keepPrevious`: mantém os números antigos enquanto carrega a nova lista (ids que faltam = carregando).
 */
export function useCampaignMetrics(
  ids: string[],
  phase: MetricsPhase = "all",
  opts: { keepPrevious?: boolean } = {},
) {
  const sortedIds = [...ids].sort();
  return useQuery({
    queryKey: ["campaign-metrics", sortedIds, phase],
    enabled: ids.length > 0,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campaign_compare_metrics_by_phase", {
        _campaign_ids: sortedIds,
        _phase: phase,
      });
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(toMetricsRow);
    },
    select: indexById,
  });
}

export type WeekCampaign = {
  id: string;
  code: string;
  product_name: string;
  week_number: number;
  year: number;
  language_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

/** Todas as campanhas (todas as línguas e produtos) de uma semana */
export function useWeekCampaigns(year: number | null | undefined, week: number | null | undefined) {
  return useQuery({
    queryKey: ["campaign-siblings", year, week],
    enabled: !!year && !!week,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, code, product_name, week_number, year, language_id, start_date, end_date")
        .eq("year", year as number)
        .eq("week_number", week as number);
      if (error) throw error;
      return (data ?? []) as WeekCampaign[];
    },
  });
}
