import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProfileLite = { id: string; full_name: string | null; email: string | null };

export function useProfiles() {
  return useQuery<ProfileLite[]>({
    queryKey: ["profiles", "approved"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function firstName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return trimmed.split("@")[0];
  return trimmed.split(/\s+/)[0];
}
