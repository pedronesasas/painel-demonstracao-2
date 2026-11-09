import { useCallback, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CornerDownRight, ListChecks, Repeat, Inbox, CheckCircle2, Users, Pause, SquareKanban, List } from "lucide-react";
import { cn, formatDateBR, relativeDueBR, todayLocalISO } from "@/lib/utils";
import { toast } from "sonner";
import { ListSkeleton, EmptyState } from "@/components/ui/loading-state";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CardDetailSheet } from "@/components/board/CardDetailSheet";
import { useCompleteGuard } from "@/components/board/useCompleteGuard";
import { HomeTaskBoard } from "@/components/home/HomeTaskBoard";
import { HomeCampaignStrip } from "@/components/home/HomeCampaignStrip";
import type {
  BoardLite, CampaignLite, ColumnLite, DoneItem, Item, SquadLite, SquadTaskItem, SubItem, TaskItem,
} from "@/components/home/home-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Minhas tarefas — NEXUS" },
      { name: "description", content: "Suas tarefas e prazos no NEXUS." },
      { property: "og:title", content: "Minhas tarefas — NEXUS" },
      { property: "og:description", content: "Suas tarefas e prazos no NEXUS." },
    ],
  }),
  component: () => (
    <RequireAuth>
      {/* fullBleed: a própria página põe a margem, para o quadro poder usar a largura toda */}
      <AppLayout fullBleed><HomeTasksPage /></AppLayout>
    </RequireAuth>
  ),
});

// "1 tarefa", "2 tarefas"
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
// Cor de entidade para a receita .tint
const tintStyle = (color?: string) => ({ "--tint": color }) as React.CSSProperties;

// Modo de exibição (lista ou quadro), lembrado neste navegador
type HomeView = "list" | "board";
const VIEW_KEY = "nexus.home.view";
function loadView(): HomeView {
  try { return localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list"; } catch { return "list"; }
}
function saveView(v: HomeView) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
}

async function fetchHomeData(userId: string) {
  // janela local "hoje" em ISO
  const now = new Date();
  const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endLocal = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);

  // Coleta IDs onde o usuário é co-responsável (além de principal) e squads do usuário.
  // Os idiomas vêm junto (tabela pequena) para filtrar as campanhas do Brasil já na consulta.
  const [coCardsRes, coSubsRes, mySquadsRes, langRes] = await Promise.all([
    supabase.from("card_assignees" as never).select("card_id").eq("user_id", userId),
    supabase.from("card_subitem_assignees" as never).select("subitem_id").eq("user_id", userId),
    supabase.from("squad_members").select("squad_id").eq("user_id", userId),
    supabase.from("languages").select("id,code,name"),
  ]);
  const coCardIds = ((coCardsRes.data ?? []) as Array<{ card_id: string }>).map((r) => r.card_id);
  const coSubIds = ((coSubsRes.data ?? []) as Array<{ subitem_id: string }>).map((r) => r.subitem_id);
  const mySquadIds = ((mySquadsRes.data ?? []) as Array<{ squad_id: string }>).map((r) => r.squad_id);

  const tasksFilter = coCardIds.length
    ? `assignee_id.eq.${userId},id.in.(${coCardIds.join(",")})`
    : `assignee_id.eq.${userId}`;
  const subsFilter = coSubIds.length
    ? `assignee_id.eq.${userId},id.in.(${coSubIds.join(",")})`
    : `assignee_id.eq.${userId}`;
  const doneFilter = coCardIds.length
    ? `assignee_id.eq.${userId},id.in.(${coCardIds.join(",")})`
    : `assignee_id.eq.${userId}`;

  const squadCardsPromise = mySquadIds.length
    ? supabase.from("cards")
        .select("id,short_id,title,due_date,board_id,squad_id")
        .in("squad_id", mySquadIds).is("completed_at", null).range(0, 999)
    : Promise.resolve({ data: [] as Array<{ id: string; short_id: string; title: string; due_date: string | null; board_id: string; squad_id: string }> });

  const squadsInfoPromise = mySquadIds.length
    ? supabase.from("squads").select("id,name,color").in("id", mySquadIds)
    : Promise.resolve({ data: [] as SquadLite[] });

  const [tasksRes, subsRes, doneRes, squadCardsRes, squadsInfoRes] = await Promise.all([
    supabase.from("cards")
      .select("id,short_id,title,due_date,board_id,column_id,completed_at,recurrence")
      .or(tasksFilter).is("completed_at", null).range(0, 999),
    supabase.from("card_subitems")
      .select("id,card_id,title,due_date,done,cards!card_subitems_card_id_fkey!inner(short_id,title,board_id,column_id,completed_at)")
      .or(subsFilter).eq("done", false).range(0, 999),
    supabase.from("cards")
      .select("id,short_id,title,board_id,completed_at")
      .or(doneFilter)
      .gte("completed_at", startLocal.toISOString())
      .lt("completed_at", endLocal.toISOString())
      .order("completed_at", { ascending: false })
      .range(0, 199),
    squadCardsPromise,
    squadsInfoPromise,
  ]);

  const taskRows = (tasksRes.data ?? []) as Array<{
    id: string; short_id: string; title: string; due_date: string | null;
    board_id: string; column_id: string; recurrence: { enabled?: boolean } | null;
  }>;
  const subRows = ((subsRes.data ?? []) as Array<{
    id: string; card_id: string; title: string; due_date: string | null;
    cards: { short_id: string; title: string; board_id: string; column_id: string; completed_at: string | null };
  }>).filter((s) => !s.cards?.completed_at);

  // Colunas dos cards e dos cards-pai das subtarefas: pausa (lista) e tipo da coluna (quadro)
  const colIds = Array.from(new Set([
    ...taskRows.map((t) => t.column_id),
    ...subRows.map((s) => s.cards.column_id),
  ].filter(Boolean)));
  const columns: Record<string, ColumnLite> = {};
  if (colIds.length) {
    const { data: cols } = await supabase.from("board_columns")
      .select("id,is_paused_column,is_done_column,kind_id,name,color,position").in("id", colIds);
    for (const c of (cols ?? []) as ColumnLite[]) columns[c.id] = c;
  }
  const tasks = taskRows.map<TaskItem>((t) => ({
    kind: "task", id: t.id, short_id: t.short_id, title: t.title,
    due_date: t.due_date, board_id: t.board_id, column_id: t.column_id,
    recurring: !!t.recurrence?.enabled,
    paused: !!columns[t.column_id]?.is_paused_column,
  }));

  const subs = subRows.map<SubItem>((s) => ({
    kind: "sub", id: s.id, card_id: s.card_id,
    parent_short_id: s.cards.short_id, parent_title: s.cards.title ?? "",
    parent_board_id: s.cards.board_id, parent_column_id: s.cards.column_id,
    title: s.title, due_date: s.due_date,
  }));

  const completed = ((doneRes.data ?? []) as Array<{
    id: string; short_id: string; title: string; board_id: string; completed_at: string;
  }>).map<DoneItem>((c) => ({
    id: c.id, short_id: c.short_id, title: c.title,
    board_id: c.board_id, completed_at: c.completed_at,
  }));

  const squadTasks = ((squadCardsRes.data ?? []) as Array<{
    id: string; short_id: string; title: string; due_date: string | null; board_id: string; squad_id: string;
  }>).map<SquadTaskItem>((c) => ({
    id: c.id, short_id: c.short_id, title: c.title, due_date: c.due_date,
    board_id: c.board_id, squad_id: c.squad_id,
  }));
  squadTasks.sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });

  const squadsInfo: Record<string, SquadLite> = {};
  for (const s of ((squadsInfoRes.data ?? []) as SquadLite[])) squadsInfo[s.id] = s;

  const all: Item[] = [...tasks, ...subs];
  all.sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });

  const boardIds = Array.from(new Set([
    ...tasks.map((t) => t.board_id),
    ...subs.map((s) => s.parent_board_id),
    ...completed.map((c) => c.board_id),
    ...squadTasks.map((s) => s.board_id),
  ]));
  const boards: Record<string, BoardLite> = {};
  if (boardIds.length) {
    const { data: bs } = await supabase.from("boards")
      .select("id,name,color").in("id", boardIds);
    for (const b of (bs ?? []) as BoardLite[]) boards[b.id] = b;
  }
  // Só o mercado do Brasil: a home é operação BR. Se não der para identificar
  // o mercado, mostra tudo em vez de esconder campanha por engano.
  const brLangIds = ((langRes.data ?? []) as Array<{ id: string; code: string; name: string }>)
    .filter((l) => l.code?.toLowerCase().startsWith("pt") || l.name?.toLowerCase().includes("brasil"))
    .map((l) => l.id);
  // Campanhas ativas hoje (current_date entre start_date e end_date) e as próximas (começam depois de hoje).
  // O filtro de mercado vai na própria consulta: assim o limite das próximas conta só campanhas do Brasil.
  const todayIso = todayLocalISO(now);
  let currentQuery = supabase.from("campaigns")
    .select("id,code,product_name,start_date,end_date,language_id")
    .lte("start_date", todayIso)
    .gte("end_date", todayIso);
  let upcomingQuery = supabase.from("campaigns")
    .select("id,code,product_name,start_date,end_date,language_id")
    .gt("start_date", todayIso);
  if (brLangIds.length) {
    currentQuery = currentQuery.in("language_id", brLangIds);
    upcomingQuery = upcomingQuery.in("language_id", brLangIds);
  }
  const [{ data: campaignRows }, { data: upcomingRows }] = await Promise.all([
    currentQuery,
    upcomingQuery.order("start_date", { ascending: true }).limit(20),
  ]);
  const currentCampaigns = ((campaignRows ?? []) as CampaignLite[])
    .sort((a, b) => a.code.localeCompare(b.code));
  // Próxima: só a(s) que começa(m) na data mais próxima
  const upcoming = (upcomingRows ?? []) as CampaignLite[];
  const nextStart = upcoming.reduce<string | null>(
    (min, c) => (c.start_date && (!min || c.start_date < min) ? c.start_date : min), null);
  const nextCampaigns = nextStart
    ? upcoming.filter((c) => c.start_date === nextStart).sort((a, b) => a.code.localeCompare(b.code))
    : [];

  return { items: all, completed, boards, columns, squadTasks, squadsInfo, currentCampaigns, nextCampaigns };
}

type HomeData = {
  items: Item[];
  completed: DoneItem[];
  boards: Record<string, BoardLite>;
  columns: Record<string, ColumnLite>;
  squadTasks: SquadTaskItem[];
  squadsInfo: Record<string, SquadLite>;
  currentCampaigns: CampaignLite[];
  nextCampaigns: CampaignLite[];
};

function HomeTasksPage() {
  const { user, canViewTab } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();
  const { confirmComplete, completeGuardDialog } = useCompleteGuard();

  const [view, setView] = useState<HomeView>(loadView);
  const changeView = (v: string) => {
    const next: HomeView = v === "board" ? "board" : "list";
    setView(next);
    saveView(next);
  };

  // Card aberto na própria home (modo quadro). Callbacks estáveis: CardDetailSheet.load depende deles
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const closeCard = useCallback(() => setOpenCardId(null), []);
  const onCardChanged = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["home-tasks", userId] });
  }, [qc, userId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["home-tasks", userId],
    queryFn: () => fetchHomeData(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const items = data?.items ?? [];
  const completed = data?.completed ?? [];
  const boards = data?.boards ?? {};
  const squadTasks = data?.squadTasks ?? [];
  const squadsInfo = data?.squadsInfo ?? {};
  const columns = data?.columns ?? {};
  const currentCampaigns = data?.currentCampaigns ?? [];
  const nextCampaigns = data?.nextCampaigns ?? [];

  const completeTask = async (t: TaskItem) => {
    // Subtarefas em aberto: pergunta antes se marca todas como concluídas
    if (!(await confirmComplete(t.id))) return;
    qc.setQueryData<HomeData>(["home-tasks", userId], (old) =>
      old ? { ...old, items: old.items.filter((x) => !(x.kind === "task" && x.id === t.id)) } : old);
    const { error } = await supabase.rpc("home_complete_card", { _card_id: t.id });
    if (error) { toast.error(error.message); refetch(); }
    else { toast.success("Concluído" + (t.recurring ? " — próxima ocorrência criada" : "")); refetch(); }
  };

  const completeSub = async (s: SubItem) => {
    qc.setQueryData<HomeData>(["home-tasks", userId], (old) =>
      old ? { ...old, items: old.items.filter((x) => !(x.kind === "sub" && x.id === s.id)) } : old);
    const { error } = await supabase.from("card_subitems")
      .update({ done: true } as never).eq("id", s.id);
    if (error) { toast.error(error.message); refetch(); }
    else toast.success("Subtarefa concluída");
  };

  const reopenTask = async (d: DoneItem) => {
    qc.setQueryData<HomeData>(["home-tasks", userId], (old) =>
      old ? { ...old, completed: old.completed.filter((x) => x.id !== d.id) } : old);
    const { error } = await supabase.rpc("home_reopen_card", { _card_id: d.id });
    if (error) { toast.error(error.message); refetch(); }
    else { toast.success("Tarefa reaberta"); refetch(); }
  };


  const today = todayLocalISO();

  return (
    // Lista com a largura de sempre; o quadro usa a largura toda da tela
    <HomeFrame wide={view === "board"}>
      <PageHeader
        title="Minhas tarefas"
        description="Tarefas e subtarefas atribuídas a você."
        actions={
          <Tabs value={view} onValueChange={changeView}>
            <TabsList className="h-9">
              <TabsTrigger value="list" className="gap-1.5">
                <List className="h-4 w-4" /> Lista
              </TabsTrigger>
              <TabsTrigger value="board" className="gap-1.5">
                <SquareKanban className="h-4 w-4" /> Quadro
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <HomeCampaignStrip
        current={currentCampaigns}
        next={nextCampaigns}
        showEmptyHint={!!data && canViewTab("campaigns")}
      />

      <div className="space-y-6 min-w-0">
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : items.length === 0 && completed.length === 0 && squadTasks.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nada por aqui"
          description="Você não tem tarefas ou subtarefas pendentes. Bom trabalho!"
        />
      ) : (
        <>
          {view === "board" ? (
            <HomeTaskBoard
              items={items}
              completed={completed}
              boards={boards}
              columns={columns}
              today={today}
              onCompleteTask={completeTask}
              onCompleteSub={completeSub}
              onReopen={reopenTask}
              onOpenCard={setOpenCardId}
            />
          ) : (
          <>
          {items.length > 0 && (() => {
            const groups = new Map<string, { tasks: TaskItem[]; paused: TaskItem[]; subs: SubItem[] }>();
            for (const it of items) {
              const bId = it.kind === "task" ? it.board_id : it.parent_board_id;
              if (!groups.has(bId)) groups.set(bId, { tasks: [], paused: [], subs: [] });
              const g = groups.get(bId)!;
              if (it.kind === "task") {
                if (it.paused) g.paused.push(it);
                else g.tasks.push(it);
              } else g.subs.push(it);
            }
            const orderedBoardIds = Array.from(groups.keys()).sort((a, b) => {
              const an = boards[a]?.name ?? ""; const bn = boards[b]?.name ?? "";
              return an.localeCompare(bn);
            });
            return (
              <div className="space-y-6">
                {orderedBoardIds.map((bId) => {
                  const b = boards[bId];
                  const g = groups.get(bId)!;
                  return (
                    <section
                      key={bId}
                      className="tint rounded-xl border border-(--tint-edge) bg-(--tint-lane) overflow-hidden"
                      style={tintStyle(b?.color)}
                    >
                      <header className="flex items-center gap-2 px-3 py-2 border-b border-(--tint-edge)">
                        {/* Nome da esteira na mesma pílula das colunas do quadro */}
                        <Link
                          to="/boards/$boardId"
                          params={{ boardId: bId }}
                          className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-sm bg-(--tint-pill) px-2 text-[11px] font-semibold uppercase tracking-wide text-(--tint-ink) hover:underline underline-offset-2"
                        >
                          <SquareKanban className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                          <span className="truncate">{b?.name ?? "Esteira"}</span>
                        </Link>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {plural(g.tasks.length, "tarefa", "tarefas")}{g.paused.length ? ` · ${plural(g.paused.length, "pausada", "pausadas")}` : ""} · {plural(g.subs.length, "subtarefa", "subtarefas")}
                        </span>
                      </header>

                      {g.tasks.length > 0 && (
                        <div>
                          <div className="eyebrow px-3 py-1.5">
                            Tarefas Pendentes
                          </div>
                          <ul className="divide-y">
                            {g.tasks.map((it) => (
                              <TaskRow key={it.id} it={it} today={today} onComplete={() => completeTask(it)} />
                            ))}
                          </ul>
                        </div>
                      )}

                      {g.paused.length > 0 && (
                        <div>
                          <div className="eyebrow px-3 py-1.5 border-t flex items-center gap-1.5">
                            <Pause className="h-3 w-3 text-warning" aria-hidden /> Tarefas Pausadas
                          </div>
                          <ul className="divide-y opacity-75">
                            {g.paused.map((it) => (
                              <TaskRow key={it.id} it={it} today={today} onComplete={() => completeTask(it)} />
                            ))}
                          </ul>
                        </div>
                      )}

                      {g.subs.length > 0 && (
                        <div>
                          <div className="eyebrow px-3 py-1.5 border-t">
                            Subtarefas Pendentes
                          </div>
                          <ul className="divide-y">
                            {g.subs.map((it) => (
                              <SubRow key={it.id} it={it} today={today} onComplete={() => completeSub(it)} />
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            );
          })()}

          {completed.length > 0 && (
            <section
              className="tint rounded-xl border border-(--tint-edge) bg-(--tint-lane) overflow-hidden"
              style={tintStyle("var(--success)")}
            >
              <header className="flex items-center gap-2 px-3 py-2 border-b border-(--tint-edge)">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-semibold">Concluído hoje</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {plural(completed.length, "item", "itens")}
                </span>
              </header>
              <ul className="divide-y">
                {completed.map((d) => (
                  <DoneRow key={d.id} it={d} board={boards[d.board_id]} onReopen={() => reopenTask(d)} />
                ))}
              </ul>
            </section>
          )}
          </>
          )}

          {/* Tarefas do squad: sempre em lista, nos dois modos */}
          {squadTasks.length > 0 && (() => {
            const groups = new Map<string, SquadTaskItem[]>();
            for (const t of squadTasks) {
              if (!groups.has(t.squad_id)) groups.set(t.squad_id, []);
              groups.get(t.squad_id)!.push(t);
            }
            const orderedSquadIds = Array.from(groups.keys()).sort((a, b) =>
              (squadsInfo[a]?.name ?? "").localeCompare(squadsInfo[b]?.name ?? ""),
            );
            return (
              <section className={cn("tint rounded-xl border border-(--tint-edge) bg-(--tint-lane) overflow-hidden", view === "board" && "max-w-6xl")}>
                <header className="flex items-center gap-2 px-3 py-2 border-b border-(--tint-edge)">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Tarefas do meu squad</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {plural(squadTasks.length, "tarefa", "tarefas")}
                  </span>
                </header>
                {orderedSquadIds.map((sid) => {
                  const sInfo = squadsInfo[sid];
                  const list = groups.get(sid)!;
                  return (
                    <div key={sid}>
                      {/* Nome do squad em pílula na cor dele */}
                      <div className="tint border-t px-3 py-1.5" style={tintStyle(sInfo?.color)}>
                        <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-sm bg-(--tint-pill) px-2 text-[11px] font-semibold uppercase tracking-wide text-(--tint-ink)">
                          <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                          <span className="truncate">{sInfo?.name ?? "Squad"}</span>
                        </span>
                      </div>
                      <ul className="divide-y">
                        {list.map((it) => (
                          <SquadTaskRow
                            key={it.id}
                            it={it}
                            board={boards[it.board_id]}
                            today={today}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </section>
            );
          })()}
        </>
      )}
      </div>

      {openCardId && (
        <CardDetailSheet cardId={openCardId} onClose={closeCard} onChanged={onCardChanged} />
      )}
      {completeGuardDialog}
    </HomeFrame>
  );
}

// A rota usa o AppLayout em fullBleed, então a margem padrão das páginas é posta aqui.
// Lista: igual às outras páginas (até 7xl, centralizado) com o conteúdo em até 6xl.
// Quadro: sem limite de largura. A estrutura não muda entre os modos, então a tela não é remontada.
function HomeFrame({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("px-4 md:px-6 py-6 md:py-8", !wide && "mx-auto max-w-7xl")}>
      <div className={cn("space-y-4", !wide && "max-w-6xl")}>{children}</div>
    </div>
  );
}

function TaskRow({ it, today, onComplete }: { it: TaskItem; today: string; onComplete: () => void }) {
  const overdue = !!it.due_date && it.due_date < today;
  const isToday = !!it.due_date && it.due_date === today;
  return (
    <li className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors">
      <Checkbox checked={false} onCheckedChange={onComplete} className="shrink-0 rounded-full" />
      <ListChecks className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Link
        to="/boards/$boardId"
        params={{ boardId: it.board_id }}
        search={{ card: it.id }}
        className="flex flex-1 items-center gap-2 text-sm min-w-0"
      >
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{it.short_id}</span>
        <span className="flex-1 truncate">{it.title}</span>
        {it.recurring && <Repeat className="h-3 w-3 text-muted-foreground shrink-0" />}
        {it.due_date && (
          <span className={cn("text-[11px] shrink-0 tabular-nums",
            overdue ? "text-destructive" : isToday ? "text-warning" : "text-muted-foreground")}
            title={formatDateBR(it.due_date)}>
            {relativeDueBR(it.due_date, today)}
          </span>
        )}
      </Link>
    </li>
  );
}

function SubRow({ it, today, onComplete }: { it: SubItem; today: string; onComplete: () => void }) {
  const overdue = !!it.due_date && it.due_date < today;
  const isToday = !!it.due_date && it.due_date === today;
  return (
    <li className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors">
      <Checkbox checked={false} onCheckedChange={onComplete} className="shrink-0 rounded-full" />
      <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Link
        to="/boards/$boardId"
        params={{ boardId: it.parent_board_id }}
        search={{ card: it.card_id }}
        className="flex flex-1 items-center gap-2 text-sm min-w-0"
      >
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{it.parent_short_id}</span>
        <span className="flex-1 truncate text-muted-foreground">{it.title}</span>
        {it.due_date && (
          <span className={cn("text-[11px] shrink-0 tabular-nums",
            overdue ? "text-destructive" : isToday ? "text-warning" : "text-muted-foreground")}
            title={formatDateBR(it.due_date)}>
            {relativeDueBR(it.due_date, today)}
          </span>
        )}
      </Link>
    </li>
  );
}

function DoneRow({ it, board, onReopen }: { it: DoneItem; board?: BoardLite; onReopen: () => void }) {
  const time = new Date(it.completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <li className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors">
      <Checkbox checked onCheckedChange={onReopen} className="shrink-0 rounded-full" />
      <ListChecks className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Link
        to="/boards/$boardId"
        params={{ boardId: it.board_id }}
        search={{ card: it.id }}
        className="flex flex-1 items-center gap-2 text-sm min-w-0"
      >
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{it.short_id}</span>
        <span className="flex-1 truncate line-through text-muted-foreground">{it.title}</span>
        {board && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: board.color }} />
            {board.name}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{time}</span>
      </Link>
    </li>
  );
}

function SquadTaskRow({ it, board, today }: { it: SquadTaskItem; board?: BoardLite; today: string }) {
  const overdue = !!it.due_date && it.due_date < today;
  const isToday = !!it.due_date && it.due_date === today;
  return (
    <li className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors">
      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
      <Link
        to="/boards/$boardId"
        params={{ boardId: it.board_id }}
        search={{ card: it.id }}
        className="flex flex-1 items-center gap-2 text-sm min-w-0"
      >
        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{it.short_id}</span>
        <span className="flex-1 truncate">{it.title}</span>
        {board && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: board.color }} />
            {board.name}
          </span>
        )}
        {it.due_date && (
          <span className={cn("text-[11px] shrink-0 tabular-nums",
            overdue ? "text-destructive" : isToday ? "text-warning" : "text-muted-foreground")}
            title={formatDateBR(it.due_date)}>
            {relativeDueBR(it.due_date, today)}
          </span>
        )}
      </Link>
    </li>
  );
}
