import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Language = {
  id: string;
  code: string;
  name: string;
  currency: string;
  flag: string | null;
  active: boolean;
  position: number;
  /** Região dos funis ligada a este mercado (BR, LATAM, ...). */
  region?: string | null;
};

export function useLanguages(opts: { onlyActive?: boolean } = {}) {
  const { onlyActive = true } = opts;
  return useQuery({
    queryKey: ["languages", { onlyActive }],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabase.from("languages").select("*").order("position").order("name");
      if (onlyActive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Language[];
    },
  });
}

export function languageLabel(l: Pick<Language, "code" | "name" | "flag">) {
  return `${l.flag ? l.flag + " " : ""}${l.name}`;
}
