import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pencil, Trash2, Plus, ChevronDown, ChevronRight, CalendarIcon, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportTempoEdicaoCsv, exportTempoEdicaoXlsx, type ReportState } from "@/lib/exportReport";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, startOfWeek, addWeeks, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AddVideoEditDialog, type VideoEditEditor } from "./AddVideoEditDialog";
import { AddDemandDialog, type DemandEditInitial } from "./AddDemandDialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDateBR, formatDurationDual, formatDurationHM, formatDurationHMS, formatDurationMinutes } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { chartAxisProps, chartGridProps, chartTooltipProps } from "@/lib/chart-theme";

type Entry = {
  id: string;
  editor_id: string;
  card_id: string | null;
  title: string;
  duration_seconds: number;
  delivered_at: string;
  notes: string | null;
  demand_id: string | null;
};
type Demand = {
  id: string;
  editor_id: string;
  title: string;
  delivered_at: string;
  card_id: string | null;
  mode: "detailed" | "aggregate";
  aggregate_video_count: number | null;
  aggregate_total_seconds: number | null;
  notes: string | null;
};
type Card = { id: string; short_id: string | null; title: string };
type Target = { editor_id: string; weekly_target_minutes: number; extra_minute_rate_cents: number };

type Range = "week" | "month" | "year" | "all" | "last_week" | "last_month" | "custom";

function getRangeBounds(range: Range, customFrom?: string, customTo?: string): { from: string | null; to: string | null } {
  const d = new Date();
  if (range === "week") {
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    const from = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return { from, to: d.toISOString().slice(0, 10) };
  } else if (range === "last_week") {
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff - 7);
    d.setHours(0, 0, 0, 0);
    const from = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return { from, to: d.toISOString().slice(0, 10) };
  } else if (range === "month") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    const from = d.toISOString().slice(0, 10);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return { from, to: d.toISOString().slice(0, 10) };
  } else if (range === "last_month") {
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    d.setHours(0, 0, 0, 0);
    const from = d.toISOString().slice(0, 10);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return { from, to: d.toISOString().slice(0, 10) };
  } else if (range === "year") {
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    const from = d.toISOString().slice(0, 10);
    d.setMonth(11, 31);
    d.setHours(23, 59, 59, 999);
    return { from, to: d.toISOString().slice(0, 10) };
  } else if (range === "custom") {
    return { from: customFrom ?? null, to: customTo ?? null };
  }
  return { from: null, to: null };
}

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function VideoEditTimePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [editors, setEditors] = useState<VideoEditEditor[]>([]);
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  const [targets, setTargets] = useState<Map<string, Target>>(new Map());
  const [range, setRange] = useState<Range>("month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [editorFilter, setEditorFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [demandDialogOpen, setDemandDialogOpen] = useState(false);
  const [editingDemand, setEditingDemand] = useState<DemandEditInitial | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: editorProfiles } = await supabase
      .from("permission_profiles")
      .select("id")
      .ilike("name", "%editor%");
    const editorProfileIds = (editorProfiles ?? []).map((p) => p.id);

    const [eRes, dRes, pRes, tRes] = await Promise.all([
      supabase.from("video_edit_entries").select("*").order("delivered_at", { ascending: false }).range(0, 9999),
      supabase.from("video_edit_demands").select("*").order("delivered_at", { ascending: false }).range(0, 9999),
      editorProfileIds.length
        ? supabase
            .from("profiles")
            .select("id,full_name,email")
            .eq("status", "approved")
            .in("profile_id", editorProfileIds)
            .range(0, 999)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
      supabase.from("editor_weekly_targets").select("editor_id,weekly_target_minutes,extra_minute_rate_cents"),
    ]);
    const ee = (eRes.data ?? []) as Entry[];
    setEntries(ee);
    const dd = (dRes.data ?? []) as Demand[];
    setDemands(dd);
    setEditors(
      (pRes.data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? "—" })),
    );
    const tm = new Map<string, Target>();
    (tRes.data ?? []).forEach((t) => tm.set(t.editor_id, t as Target));
    setTargets(tm);
    const cardIds = Array.from(new Set([
      ...ee.map((e) => e.card_id),
      ...dd.map((d) => d.card_id),
    ].filter(Boolean))) as string[];
    if (cardIds.length) {
      const { data } = await supabase.from("cards").select("id,short_id,title").in("id", cardIds);
      const m = new Map<string, Card>();
      (data ?? []).forEach((c) => m.set(c.id, c as Card));
      setCards(m);
    } else {
      setCards(new Map());
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id);
      setIsAdmin((roles ?? []).some((r) => r.role === "admin"));
    })();
  }, [load]);

  const { from, to } = getRangeBounds(range, customFrom, customTo);
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (from && e.delivered_at < from) return false;
      if (to && e.delivered_at > to) return false;
      if (editorFilter !== "all" && e.editor_id !== editorFilter) return false;
      return true;
    });
  }, [entries, from, to, editorFilter]);

  const filteredDemands = useMemo(() => {
    return demands.filter((d) => {
      if (from && d.delivered_at < from) return false;
      if (to && d.delivered_at > to) return false;
      if (editorFilter !== "all" && d.editor_id !== editorFilter) return false;
      return true;
    });
  }, [demands, from, to, editorFilter]);

  const aggregateDemands = useMemo(
    () => filteredDemands.filter((d) => d.mode === "aggregate"),
    [filteredDemands],
  );

  const aggSecondsTotal = aggregateDemands.reduce((s, d) => s + (d.aggregate_total_seconds ?? 0), 0);
  const aggVideosTotal = aggregateDemands.reduce((s, d) => s + (d.aggregate_video_count ?? 0), 0);

  const totalSeconds = filtered.reduce((s, e) => s + e.duration_seconds, 0) + aggSecondsTotal;
  const totalVideos = filtered.length + aggVideosTotal;
  const avgSeconds = totalVideos ? totalSeconds / totalVideos : 0;

  const perEditor = useMemo(() => {
    const map = new Map<string, { id: string; name: string; seconds: number; videos: number }>();
    const bump = (editorId: string, seconds: number, videos: number) => {
      const cur = map.get(editorId) ?? {
        id: editorId,
        name: editors.find((x) => x.id === editorId)?.name ?? "—",
        seconds: 0,
        videos: 0,
      };
      cur.seconds += seconds;
      cur.videos += videos;
      map.set(editorId, cur);
    };
    for (const e of filtered) bump(e.editor_id, e.duration_seconds, 1);
    for (const d of aggregateDemands) bump(d.editor_id, d.aggregate_total_seconds ?? 0, d.aggregate_video_count ?? 0);
    return Array.from(map.values())
      .map((r) => ({ ...r, minutes: Math.round(r.seconds / 60) }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [filtered, aggregateDemands, editors]);

  // Weekly breakdown per editor across the selected period
  const DEFAULT_TARGET_MIN = 60;
  const weeklyRows = useMemo(() => {
    if (!from || !to) return [];
    const periodStart = new Date(from + "T00:00:00");
    const periodEnd = new Date(to + "T00:00:00");
    const toStr = (d: Date) => format(d, "yyyy-MM-dd");
    const weeks: { start: Date; end: Date; key: string; label: string }[] = [];

    // Semana do editor = segunda a sexta, SEMPRE completa (nunca recortada).
    // Se a semana cai em dois meses, ela conta para o mês que tem mais dias úteis dela.
    const isFullMonth =
      periodStart.getDate() === 1 &&
      periodStart.getMonth() === periodEnd.getMonth() &&
      periodStart.getFullYear() === periodEnd.getFullYear() &&
      new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0).getDate() === periodEnd.getDate();

    let cursor = startOfWeek(periodStart, { weekStartsOn: 1 });
    const lastCursor = startOfWeek(periodEnd, { weekStartsOn: 1 });
    while (cursor <= lastCursor) {
      const weekMon = cursor;
      const weekFri = addDays(cursor, 4);
      let include = weekMon <= periodEnd && weekFri >= periodStart;
      if (include && isFullMonth) {
        // maioria dos dias úteis (seg–sex) dentro do mês selecionado
        let inside = 0;
        for (let i = 0; i < 5; i++) {
          const day = addDays(weekMon, i);
          if (day >= periodStart && day <= periodEnd) inside++;
        }
        include = inside >= 3;
      }
      if (include) {
        weeks.push({
          start: weekMon,
          end: weekFri,
          key: toStr(weekMon),
          label: `${format(weekMon, "dd/MM", { locale: ptBR })} – ${format(weekFri, "dd/MM", { locale: ptBR })}`,
        });
      }
      cursor = addWeeks(cursor, 1);
    }


    if (weeks.length === 0) return [];

    const editorsToShow = editorFilter !== "all"
      ? editors.filter((e) => e.id === editorFilter)
      : editors;

    type Row = {
      editorId: string;
      editorName: string;
      weekKey: string;
      weekLabel: string;
      deliveredMin: number;
      targetMin: number;
      overMin: number;
      rateCents: number;
      payCents: number;
      isFirstOfEditor: boolean;
      editorRowSpan: number;
    };
    const rows: Row[] = [];
    for (const ed of editorsToShow) {
      const t = targets.get(ed.id);
      const targetMin = t?.weekly_target_minutes ?? DEFAULT_TARGET_MIN;
      const rateCents = t?.extra_minute_rate_cents ?? 0;
      weeks.forEach((w, idx) => {
        const wStartStr = toStr(w.start);
        const wEndStr = toStr(w.end);
        const entrySeconds = entries
          .filter((e) => e.editor_id === ed.id && e.delivered_at >= wStartStr && e.delivered_at <= wEndStr)
          .reduce((s, e) => s + e.duration_seconds, 0);
        const aggSeconds = demands
          .filter((d) => d.mode === "aggregate" && d.editor_id === ed.id && d.delivered_at >= wStartStr && d.delivered_at <= wEndStr)
          .reduce((s, d) => s + (d.aggregate_total_seconds ?? 0), 0);
        const seconds = entrySeconds + aggSeconds;
        const deliveredMin = Math.round(seconds / 60);
        const overMin = Math.max(0, deliveredMin - targetMin);
        rows.push({
          editorId: ed.id,
          editorName: ed.name,
          weekKey: w.key,
          weekLabel: w.label,
          deliveredMin,
          targetMin,
          overMin,
          rateCents,
          payCents: overMin * rateCents,
          isFirstOfEditor: idx === 0,
          editorRowSpan: weeks.length,
        });
      });
    }
    return rows;
  }, [from, to, entries, demands, targets, editors, editorFilter]);

  const totalPayCents = weeklyRows.reduce((s, r) => s + r.payCents, 0);


  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("video_edit_entries").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir", { description: error.message });
      return;
    }
    toast.success("Lançamento excluído");
    load();
  };

  const handleDeleteDemand = async (id: string) => {
    if (!confirm("Excluir esta demanda e todos os seus vídeos?")) return;
    const { error } = await supabase.from("video_edit_demands").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir demanda", { description: error.message });
      return;
    }
    toast.success("Demanda excluída");
    load();
  };

  const openEditDemand = (d: Demand) => {
    setEditingDemand({
      id: d.id,
      editor_id: d.editor_id,
      title: d.title,
      delivered_at: d.delivered_at,
      card_id: d.card_id,
      mode: d.mode,
      aggregate_video_count: d.aggregate_video_count,
      aggregate_total_seconds: d.aggregate_total_seconds,
      notes: d.notes,
    });
    setDemandDialogOpen(true);
  };

  const rangeLabels: Record<Range, string> = {
    week: "Semana atual",
    last_week: "Semana passada",
    month: "Mês atual",
    last_month: "Mês passado",
    year: "Ano atual",
    all: "Tudo",
    custom: "Personalizado",
  };

  const buildReportState = (): ReportState => ({
    rangeLabel: rangeLabels[range],
    from,
    to,
    editorLabel: editorFilter === "all" ? "Todos" : (editors.find((e) => e.id === editorFilter)?.name ?? "—"),
    totalSeconds,
    totalVideos,
    avgSeconds,
    totalPayCents,
    perEditor,
    weeklyRows,
    filtered,
    filteredDemands,
    editors,
    cards,
  });

  const handleExport = (kind: "csv" | "xlsx") => {
    const state = buildReportState();
    try {
      if (kind === "csv") exportTempoEdicaoCsv(state);
      else exportTempoEdicaoXlsx(state);
      toast.success(`Relatório exportado (${kind.toUpperCase()})`);
    } catch (err: any) {
      toast.error("Erro ao exportar", { description: err?.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de filtros e ações abaixo do título: é larga demais para ficar ao lado */}
      <PageHeader
        as="h2"
        title="Tempo de edição"
        description="Quanto tempo de vídeo editado cada editor entregou no período."
      >
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-44">
            <label className="text-xs text-muted-foreground mb-1 block">Período</label>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Semana atual</SelectItem>
                <SelectItem value="last_week">Semana passada</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
                <SelectItem value="last_month">Mês passado</SelectItem>
                <SelectItem value="year">Ano atual</SelectItem>
                <SelectItem value="all">Tudo</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {range === "custom" && (
            <div className="flex gap-2 items-end">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">De</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-36 justify-start text-left font-normal", !customFrom && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customFrom ? format(new Date(customFrom + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : <span>Data inicial</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customFrom ? new Date(customFrom + "T12:00:00") : undefined}
                      onSelect={(d) => setCustomFrom(d ? d.toISOString().slice(0, 10) : "")}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Até</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-36 justify-start text-left font-normal", !customTo && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customTo ? format(new Date(customTo + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : <span>Data final</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customTo ? new Date(customTo + "T12:00:00") : undefined}
                      onSelect={(d) => setCustomTo(d ? d.toISOString().slice(0, 10) : "")}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
          <div className="w-56">
            <label className="text-xs text-muted-foreground mb-1 block">Editor</label>
            <Select value={editorFilter} onValueChange={setEditorFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {editors.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Lançamento avulso
          </Button>
          <Button onClick={() => { setEditingDemand(null); setDemandDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova demanda
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-1" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                Exportar como CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                Exportar como Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Tempo total editado" value={formatDurationMinutes(totalSeconds)} sub={formatDurationHMS(totalSeconds)} />
        <Kpi label="Vídeos entregues" value={totalVideos.toString()} />
        <Kpi label="Média por vídeo" value={formatDurationMinutes(avgSeconds)} sub={formatDurationHMS(avgSeconds)} />
      </div>

      {weeklyRows.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden shadow-card">
          <div className="flex items-center justify-between p-4 border-b gap-3 flex-wrap">
            <h3 className="text-sm font-semibold">Entregas por semana</h3>
            <div className="text-xs text-muted-foreground">
              Total a pagar (extras): <span className="font-semibold text-foreground">{fmtBRL(totalPayCents)}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="text-left p-2 px-4">Editor</th>
                  <th className="text-left p-2 px-4">Semana</th>
                  <th className="text-right p-2 px-4">Meta (min)</th>
                  <th className="text-right p-2 px-4">Entregue (min)</th>
                  <th className="text-right p-2 px-4">Excedente (min)</th>
                  <th className="text-right p-2 px-4">R$/min</th>
                  <th className="text-right p-2 px-4">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {weeklyRows.map((r) => (
                  <tr key={`${r.editorId}-${r.weekKey}`} className={`border-t ${r.isFirstOfEditor ? "border-t-2 border-t-border" : ""}`}>
                    {r.isFirstOfEditor ? (
                      <td className="p-2 px-4 font-medium align-top" rowSpan={r.editorRowSpan}>{r.editorName}</td>
                    ) : null}
                    <td className="p-2 px-4 text-muted-foreground">{r.weekLabel}</td>
                    <td className="p-2 px-4 text-right">{r.targetMin}</td>
                    <td className="p-2 px-4 text-right">{r.deliveredMin}</td>
                    <td className={`p-2 px-4 text-right font-medium ${r.overMin > 0 ? "text-success" : "text-muted-foreground"}`}>{r.overMin}</td>
                    <td className="p-2 px-4 text-right text-muted-foreground">{fmtBRL(r.rateCents)}</td>
                    <td className="p-2 px-4 text-right font-semibold">{fmtBRL(r.payCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 shadow-card">
        <h3 className="text-sm font-semibold mb-3">Minutos por editor</h3>
        {perEditor.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={perEditor}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="name" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip
                {...chartTooltipProps}
                formatter={(_v, _n, ctx: any) => {
                  const sec = ctx?.payload?.seconds ?? 0;
                  return [formatDurationDual(sec), "Tempo"];
                }}
              />
              <Bar dataKey="minutes" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden shadow-card">
        <h3 className="text-sm font-semibold p-4 border-b">Resumo por editor</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left p-2 px-4">Editor</th>
                <th className="text-right p-2 px-4">Vídeos</th>
                <th className="text-right p-2 px-4">Total</th>
                <th className="text-right p-2 px-4">Média</th>
              </tr>
            </thead>
            <tbody>
              {perEditor.length === 0 ? (
                <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Sem dados.</td></tr>
              ) : (
                perEditor.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 px-4">{r.name}</td>
                    <td className="p-2 px-4 text-right">{r.videos}</td>
                    <td className="p-2 px-4 text-right">{formatDurationHMS(r.seconds)}</td>
                    <td className="p-2 px-4 text-right">{formatDurationHMS(r.seconds / r.videos)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden shadow-card">
        <h3 className="text-sm font-semibold p-4 border-b">Lançamentos</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left p-2 px-4">Data</th>
                <th className="text-left p-2 px-4">Editor</th>
                <th className="text-left p-2 px-4">Demanda</th>
                <th className="text-left p-2 px-4">Card</th>
                <th className="text-right p-2 px-4">Tempo</th>
                <th className="p-2 px-4 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Build display rows: standalone entries, detailed demands (with children), aggregate demands
                const demandById = new Map(filteredDemands.map((d) => [d.id, d]));
                const childrenByDemand = new Map<string, Entry[]>();
                const standalone: Entry[] = [];
                for (const e of filtered) {
                  if (e.demand_id && demandById.has(e.demand_id)) {
                    const arr = childrenByDemand.get(e.demand_id) ?? [];
                    arr.push(e);
                    childrenByDemand.set(e.demand_id, arr);
                  } else if (!e.demand_id) {
                    standalone.push(e);
                  }
                }
                type Item =
                  | { kind: "entry"; date: string; e: Entry }
                  | { kind: "demand"; date: string; d: Demand; children: Entry[] };
                const items: Item[] = [
                  ...standalone.map((e) => ({ kind: "entry" as const, date: e.delivered_at, e })),
                  ...filteredDemands.map((d) => ({
                    kind: "demand" as const,
                    date: d.delivered_at,
                    d,
                    children: childrenByDemand.get(d.id) ?? [],
                  })),
                ];
                items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

                if (items.length === 0) {
                  return <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhum lançamento.</td></tr>;
                }

                return items.flatMap((it) => {
                  if (it.kind === "entry") {
                    const e = it.e;
                    const card = e.card_id ? cards.get(e.card_id) : null;
                    return [(
                      <tr key={`e-${e.id}`} className="border-t">
                        <td className="p-2 px-4">{formatDateBR(e.delivered_at)}</td>
                        <td className="p-2 px-4">{editors.find((x) => x.id === e.editor_id)?.name ?? "—"}</td>
                        <td className="p-2 px-4">{e.title}</td>
                        <td className="p-2 px-4 text-xs text-muted-foreground">
                          {card ? `${card.short_id ?? ""} ${card.title}`.trim() : "—"}
                        </td>
                        <td className="p-2 px-4 text-right">{formatDurationHMS(e.duration_seconds)}</td>
                        <td className="p-2 px-4 text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(e); setDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(e.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )];
                  }
                  // demand
                  const d = it.d;
                  const card = d.card_id ? cards.get(d.card_id) : null;
                  const totalSec = d.mode === "aggregate"
                    ? (d.aggregate_total_seconds ?? 0)
                    : it.children.reduce((s, e) => s + e.duration_seconds, 0);
                  const videoCount = d.mode === "aggregate"
                    ? (d.aggregate_video_count ?? 0)
                    : it.children.length;
                  const rows: React.ReactElement[] = [];
                  rows.push(
                    <tr key={`d-${d.id}`} className="border-t bg-muted/20">
                      <td className="p-2 px-4 font-medium">{formatDateBR(d.delivered_at)}</td>
                      <td className="p-2 px-4 font-medium">{editors.find((x) => x.id === d.editor_id)?.name ?? "—"}</td>
                      <td className="p-2 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{d.title}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {d.mode === "aggregate" ? `Agregada · ${videoCount} vídeos` : `Demanda · ${videoCount} vídeos`}
                          </Badge>
                        </div>
                      </td>
                      <td className="p-2 px-4 text-xs text-muted-foreground">
                        {card ? `${card.short_id ?? ""} ${card.title}`.trim() : "—"}
                      </td>
                      <td className="p-2 px-4 text-right font-semibold">{formatDurationHMS(totalSec)}</td>
                      <td className="p-2 px-4 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDemand(d)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteDemand(d.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>,
                  );
                  if (d.mode === "detailed") {
                    for (const e of it.children) {
                      rows.push(
                        <tr key={`de-${e.id}`} className="border-t">
                          <td className="p-2 px-4"></td>
                          <td className="p-2 px-4"></td>
                          <td className="p-2 px-4 pl-8 text-muted-foreground">↳ {e.title}</td>
                          <td className="p-2 px-4"></td>
                          <td className="p-2 px-4 text-right text-muted-foreground">{formatDurationHMS(e.duration_seconds)}</td>
                          <td className="p-2 px-4"></td>
                        </tr>,
                      );
                    }
                  }
                  return rows;
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-xl border bg-card overflow-hidden shadow-card">
          <button
            className="w-full flex items-center justify-between p-4 border-b text-sm font-semibold hover:bg-muted/30"
            onClick={() => setTargetsOpen((v) => !v)}
          >
            <span>Metas dos editores</span>
            {targetsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {targetsOpen && (
            <TargetsEditor editors={editors} targets={targets} onSaved={load} />
          )}
        </div>
      )}

      <AddVideoEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editors={editors}
        initial={editing}
        onSaved={load}
      />

      <AddDemandDialog
        open={demandDialogOpen}
        onOpenChange={setDemandDialogOpen}
        editors={editors}
        initial={editingDemand}
        onSaved={load}
      />
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function TargetsEditor({
  editors,
  targets,
  onSaved,
}: {
  editors: VideoEditEditor[];
  targets: Map<string, Target>;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<Record<string, { minutes: string; rate: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, { minutes: string; rate: string }> = {};
    for (const e of editors) {
      const t = targets.get(e.id);
      next[e.id] = {
        minutes: t ? String(t.weekly_target_minutes) : "60",
        rate: t ? (t.extra_minute_rate_cents / 100).toFixed(2) : "0",
      };
    }
    setRows(next);
  }, [editors, targets]);

  const save = async (editorId: string) => {
    const r = rows[editorId];
    if (!r) return;
    setSaving(editorId);
    const payload = {
      editor_id: editorId,
      weekly_target_minutes: Math.max(0, Math.floor(Number(r.minutes) || 0)),
      extra_minute_rate_cents: Math.max(0, Math.round((Number(r.rate.replace(",", ".")) || 0) * 100)),
    };
    const { error } = await supabase
      .from("editor_weekly_targets")
      .upsert(payload, { onConflict: "editor_id" });
    setSaving(null);
    if (error) {
      toast.error("Erro ao salvar meta", { description: error.message });
      return;
    }
    toast.success("Meta salva");
    onSaved();
  };

  if (editors.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">Nenhum editor aprovado.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead className="bg-muted/40 text-xs uppercase">
          <tr>
            <th className="text-left p-2 px-4">Editor</th>
            <th className="text-left p-2 px-4">Meta (min/semana)</th>
            <th className="text-left p-2 px-4">R$ por minuto excedente</th>
            <th className="p-2 px-4 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {editors.map((e) => {
            const r = rows[e.id] ?? { minutes: "0", rate: "0" };
            return (
              <tr key={e.id} className="border-t">
                <td className="p-2 px-4">{e.name}</td>
                <td className="p-2 px-4">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={r.minutes}
                    onChange={(ev) => setRows((p) => ({ ...p, [e.id]: { ...r, minutes: ev.target.value } }))}
                    className="w-32"
                  />
                </td>
                <td className="p-2 px-4">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={r.rate}
                    onChange={(ev) => setRows((p) => ({ ...p, [e.id]: { ...r, rate: ev.target.value } }))}
                    className="w-32"
                  />
                </td>
                <td className="p-2 px-4 text-right">
                  <Button size="sm" onClick={() => save(e.id)} disabled={saving === e.id}>
                    {saving === e.id ? "Salvando..." : "Salvar"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
