import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";

const ALL = "__all__";

type Metric = {
  card_id: string; assignee_id: string | null;
  created_at: string; completed_at: string | null; lead_time_hours: number | null;
};
type Profile = { id: string; full_name: string | null; email: string | null };
type Column = { id: string; board_id: string; position: number; is_paused_column: boolean };
type Move = { card_id: string; old_value: unknown; new_value: unknown; created_at: string };

const PERIODS = [
  { value: "4w", label: "Últimas 4 semanas", days: 28 },
  { value: "8w", label: "Últimas 8 semanas", days: 56 },
  { value: "12w", label: "Últimas 12 semanas", days: 84 },
];

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex"];

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : (v as { value?: string } | null)?.value ?? null;

const toneClass = (tone: "good" | "warn" | "bad") =>
  tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-success";

export function OutputScoreboard() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [person, setPerson] = useState<string>(ALL);
  const [period, setPeriod] = useState<string>("4w");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [m, p, c, a] = await Promise.all([
        supabase.from("card_metrics")
          .select("card_id,assignee_id,created_at,completed_at,lead_time_hours").range(0, 9999),
        supabase.from("profiles").select("id,full_name,email").eq("status", "approved").range(0, 4999),
        supabase.from("board_columns").select("id,board_id,position,is_paused_column").range(0, 4999),
        supabase.from("card_activity").select("card_id,old_value,new_value,created_at")
          .eq("action", "moved").eq("field", "column_id").range(0, 9999),
      ]);
      if (m.error || p.error || c.error || a.error) {
        toast.error("Erro ao carregar o placar. Verifique a conexão.");
        setLoading(false);
        return;
      }
      setMetrics((m.data ?? []) as Metric[]);
      setProfiles((p.data ?? []) as Profile[]);
      setColumns((c.data ?? []) as Column[]);
      setMoves((a.data ?? []) as Move[]);
      setLoading(false);
    })();
  }, []);

  const since = useMemo(() => {
    const days = PERIODS.find((p) => p.value === period)?.days ?? 28;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d;
  }, [period]);

  const colById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  /** Cards que voltaram para uma etapa anterior pelo menos uma vez = retrabalho. */
  const reworkedCards = useMemo(() => {
    const set = new Set<string>();
    for (const mv of moves) {
      const from = colById.get(asId(mv.old_value) ?? "");
      const to = colById.get(asId(mv.new_value) ?? "");
      if (!from || !to || from.board_id !== to.board_id) continue;
      // Pausar / despausar não é retrabalho
      if (from.is_paused_column || to.is_paused_column) continue;
      if (to.position < from.position) set.add(mv.card_id);
    }
    return set;
  }, [moves, colById]);

  /** Primeira movimentação do card = quando o trabalho de fato começou. */
  const firstMoveAt = useMemo(() => {
    const map = new Map<string, string>();
    for (const mv of moves) {
      const cur = map.get(mv.card_id);
      if (!cur || mv.created_at < cur) map.set(mv.card_id, mv.created_at);
    }
    return map;
  }, [moves]);

  const rows = useMemo(() => {
    const done = metrics.filter((m) => m.completed_at && new Date(m.completed_at) >= since);
    const ids = new Set<string>();
    done.forEach((m) => ids.add(m.assignee_id ?? "none"));

    const nameOf = (id: string) => {
      if (id === "none") return "Sem responsável";
      const p = profiles.find((x) => x.id === id);
      return p?.full_name ?? p?.email ?? "Desconhecido";
    };

    return Array.from(ids).map((id) => {
      const mine = done.filter((m) => (m.assignee_id ?? "none") === id);
      const rework = mine.filter((m) => reworkedCards.has(m.card_id)).length;

      const byDay = WEEKDAYS.map(() => 0);
      let weekend = 0;
      for (const m of mine) {
        const d = new Date(m.completed_at as string).getDay(); // 0 = domingo
        if (d === 0 || d === 6) weekend++;
        else byDay[d - 1]++;
      }
      const inWeek = byDay.reduce((s, n) => s + n, 0);
      const lateWeek = byDay[3] + byDay[4]; // quinta + sexta

      const carried = mine.filter((m) => {
        const started = firstMoveAt.get(m.card_id) ?? m.created_at;
        return new Date(started) < since;
      }).length;

      const lead = mine.length
        ? mine.reduce((s, m) => s + (m.lead_time_hours ?? 0), 0) / mine.length
        : 0;

      return {
        id,
        name: nameOf(id),
        delivered: mine.length,
        rework,
        reworkPct: mine.length ? Math.round((rework / mine.length) * 100) : 0,
        byDay,
        weekend,
        latePct: inWeek ? Math.round((lateWeek / inWeek) * 100) : 0,
        carried,
        carriedPct: mine.length ? Math.round((carried / mine.length) * 100) : 0,
        lead,
      };
    }).sort((a, b) => b.delivered - a.delivered);
  }, [metrics, since, profiles, reworkedCards, firstMoveAt]);

  const shown = person === ALL ? rows : rows.filter((r) => r.id === person);

  const totals = useMemo(() => {
    const delivered = shown.reduce((s, r) => s + r.delivered, 0);
    const rework = shown.reduce((s, r) => s + r.rework, 0);
    const carried = shown.reduce((s, r) => s + r.carried, 0);
    const byDay = WEEKDAYS.map((_, i) => shown.reduce((s, r) => s + r.byDay[i], 0));
    const inWeek = byDay.reduce((s, n) => s + n, 0);
    return {
      delivered,
      reworkPct: delivered ? Math.round((rework / delivered) * 100) : 0,
      latePct: inWeek ? Math.round(((byDay[3] + byDay[4]) / inWeek) * 100) : 0,
      carriedPct: delivered ? Math.round((carried / delivered) * 100) : 0,
    };
  }, [shown]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Filtros abaixo do título: ao lado dele apertariam o título no tablet */}
      <PageHeader
        as="h2"
        title="Placar de entregas"
        description="Cada número de produção vem com seu par de qualidade — volume sozinho engana."
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-56">
            <Label className="text-xs mb-1 block">Pessoa</Label>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Label className="text-xs mb-1 block">Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <PairCard
          title="Entregas"
          value={String(totals.delivered)}
          pairLabel="Retrabalho"
          pairValue={`${totals.reworkPct}%`}
          pairTone={totals.reworkPct > 25 ? "bad" : totals.reworkPct > 10 ? "warn" : "good"}
          hint="Cards concluídos no período · quantos voltaram para uma etapa anterior"
        />
        <PairCard
          title="Linearidade"
          value={`${100 - totals.latePct}%`}
          pairLabel="Concentrado em qui/sex"
          pairValue={`${totals.latePct}%`}
          pairTone={totals.latePct > 60 ? "bad" : totals.latePct > 45 ? "warn" : "good"}
          hint="Entregas espalhadas na semana vs. empilhadas perto do prazo"
        />
        <PairCard
          title="Trabalho do período"
          value={`${100 - totals.carriedPct}%`}
          pairLabel="Herdado de antes"
          pairValue={`${totals.carriedPct}%`}
          pairTone={totals.carriedPct > 50 ? "warn" : "good"}
          hint="Entregas cujo trabalho começou antes do período — o resultado de hoje pode ser de ontem"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Por pessoa</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Pessoa</th>
                  <th className="text-left font-medium px-4 py-2">Entregas · Retrabalho</th>
                  <th className="text-left font-medium px-4 py-2">Distribuição na semana</th>
                  <th className="text-left font-medium px-4 py-2">Herdado</th>
                  <th className="text-left font-medium px-4 py-2">Lead médio</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma entrega no período.
                    </td>
                  </tr>
                )}
                {shown.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono tabular-nums">{r.delivered}</span>
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      <span className={cn("font-mono tabular-nums", toneClass(
                        r.reworkPct > 25 ? "bad" : r.reworkPct > 10 ? "warn" : "good",
                      ))}>
                        {r.reworkPct}%
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">({r.rework})</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <WeekBars byDay={r.byDay} weekend={r.weekend} latePct={r.latePct} />
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground">
                      {r.carriedPct}%
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground">
                      {r.lead ? `${Math.round(r.lead)}h` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Retrabalho vem das voltas de etapa registradas no histórico do card (mover para uma coluna
        anterior); pausar não conta. ROAS e CAC ainda não aparecem aqui porque o gasto de anúncios
        não existe no NEXUS.
      </p>
    </div>
  );
}

function PairCard({ title, value, pairLabel, pairValue, pairTone, hint }: {
  title: string; value: string; pairLabel: string; pairValue: string;
  pairTone: "good" | "warn" | "bad"; hint: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-1">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="flex items-baseline gap-1.5 text-sm">
          <span className="text-muted-foreground">{pairLabel}</span>
          <span className={cn("font-semibold tabular-nums", toneClass(pairTone))}>{pairValue}</span>
        </div>
        <p className="text-[11px] text-muted-foreground pt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

function WeekBars({ byDay, weekend, latePct }: { byDay: number[]; weekend: number; latePct: number }) {
  const max = Math.max(1, ...byDay);
  return (
    <div className="flex items-end gap-1" title={`${latePct}% das entregas caem em quinta/sexta`}>
      {byDay.map((n, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <div
            className={cn("w-4 rounded-sm", i >= 3 ? "bg-warning/70" : "bg-primary/60")}
            style={{ height: `${Math.max(2, (n / max) * 24)}px` }}
            title={`${WEEKDAYS[i]}: ${n}`}
          />
          <span className="text-[9px] text-muted-foreground">{WEEKDAYS[i][0]}</span>
        </div>
      ))}
      {weekend > 0 && (
        <span className="text-[10px] text-muted-foreground ml-1" title="Entregas no fim de semana">
          +{weekend} fds
        </span>
      )}
    </div>
  );
}
