import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OutputScoreboard } from "./OutputScoreboard";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { VideoEditTimePage } from "./VideoEditTimePage";
import { PageHeader } from "@/components/PageHeader";
import { chartAxisProps, chartGridProps, chartTooltipProps } from "@/lib/chart-theme";

export function ReportsPage() {
  const { isAdmin } = useAuth();
  // Título da página acima das abas, como em Configurações; cada aba tem o seu título de seção (h2)
  const header = <PageHeader title="Relatórios" />;
  if (!isAdmin) return <div className="space-y-6">{header}<OperationalReports /></div>;
  return (
    <div className="space-y-6">
      {header}
      <Tabs defaultValue="ops" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ops">Operacional</TabsTrigger>
          <TabsTrigger value="placar">Placar</TabsTrigger>
          <TabsTrigger value="video">Tempo de edição</TabsTrigger>
        </TabsList>
        <TabsContent value="ops" className="mt-4"><OperationalReports /></TabsContent>
        <TabsContent value="placar" className="mt-4"><OutputScoreboard /></TabsContent>
        <TabsContent value="video" className="mt-4"><VideoEditTimePage /></TabsContent>
      </Tabs>
    </div>
  );
}


type Metric = { card_id: string; short_id: string; title: string; assignee_id: string | null; created_at: string; completed_at: string | null; lead_time_hours: number | null; cycle_time_hours: number | null };
type Profile = { id: string; full_name: string | null; email: string | null };
type ActiveCard = { id: string; title: string; assignee_id: string | null; created_at: string; updated_at: string; column_id: string };
type Subitem = { card_id: string; done: boolean };
type Activity = { card_id: string; old_value: unknown; new_value: unknown; created_at: string };
type Column = { id: string; is_done_column: boolean; is_paused_column: boolean };

const ALL = "all";

function OperationalReports() {

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeCards, setActiveCards] = useState<ActiveCard[]>([]);
  const [subitems, setSubitems] = useState<Subitem[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [filter, setFilter] = useState<string>(ALL);

  useEffect(() => {
    (async () => {
      const [m, p, ac, act, cols] = await Promise.all([
        supabase.from("card_metrics").select("*").range(0, 9999),
        supabase.from("profiles").select("id,full_name,email").eq("status", "approved").range(0, 4999),
        supabase.from("cards").select("id,title,assignee_id,created_at,updated_at,column_id").is("completed_at", null).range(0, 9999),
        supabase.from("card_activity").select("card_id,old_value,new_value,created_at").eq("action", "moved").eq("field", "column_id").range(0, 9999),
        supabase.from("board_columns").select("id,is_done_column,is_paused_column").range(0, 4999),
      ]);
      setMetrics((m.data ?? []) as Metric[]);
      setProfiles((p.data ?? []) as Profile[]);
      const ac2 = (ac.data ?? []) as ActiveCard[];
      setActiveCards(ac2);
      setActivity((act.data ?? []) as Activity[]);
      setColumns((cols.data ?? []) as Column[]);
      const ids = ac2.map((c) => c.id);
      if (ids.length) {
        const s = await supabase.from("card_subitems").select("card_id,done").in("card_id", ids).range(0, 9999);
        setSubitems((s.data ?? []) as Subitem[]);
      } else {
        setSubitems([]);
      }
    })();
  }, []);

  const nameOf = (id: string | null) => {
    if (!id) return "Sem responsável";
    const p = profiles.find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? "Sem responsável";
  };

  const doneColIds = useMemo(() => new Set(columns.filter((c) => c.is_done_column).map((c) => c.id)), [columns]);
  const pausedColIds = useMemo(() => new Set(columns.filter((c) => c.is_paused_column).map((c) => c.id)), [columns]);

  const filteredMetrics = useMemo(
    () => (filter === ALL ? metrics : metrics.filter((m) => m.assignee_id === filter)),
    [metrics, filter],
  );
  // Active cards excluding paused columns (paused don't count as WIP / gargalo)
  const filteredActive = useMemo(
    () => {
      const base = filter === ALL ? activeCards : activeCards.filter((c) => c.assignee_id === filter);
      return base.filter((c) => !pausedColIds.has(c.column_id));
    },
    [activeCards, filter, pausedColIds],
  );
  const filteredPaused = useMemo(
    () => {
      const base = filter === ALL ? activeCards : activeCards.filter((c) => c.assignee_id === filter);
      return base.filter((c) => pausedColIds.has(c.column_id));
    },
    [activeCards, filter, pausedColIds],
  );

  const completed = filteredMetrics.filter((m) => m.completed_at);
  const avgLead = completed.length ? completed.reduce((s, m) => s + (m.lead_time_hours ?? 0), 0) / completed.length : 0;
  const avgCycle = completed.length ? completed.reduce((s, m) => s + (m.cycle_time_hours ?? 0), 0) / completed.length : 0;
  const now = Date.now();
  const aging = filteredActive.map((c) => (now - new Date(c.created_at).getTime()) / 36e5);
  const avgAging = aging.length ? aging.reduce((s, h) => s + h, 0) / aging.length : 0;

  const throughputByWeek = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of completed) {
      const d = new Date(m.completed_at!);
      const k = `${d.getFullYear()}-W${String(Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)).padStart(2, "0")}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([k, v]) => ({ week: k, count: v })).slice(-12);
  }, [completed]);

  // Per-user aggregates (always over full dataset, table filters at render)
  const perUser = useMemo(() => {
    const subByCard = new Map<string, { done: number; total: number }>();
    for (const s of subitems) {
      const cur = subByCard.get(s.card_id) ?? { done: 0, total: 0 };
      cur.total++;
      if (s.done) cur.done++;
      subByCard.set(s.card_id, cur);
    }

    const cardOwner = new Map<string, string | null>();
    for (const c of activeCards) cardOwner.set(c.id, c.assignee_id);
    // also include completed cards owners from metrics for reopens mapping
    for (const m of metrics) cardOwner.set(m.card_id, m.assignee_id);

    const reopensByUser = new Map<string, number>();
    for (const a of activity) {
      const oldId = typeof a.old_value === "string" ? a.old_value : (a.old_value as { value?: string } | null)?.value;
      const newId = typeof a.new_value === "string" ? a.new_value : (a.new_value as { value?: string } | null)?.value;
      if (!oldId || !newId) continue;
      if (doneColIds.has(oldId) && !doneColIds.has(newId)) {
        const owner = cardOwner.get(a.card_id) ?? "none";
        reopensByUser.set(owner ?? "none", (reopensByUser.get(owner ?? "none") ?? 0) + 1);
      }
    }

    // Só quem tem (ou teve) card: perfis sem nenhum card — como contas de
    // sistema/admin que ninguém usa — não devem aparecer como "ocioso".
    const ids = new Set<string>();
    activeCards.forEach((c) => ids.add(c.assignee_id ?? "none"));
    metrics.forEach((m) => ids.add(m.assignee_id ?? "none"));

    return Array.from(ids).map((id) => {
      const userAll = activeCards.filter((c) => (c.assignee_id ?? "none") === id);
      const userActive = userAll.filter((c) => !pausedColIds.has(c.column_id));
      const userPaused = userAll.filter((c) => pausedColIds.has(c.column_id));
      const userMetrics = metrics.filter((m) => (m.assignee_id ?? "none") === id);
      const done = userMetrics.filter((m) => m.completed_at);
      const lead = done.length ? done.reduce((s, m) => s + (m.lead_time_hours ?? 0), 0) / done.length : 0;
      const agingMaxH = userActive.length
        ? Math.max(...userActive.map((c) => (now - new Date(c.created_at).getTime()) / 36e5))
        : 0;
      const wip = userActive.length;
      const paused = userPaused.length;
      const reopens = reopensByUser.get(id) ?? 0;
      const agingDays = agingMaxH / 24;
      const status: "gargalo" | "ocioso" | "ativo" =
        wip > 3 || agingDays > 10 ? "gargalo" : wip === 0 ? "ocioso" : "ativo";

      // current task = most recent updated active card (não considera pausados)
      const current = [...userActive].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
      let progress: number | null = null;
      if (current) {
        const s = subByCard.get(current.id);
        progress = s && s.total > 0 ? Math.round((s.done / s.total) * 100) : null;
      }

      return {
        id,
        name: id === "none" ? "Sem responsável" : nameOf(id),
        wip,
        paused,
        done: done.length,
        total: userMetrics.length,
        lead,
        agingMaxH,
        reopens,
        status,
        currentTitle: current?.title ?? null,
        progress,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCards, metrics, subitems, activity, doneColIds, pausedColIds, profiles]);

  const muralUsers = useMemo(
    () => perUser.filter((u) => u.id !== "none" && profiles.some((p) => p.id === u.id)),
    [perUser, profiles],
  );

  const tableRows = useMemo(
    () => (filter === ALL ? perUser : perUser.filter((u) => u.id === filter)),
    [perUser, filter],
  );

  return (
    <div className="space-y-6">
      {/* Filtro abaixo do título, igual às abas Placar e Tempo de edição */}
      <PageHeader
        as="h2"
        title="Operacional"
        description="Lead time, cycle time, throughput e desempenho da equipe."
      >
        <div className="w-full sm:w-72">
          <label className="text-xs text-muted-foreground mb-1 block">Filtrar por Responsável</label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email ?? "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Cards concluídos" value={completed.length.toString()} />
        <Kpi label="Lead time médio" value={fmtH(avgLead)} />
        <Kpi label="Cycle time médio" value={fmtH(avgCycle)} />
        <Kpi label="Aging médio (WIP)" value={fmtH(avgAging)} />
        <Kpi label="Em pausa" value={filteredPaused.length.toString()} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mural da Equipe</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {muralUsers.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum colaborador encontrado.</div>
          ) : (
            muralUsers.map((u) => <MuralCard key={u.id} u={u} />)
          )}
        </div>
      </section>

      <div className="rounded-xl border bg-card p-4 shadow-card">
        <h3 className="text-sm font-semibold mb-3">Throughput (concluídos por semana)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={throughputByWeek}>
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="week" {...chartAxisProps} />
            <YAxis {...chartAxisProps} />
            <Tooltip {...chartTooltipProps} />
            <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden shadow-card">
        <h3 className="text-sm font-semibold p-4 border-b">Por responsável</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left p-2 px-4">Responsável</th>
                <th className="text-right p-2 px-4">WIP (Ativas)</th>
                <th className="text-right p-2 px-4">Em pausa</th>
                <th className="text-right p-2 px-4">Concluídos</th>
                <th className="text-right p-2 px-4">Lead Méd.</th>
                <th className="text-right p-2 px-4">Aging Máx.</th>
                <th className="text-right p-2 px-4">Reabertos</th>
                <th className="text-center p-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 px-4">{r.name}</td>
                  <td className="p-2 px-4 text-right">{r.wip}</td>
                  <td className="p-2 px-4 text-right text-muted-foreground">{r.paused}</td>
                  <td className="p-2 px-4 text-right">{r.done}</td>
                  <td className="p-2 px-4 text-right">{fmtH(r.lead)}</td>
                  <td className="p-2 px-4 text-right">{fmtH(r.agingMaxH)}</td>
                  <td className="p-2 px-4 text-right">{r.reopens}</td>
                  <td className="p-2 px-4 text-center">
                    {r.status === "gargalo" ? (
                      <AlertTriangle className="h-4 w-4 inline text-destructive" aria-label="Gargalo" />
                    ) : r.done > 0 ? (
                      <CheckCircle2 className="h-4 w-4 inline text-success" aria-label="Bom desempenho" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MuralCard({ u }: { u: { name: string; status: "gargalo" | "ocioso" | "ativo"; currentTitle: string | null; progress: number | null } }) {
  const initials = u.name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
          <div className="text-sm font-medium truncate">{u.name}</div>
        </div>
        <StatusBadge status={u.status} />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">O que está fazendo</div>
        <div className="text-sm truncate">{u.currentTitle ?? "Sem tarefa ativa"}</div>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Progresso</span>
          <span>{u.progress === null ? "—" : `${u.progress}%`}</span>
        </div>
        <Progress value={u.progress ?? 0} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "gargalo" | "ocioso" | "ativo" }) {
  // Os três status no mesmo formato de tom (fundo leve, texto na cor)
  if (status === "gargalo") return <Badge variant="danger">Gargalo</Badge>;
  if (status === "ocioso") return <Badge variant="neutral">Ocioso</Badge>;
  return <Badge variant="success">Ativo</Badge>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
function fmtH(h: number) {
  if (!h || !isFinite(h)) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
