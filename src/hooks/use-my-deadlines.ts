import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { todayLocalISO } from "@/lib/utils";

// Aba "Prazos" do sino: montada no navegador, sem tabela nova no banco.
// Cards meus (responsável ou co-responsável), não concluídos, fora da coluna
// de pausa, atrasados ou vencendo hoje/amanhã.

export type DeadlineCard = {
  id: string;
  short_id: string | null;
  title: string;
  due_date: string;
  board_id: string;
  board_name: string | null;
  board_color: string | null;
  // Dias até o prazo: negativo = atrasado, 0 = hoje, 1 = amanhã
  days: number;
};

export type MyDeadlines = {
  items: DeadlineCard[]; // por data, do mais antigo para o mais novo
  overdue: number;
  today: number;
  tomorrow: number;
};

type CardRow = {
  id: string;
  short_id: string | null;
  title: string;
  due_date: string | null;
  board_id: string;
  column_id: string;
  completed_at: string | null;
};

const CARD_COLS = "id,short_id,title,due_date,board_id,column_id,completed_at";

// "AAAA-MM-DD" → data local (sem fuso)
function localDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function fetchMyDeadlines(uid: string, today: string, tomorrow: string): Promise<MyDeadlines> {
  // Principal (cards.assignee_id) e co-responsável (card_assignees), em paralelo
  const [mainRes, coRes] = await Promise.all([
    supabase
      .from("cards")
      .select(CARD_COLS)
      .eq("assignee_id", uid)
      .is("completed_at", null)
      .lte("due_date", tomorrow)
      .order("due_date")
      .limit(300),
    supabase
      .from("card_assignees" as never)
      .select(`card_id, cards!inner(${CARD_COLS})`)
      .eq("user_id", uid)
      .is("cards.completed_at", null)
      .lte("cards.due_date", tomorrow)
      .limit(300),
  ]);
  if (mainRes.error) throw mainRes.error;
  if (coRes.error) throw coRes.error;

  const byId = new Map<string, CardRow>();
  for (const c of (mainRes.data ?? []) as unknown as CardRow[]) byId.set(c.id, c);
  for (const r of (coRes.data ?? []) as unknown as Array<{ cards: CardRow | null }>) {
    if (r.cards) byId.set(r.cards.id, r.cards);
  }
  const cards = Array.from(byId.values()).filter((c) => c.due_date && !c.completed_at);
  if (cards.length === 0) return { items: [], overdue: 0, today: 0, tomorrow: 0 };

  // Colunas (tira pausa e conclusão) e esteiras (nome e cor)
  const colIds = Array.from(new Set(cards.map((c) => c.column_id)));
  const boardIds = Array.from(new Set(cards.map((c) => c.board_id)));
  const [colsRes, boardsRes] = await Promise.all([
    supabase.from("board_columns").select("id,is_paused_column,is_done_column").in("id", colIds),
    supabase.from("boards").select("id,name,color").in("id", boardIds),
  ]);
  const skipCols = new Set(
    ((colsRes.data ?? []) as Array<{ id: string; is_paused_column: boolean | null; is_done_column: boolean | null }>)
      .filter((c) => c.is_paused_column || c.is_done_column)
      .map((c) => c.id),
  );
  const boardById = new Map(
    ((boardsRes.data ?? []) as Array<{ id: string; name: string; color: string | null }>).map((b) => [b.id, b]),
  );

  const t = localDate(today).getTime();
  const items = cards
    .filter((c) => !skipCols.has(c.column_id))
    .map<DeadlineCard>((c) => {
      const b = boardById.get(c.board_id);
      return {
        id: c.id,
        short_id: c.short_id,
        title: c.title,
        due_date: c.due_date!,
        board_id: c.board_id,
        board_name: b?.name ?? null,
        board_color: b?.color ?? null,
        days: Math.round((localDate(c.due_date!).getTime() - t) / 86_400_000),
      };
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.short_id ?? "").localeCompare(b.short_id ?? ""));

  return {
    items,
    overdue: items.filter((i) => i.days < 0).length,
    today: items.filter((i) => i.days === 0).length,
    tomorrow: items.filter((i) => i.days === 1).length,
  };
}

/** Prazos apertados do usuário logado. `enabled` = só busca com o painel aberto. */
export function useMyDeadlines(enabled: boolean) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  // "Hoje" local: toISOString viraria o dia às 21h de Brasília
  const now = new Date();
  const today = todayLocalISO(now);
  const tomorrow = todayLocalISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  return useQuery<MyDeadlines>({
    // Fica sob o prefixo das notificações: o realtime do sino também atualiza os prazos
    queryKey: ["notifications", uid, "deadlines", today],
    enabled: !!uid && enabled,
    queryFn: () => fetchMyDeadlines(uid!, today, tomorrow),
    staleTime: 60 * 1000,
  });
}
