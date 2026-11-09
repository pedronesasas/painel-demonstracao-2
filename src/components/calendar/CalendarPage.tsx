import { useEffect, useMemo, useState, useCallback } from "react";
import { Calendar, dateFnsLocalizer, Views, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addDays, addMonths, addWeeks, startOfMonth, endOfMonth, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { CardDetailSheet } from "@/components/board/CardDetailSheet";

const locales = { "pt-BR": ptBR };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

type Board = { id: string; name: string };
type Column = { id: string; board_id: string; name: string; color: string; position: number };
type CardRow = {
  id: string; board_id: string; column_id: string; title: string;
  start_date: string | null; end_date: string | null; visible_in_calendar: boolean;
};

type NewTask = { title: string; board_id: string; start_date: string; end_date: string };

export function CalendarPage() {
  const { hasCapability, isAdmin, canEditTab } = useAuth();
  const canCreate = canEditTab("boards");
  const _canManage = isAdmin || hasCapability("manage_calendar");

  const [boards, setBoards] = useState<Board[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [creating, setCreating] = useState<NewTask | null>(null);
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState<Date>(new Date());
  const [expanded, setExpanded] = useState(true);

  // Compute visible period to filter cards
  const { rangeStart, rangeEnd } = useMemo(() => {
    let s: Date; let e: Date;
    if (view === Views.WEEK) {
      s = startOfWeek(date, { locale: ptBR });
      e = endOfWeek(date, { locale: ptBR });
    } else if (view === Views.AGENDA) {
      s = date;
      e = addDays(date, 30);
    } else {
      s = startOfWeek(startOfMonth(date), { locale: ptBR });
      e = endOfWeek(endOfMonth(date), { locale: ptBR });
    }
    return { rangeStart: s.toISOString().slice(0, 10), rangeEnd: e.toISOString().slice(0, 10) };
  }, [date, view]);

  const load = useCallback(async () => {
    const [b, col, c] = await Promise.all([
      supabase.from("boards").select("id,name").order("position"),
      supabase.from("board_columns").select("id,board_id,name,color,position").order("position"),
      supabase.from("cards")
        .select("id,board_id,column_id,title,start_date,end_date,visible_in_calendar")
        .eq("visible_in_calendar", true)
        .not("start_date", "is", null).not("end_date", "is", null)
        .lte("start_date", rangeEnd).gte("end_date", rangeStart)
        .range(0, 1999),
    ]);
    setBoards((b.data ?? []) as Board[]);
    setColumns((col.data ?? []) as Column[]);
    setCards((c.data ?? []) as CardRow[]);
  }, [rangeStart, rangeEnd]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel(`cal-cards-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_columns" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const events = useMemo(() => {
    return cards
      .filter((c) => c.start_date && c.end_date && c.visible_in_calendar)
      .map((c) => {
        const col = columns.find((x) => x.id === c.column_id);
        const start = new Date(c.start_date + "T00:00:00");
        // react-big-calendar end is exclusive in month view → add 1 day so multi-day spans show inclusive
        const end = addDays(new Date(c.end_date + "T00:00:00"), 1);
        return {
          id: c.id,
          title: c.title,
          start,
          end,
          allDay: true,
          resource: { card: c, color: col?.color ?? "#6366f1" },
        };
      });
  }, [cards, columns]);

  const startCreate = (date?: Date) => {
    if (!canCreate) { toast.error("Sem permissão para criar tarefas"); return; }
    if (boards.length === 0) { toast.error("Crie uma esteira primeiro"); return; }
    const d = (date ?? new Date()).toISOString().slice(0, 10);
    setCreating({ title: "", board_id: boards[0].id, start_date: d, end_date: d });
  };

  const saveNew = async () => {
    if (!creating) return;
    if (!creating.title.trim()) { toast.error("Informe o nome da tarefa"); return; }
    if (!creating.board_id) { toast.error("Selecione a esteira"); return; }
    if (!creating.start_date || !creating.end_date) { toast.error("Informe início e fim"); return; }
    if (creating.end_date < creating.start_date) { toast.error("Fim deve ser depois do início"); return; }

    const boardCols = columns.filter((c) => c.board_id === creating.board_id).sort((a, b) => a.position - b.position);
    const firstCol = boardCols[0];
    if (!firstCol) { toast.error("Esteira sem colunas"); return; }

    const { data, error } = await supabase.from("cards").insert({
      board_id: creating.board_id,
      column_id: firstCol.id,
      title: creating.title.trim(),
      start_date: creating.start_date,
      end_date: creating.end_date,
      visible_in_calendar: true,
    } as never).select("id").maybeSingle();

    if (error) { toast.error(error.message); return; }
    toast.success("Tarefa criada");
    setCreating(null);
    load();
    if (data?.id) setOpenCardId(data.id as string);
  };

  const goPrev = () => {
    if (view === Views.MONTH) setDate(addMonths(date, -1));
    else if (view === Views.WEEK) setDate(addWeeks(date, -1));
    else setDate(addDays(date, -1));
  };
  const goNext = () => {
    if (view === Views.MONTH) setDate(addMonths(date, 1));
    else if (view === Views.WEEK) setDate(addWeeks(date, 1));
    else setDate(addDays(date, 1));
  };

  const monthLabel = format(date, view === Views.MONTH ? "MMMM 'de' yyyy" : "MMMM yyyy", { locale: ptBR });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agenda"
        description="Tarefas com período definido e visíveis no calendário, coloridas pela coluna em que estão."
        actions={canCreate && (
          <Button onClick={() => startCreate()}>
            <Plus className="h-4 w-4" /> Nova tarefa
          </Button>
        )}
      />

      {/* Custom header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold capitalize tracking-tight">{monthLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDate(new Date())}>Hoje</Button>
          <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
            <button onClick={goPrev} className="px-2 py-1.5 hover:bg-accent transition" aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="h-5 w-px bg-border/60" />
            <button onClick={goNext} className="px-2 py-1.5 hover:bg-accent transition" aria-label="Próximo">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="h-9">
              <TabsTrigger value={Views.MONTH}>Mês</TabsTrigger>
              <TabsTrigger value={Views.WEEK}>Semana</TabsTrigger>
              <TabsTrigger value={Views.AGENDA}>Lista</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div
        className={`rounded-xl border border-border/50 bg-card/60 p-2 nexus-cal ${expanded ? "nexus-cal-expanded" : ""}`}
        style={{ minHeight: 720 }}
      >
        <Calendar
          localizer={localizer}
          events={events}
          views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          defaultView={Views.MONTH}
          culture="pt-BR"
          popup={false}
          onShowMore={() => setExpanded(true)}
          toolbar={false}
          messages={{
            next: "Próx", previous: "Ant", today: "Hoje",
            month: "Mês", week: "Semana", agenda: "Lista",
            date: "Data", time: "Hora", event: "Tarefa",
            noEventsInRange: "Sem tarefas no período.",
            showMore: (n) => `+${n} mais`,
          }}
          eventPropGetter={(ev) => {
            const color = (ev.resource as { color: string }).color;
            return {
              style: {
                backgroundColor: color,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "2px 8px",
                fontWeight: 500,
                fontSize: "0.75rem",
                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              },
            };
          }}
          onSelectEvent={(ev) => setOpenCardId((ev.resource as { card: CardRow }).card.id)}
          selectable
          onSelectSlot={(slot) => startCreate(slot.start as Date)}
        />
        {expanded && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => setExpanded(false)}
            >
              Recolher dias expandidos
            </button>
          </div>
        )}
      </div>

      {/* Create task dialog */}
      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova tarefa no calendário</DialogTitle></DialogHeader>
          {creating && (
            <div className="space-y-3">
              <div>
                <Label>Nome da tarefa</Label>
                <Input
                  value={creating.title}
                  onChange={(e) => setCreating({ ...creating, title: e.target.value })}
                  placeholder="Ex: Lançamento campanha X"
                  autoFocus
                />
              </div>
              <div>
                <Label>Esteira</Label>
                <Select value={creating.board_id} onValueChange={(v) => setCreating({ ...creating, board_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Início</Label>
                  <Input type="date" value={creating.start_date} onChange={(e) => setCreating({ ...creating, start_date: e.target.value })} />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input type="date" value={creating.end_date} onChange={(e) => setCreating({ ...creating, end_date: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A tarefa será adicionada na primeira coluna da esteira selecionada e ficará visível no calendário.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(null)}>Cancelar</Button>
            <Button onClick={saveNew}>Criar tarefa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {openCardId && (
        <CardDetailSheet
          cardId={openCardId}
          onClose={() => setOpenCardId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
