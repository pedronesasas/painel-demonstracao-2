import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type Squad = {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
};

export type SquadMember = { squad_id: string; user_id: string };

export function useSquads() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [members, setMembers] = useState<SquadMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, m] = await Promise.all([
      supabase.from("squads").select("*").order("name"),
      supabase.from("squad_members").select("squad_id,user_id"),
    ]);
    setSquads((s.data ?? []) as Squad[]);
    setMembers((m.data ?? []) as SquadMember[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { squads, members, loading, reload: load };
}

/** Squads em que o usuário atual é membro */
export function useMySquads() {
  const { user } = useAuth();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.id) { setIds([]); return; }
    supabase
      .from("squad_members")
      .select("squad_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setIds(((data ?? []) as Array<{ squad_id: string }>).map((r) => r.squad_id));
      });
  }, [user?.id]);

  return ids;
}
