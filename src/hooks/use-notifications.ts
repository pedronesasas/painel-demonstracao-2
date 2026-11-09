import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  card_id: string | null;
  comment_id: string | null;
  actor_id: string | null;
  read_at: string | null;
  created_at: string;
  // Só existe depois da migração 20261002190000 (aviso de subtarefa)
  subitem_id?: string | null;
};

export type NotificationWithMeta = NotificationRow & {
  actor_name: string | null;
  card_short_id: string | null;
  card_title: string | null;
  card_board_id: string | null;
  board_name: string | null;
  board_color: string | null;
  comment_body: string | null;
  subitem_title: string | null;
};

// Quantas notificações o painel carrega (as mais recentes)
export const NOTIFICATIONS_LIMIT = 50;

type Prof = { id: string; full_name: string | null; email: string | null };
type CardLite = { id: string; short_id: string | null; title: string; board_id: string };
type BoardLite = { id: string; name: string; color: string | null };
type CommentLite = { id: string; body: string };
type SubLite = { id: string; title: string };

const uniq = (xs: Array<string | null | undefined>) =>
  Array.from(new Set(xs.filter(Boolean))) as string[];

async function fetchNotifications(uid: string): Promise<NotificationWithMeta[]> {
  // As mais recentes + as não lidas (mesmo antigas), para a aba "Não lidas"
  // bater com o número do sino
  const base = () =>
    supabase
      .from("notifications" as never)
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATIONS_LIMIT);
  const [recent, unread] = await Promise.all([base(), base().is("read_at", null)]);
  if (recent.error) throw recent.error;
  if (unread.error) throw unread.error;
  const byId = new Map<string, NotificationRow>();
  for (const r of [...(recent.data ?? []), ...(unread.data ?? [])] as unknown as NotificationRow[]) byId.set(r.id, r);
  const rows = Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (rows.length === 0) return [];

  const actorIds = uniq(rows.map((r) => r.actor_id));
  const cardIds = uniq(rows.map((r) => r.card_id));
  const commentIds = uniq(rows.map((r) => r.comment_id));
  const subIds = uniq(rows.map((r) => r.subitem_id));

  const [profs, cards, comments, subs] = await Promise.all([
    actorIds.length
      ? supabase.from("profiles").select("id,full_name,email").in("id", actorIds)
      : Promise.resolve({ data: [] as Prof[] }),
    cardIds.length
      ? supabase.from("cards").select("id,short_id,title,board_id").in("id", cardIds)
      : Promise.resolve({ data: [] as CardLite[] }),
    commentIds.length
      ? supabase.from("card_comments").select("id,body").in("id", commentIds)
      : Promise.resolve({ data: [] as CommentLite[] }),
    subIds.length
      ? supabase.from("card_subitems").select("id,title").in("id", subIds)
      : Promise.resolve({ data: [] as SubLite[] }),
  ]);

  const cardById = new Map(((cards.data ?? []) as CardLite[]).map((c) => [c.id, c]));

  // Nome e cor da esteira de cada card
  const boardIds = uniq(Array.from(cardById.values()).map((c) => c.board_id));
  const boardsRes = boardIds.length
    ? await supabase.from("boards").select("id,name,color").in("id", boardIds)
    : { data: [] as BoardLite[] };

  const profById = new Map(((profs.data ?? []) as Prof[]).map((p) => [p.id, p]));
  const boardById = new Map(((boardsRes.data ?? []) as BoardLite[]).map((b) => [b.id, b]));
  const commentById = new Map(((comments.data ?? []) as CommentLite[]).map((c) => [c.id, c]));
  const subById = new Map(((subs.data ?? []) as SubLite[]).map((s) => [s.id, s]));

  return rows.map((r) => {
    const a = r.actor_id ? profById.get(r.actor_id) : null;
    const c = r.card_id ? cardById.get(r.card_id) : null;
    const b = c ? boardById.get(c.board_id) : null;
    const cm = r.comment_id ? commentById.get(r.comment_id) : null;
    const s = r.subitem_id ? subById.get(r.subitem_id) : null;
    return {
      ...r,
      actor_name: a?.full_name ?? a?.email ?? null,
      card_short_id: c?.short_id ?? null,
      card_title: c?.title ?? null,
      card_board_id: c?.board_id ?? null,
      board_name: b?.name ?? null,
      board_color: b?.color ?? null,
      comment_body: cm?.body ?? null,
      subitem_title: s?.title ?? null,
    };
  });
}

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id ?? null;
  const baseKey = ["notifications", uid] as const;
  const listKey = ["notifications", uid, "list"] as const;
  const unreadKey = ["notifications", uid, "unread"] as const;

  const query = useQuery<NotificationWithMeta[]>({
    queryKey: listKey,
    enabled: !!uid,
    queryFn: () => fetchNotifications(uid!),
    staleTime: 30 * 1000,
  });

  // Contagem real de não lidas (não depende do limite da lista)
  const unreadQuery = useQuery<number>({
    queryKey: unreadKey,
    enabled: !!uid,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications" as never)
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`notifications-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        () => {
          // Prefixo: lista, contagem e prazos
          qc.invalidateQueries({ queryKey: ["notifications", uid] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, qc]);

  const listUnread = (query.data ?? []).filter((n) => !n.read_at).length;
  const unreadCount = unreadQuery.data ?? listUnread;

  // Marca na tela na hora (o banco confirma depois)
  const markLocal = (match: (n: NotificationWithMeta) => boolean) => {
    const readAt = new Date().toISOString();
    let changed = 0;
    qc.setQueryData<NotificationWithMeta[]>(listKey, (prev) =>
      prev?.map((n) => {
        if (n.read_at || !match(n)) return n;
        changed++;
        return { ...n, read_at: readAt };
      }),
    );
    if (changed) qc.setQueryData<number>(unreadKey, (c) => Math.max(0, (c ?? 0) - changed));
  };

  const markRead = async (id: string) => {
    if (!uid) return;
    markLocal((n) => n.id === id);
    await supabase
      .from("notifications" as never)
      .update({ read_at: new Date().toISOString() } as never)
      .eq("id", id)
      .eq("user_id", uid)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: baseKey });
  };

  const markCardRead = async (cardId: string) => {
    markLocal((n) => n.card_id === cardId);
    await supabase.rpc("mark_card_notifications_read" as never, { _card_id: cardId } as never);
    qc.invalidateQueries({ queryKey: baseKey });
  };

  const markAllRead = async () => {
    if (!uid) return;
    markLocal(() => true);
    qc.setQueryData<number>(unreadKey, 0);
    await supabase
      .from("notifications" as never)
      .update({ read_at: new Date().toISOString() } as never)
      .eq("user_id", uid)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: baseKey });
  };

  return { ...query, unreadCount, markRead, markCardRead, markAllRead };
}
