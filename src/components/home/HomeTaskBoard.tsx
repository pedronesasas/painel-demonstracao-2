import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar, ChartPie, CircleCheck, CircleDashed, CircleDot, CirclePause, Contrast, CornerDownRight, Eye,
  Repeat, SquareKanban, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { ListSkeleton } from "@/components/ui/loading-state";
import { cn, formatDateBR, relativeDueBR } from "@/lib/utils";
import type {
  BoardLite, ColumnKind, ColumnLite, DoneItem, Item, SubItem, TaskItem,
} from "./home-types";

// Quadro de "Minhas tarefas": uma coluna por TIPO de coluna (Pendente, Em progresso...), juntando
// os cards de todas as esteiras. Só visualização: concluir/reabrir usa as mesmas ações da lista.

// Cor de entidade para a receita .tint (styles.css)
const tintStyle = (color?: string) => ({ "--tint": color }) as React.CSSProperties;

// Classe base dos chips do card (coluna, prazo, recorrência)
const CHIP = "inline-flex h-5 items-center gap-1 rounded-sm border border-border px-1.5 text-[11px] font-medium leading-none text-muted-foreground";

// Ícone do cabeçalho pelo tipo da coluna (mesmo mapa do quadro da esteira)
const KIND_ICONS: Record<string, LucideIcon> = {
  "Pendente": CircleDashed,
  "Em progresso": Contrast,
  "Revisão": Eye,
  "Análise de métricas": ChartPie,
};

const DONE_KEY = "__done";
const NONE_KEY = "__none";

// Compara nomes sem acento, caixa e plural: "Pendentes" = "Pendente", "Em Progresso" = "Em progresso"
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const sameName = (a: string, b: string) => norm(a).replace(/s$/, "") === norm(b).replace(/s$/, "");

const isPauseKind = (k: ColumnKind) => !k.is_done && (k.is_paused || /paus/i.test(k.label));

type Lane = {
  key: string;
  label: string;
  color?: string;
  icon: LucideIcon;
  // Rótulo do tipo, para decidir se mostra o nome real da coluna no card
  kindLabel?: string;
  // Explicação ao passar o mouse no cabeçalho
  hint?: string;
  items: Item[];
  // Só na última coluna: o que foi concluído hoje
  done?: DoneItem[];
};

export function HomeTaskBoard({
  items, completed, boards, columns, today, onCompleteTask, onCompleteSub, onReopen, onOpenCard,
}: {
  items: Item[];
  completed: DoneItem[];
  boards: Record<string, BoardLite>;
  columns: Record<string, ColumnLite>;
  today: string;
  onCompleteTask: (t: TaskItem) => void;
  onCompleteSub: (s: SubItem) => void;
  onReopen: (d: DoneItem) => void;
  onOpenCard: (cardId: string) => void;
}) {
  // Chave própria: o quadro da esteira guarda em ["board_column_kinds"] só id e label
  const { data: kinds, isError: kindsError } = useQuery({
    queryKey: ["board_column_kinds", "full"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_column_kinds")
        .select("id,label,sort,is_done,is_paused")
        .order("sort");
      if (error) throw error;
      return (data ?? []) as ColumnKind[];
    },
  });

  // Cor de cada tipo = a cor mais usada pelas colunas daquele tipo nas esteiras
  const { data: kindColors = {} } = useQuery({
    queryKey: ["board_columns", "kind-colors"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("board_columns").select("kind_id,color").range(0, 1999);
      if (error) throw error;
      const counts = new Map<string, Map<string, number>>();
      for (const r of (data ?? []) as Array<{ kind_id: string | null; color: string | null }>) {
        if (!r.kind_id || !r.color) continue;
        const m = counts.get(r.kind_id) ?? new Map<string, number>();
        m.set(r.color, (m.get(r.color) ?? 0) + 1);
        counts.set(r.kind_id, m);
      }
      const out: Record<string, string> = {};
      for (const [kindId, m] of counts) {
        // Empate: ordem alfabética da cor, para não trocar de cor a cada carga
        const [best] = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        if (best) out[kindId] = best[0];
      }
      return out;
    },
  });

  const lanes = useMemo<Lane[] | null>(() => {
    // Se os tipos não carregarem, monta o quadro mesmo assim (tudo em "Sem tipo") em vez de travar no carregando
    const kindList = kinds ?? (kindsError ? [] : null);
    if (!kindList) return null;
    const sorted = [...kindList].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
    const doneKinds = sorted.filter((k) => k.is_done);
    const pauseKinds = sorted.filter(isPauseKind);
    const workKinds = sorted.filter((k) => !k.is_done && !isPauseKind(k));
    // Sempre visíveis, mesmo vazias (pelo nome; se renomearem, pela ordem)
    const pendingKind = workKinds.find((k) => norm(k.label).startsWith("pendente")) ?? workKinds[0];
    const progressKind = workKinds.find((k) => norm(k.label).includes("progresso"))
      ?? workKinds.find((k) => k !== pendingKind);

    const kindIds = new Set(sorted.map((k) => k.id));
    const byKey = new Map<string, Item[]>();
    for (const it of items) {
      const col = columns[it.kind === "task" ? it.column_id : it.parent_column_id];
      let kindId = col?.kind_id && kindIds.has(col.kind_id) ? col.kind_id : null;
      // Coluna sem tipo: usa as marcações dela (pausa / conclusão) antes de cair em "Sem tipo"
      if (!kindId && col?.is_paused_column) kindId = pauseKinds[0]?.id ?? null;
      if (!kindId && col?.is_done_column) kindId = doneKinds[0]?.id ?? null;
      const key = kindId ?? NONE_KEY;
      const list = byKey.get(key) ?? [];
      list.push(it);
      byKey.set(key, list);
    }

    const out: Lane[] = [];
    for (const k of [...pauseKinds, ...workKinds]) {
      const list = byKey.get(k.id) ?? [];
      if (list.length === 0 && k !== pendingKind && k !== progressKind) continue;
      out.push({
        key: k.id,
        label: k.label,
        kindLabel: k.label,
        color: kindColors[k.id],
        icon: isPauseKind(k) ? CirclePause : (KIND_ICONS[k.label] ?? CircleDot),
        items: list,
      });
    }
    const orphans = byKey.get(NONE_KEY) ?? [];
    if (orphans.length) out.push({ key: NONE_KEY, label: "Sem tipo", icon: CircleDot, items: orphans });
    // Card que está numa coluna de concluídas mas ainda não foi concluído (raro): coluna própria,
    // com o nome do tipo, só quando tiver itens. Assim "Concluídas hoje" fica só com o que foi concluído hoje.
    for (const k of doneKinds) {
      const list = byKey.get(k.id) ?? [];
      if (list.length === 0) continue;
      out.push({
        key: k.id,
        label: k.label,
        kindLabel: k.label,
        color: kindColors[k.id],
        icon: CircleCheck,
        hint: "Tarefas que estão numa coluna de concluídas, mas ainda não foram marcadas como concluídas",
        items: list,
      });
    }
    out.push({
      key: DONE_KEY,
      label: "Concluídas hoje",
      color: doneKinds[0] ? kindColors[doneKinds[0].id] : undefined,
      icon: CircleCheck,
      items: [],
      done: completed,
    });
    return out;
  }, [kinds, kindsError, kindColors, items, columns, completed]);

  if (!lanes) return <ListSkeleton rows={4} />;

  return (
    <div className="space-y-2">
      {kindsError && !kinds && (
        <p className="px-1 text-xs text-muted-foreground">
          Não deu para carregar os tipos de coluna. As tarefas aparecem em “Sem tipo” até a próxima atualização.
        </p>
      )}
      {/* items-start: cada coluna tem a altura do próprio conteúdo */}
      <div className="flex items-start gap-3 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none -mx-4 px-4 md:-mx-6 md:px-6">
        {lanes.map((lane) => {
          const Icon = lane.icon;
          const count = lane.items.length + (lane.done?.length ?? 0);
          return (
            <section
              key={lane.key}
              className="tint flex max-h-[75vh] w-[85vw] sm:w-[280px] shrink-0 flex-col rounded-xl border border-(--tint-edge) bg-(--tint-lane) p-1.5 snap-center md:snap-align-none"
              style={tintStyle(lane.color)}
            >
              <header className="flex h-8 shrink-0 items-center gap-2 px-1 pb-1.5" title={lane.hint}>
                <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-sm bg-(--tint-pill) px-2 text-[11px] font-semibold uppercase tracking-wide text-(--tint-ink)">
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  <span className="truncate">{lane.label}</span>
                </span>
                <span className="text-xs font-semibold tabular-nums text-(--tint-ink) opacity-80">{count}</span>
              </header>
              <div className="flex-1 min-h-12 space-y-2 overflow-y-auto rounded-lg p-0.5">
                {count === 0 && (
                  <div className="grid h-16 place-items-center rounded-lg border border-dashed border-(--tint-edge) text-[11px] text-muted-foreground">
                    {lane.done ? "Nada concluído hoje" : "Nada por aqui"}
                  </div>
                )}
                {lane.items.map((it) =>
                  it.kind === "task" ? (
                    <TaskCard
                      key={`t-${it.id}`}
                      it={it}
                      board={boards[it.board_id]}
                      column={columns[it.column_id]}
                      kindLabel={lane.kindLabel}
                      today={today}
                      onComplete={() => onCompleteTask(it)}
                      onOpen={() => onOpenCard(it.id)}
                    />
                  ) : (
                    <SubCard
                      key={`s-${it.id}`}
                      it={it}
                      board={boards[it.parent_board_id]}
                      today={today}
                      onComplete={() => onCompleteSub(it)}
                      onOpen={() => onOpenCard(it.card_id)}
                    />
                  ),
                )}
                {lane.done?.map((d) => (
                  <DoneCard
                    key={`d-${d.id}`}
                    it={d}
                    board={boards[d.board_id]}
                    onReopen={() => onReopen(d)}
                    onOpen={() => onOpenCard(d.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// Esteira do card, em pílula na cor dela
function BoardPill({ board }: { board?: BoardLite }) {
  if (!board) return null;
  return (
    <span
      className="tint inline-flex h-5 min-w-0 max-w-full items-center gap-1 rounded-sm bg-(--tint-pill) px-1.5 text-[10px] font-semibold uppercase tracking-wide text-(--tint-ink)"
      style={tintStyle(board.color)}
    >
      <SquareKanban className="h-3 w-3 shrink-0" strokeWidth={2.25} />
      <span className="truncate max-w-[150px]">{board.name}</span>
    </span>
  );
}

// Prazo só ganha cor quando atrasado (vermelho) ou vence hoje (âmbar), como na lista
function DueChip({ due, today }: { due: string | null; today: string }) {
  if (!due) return null;
  const tone = due < today ? "border-destructive/30 bg-destructive/10 text-destructive"
    : due === today ? "border-warning/30 bg-warning/10 text-warning"
    : "";
  return (
    <span className={cn(CHIP, "tabular-nums", tone)} title={formatDateBR(due)}>
      <Calendar className="h-3 w-3" />
      {relativeDueBR(due, today)}
    </span>
  );
}

// O botão do título cobre o card inteiro (after:inset-0); a caixinha fica por cima (z-10)
const OPEN_BUTTON = "min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring/60";
const CARD = "relative rounded-lg border border-border bg-card shadow-card transition-colors hover:border-(--tint-line) hover:bg-card-hover";

function TaskCard({
  it, board, column, kindLabel, today, onComplete, onOpen,
}: {
  it: TaskItem; board?: BoardLite; column?: ColumnLite; kindLabel?: string; today: string;
  onComplete: () => void; onOpen: () => void;
}) {
  // Nome real da coluna só quando diz algo além do tipo ("Montando" dentro de Pendente)
  const columnName = column && (!kindLabel || !sameName(column.name, kindLabel)) ? column.name : null;
  return (
    <div className={cn(CARD, "p-3")}>
      <div className="flex items-start gap-2">
        <Checkbox
          checked={false}
          onCheckedChange={onComplete}
          className="relative z-10 mt-0.5 shrink-0 rounded-full"
          aria-label="Concluir tarefa"
        />
        <button type="button" onClick={onOpen} title={it.title} className={OPEN_BUTTON}>
          <span className="line-clamp-2 break-words text-[13px] font-medium leading-5 text-foreground/95">{it.title}</span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <BoardPill board={board} />
        {columnName && (
          <span className={cn(CHIP, "max-w-[150px]")} title="Coluna na esteira">
            <span className="truncate">{columnName}</span>
          </span>
        )}
        <DueChip due={it.due_date} today={today} />
        {it.recurring && (
          <span className={CHIP} title="Tarefa recorrente">
            <Repeat className="h-3 w-3" />
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/50">{it.short_id}</span>
      </div>
    </div>
  );
}

function SubCard({
  it, board, today, onComplete, onOpen,
}: {
  it: SubItem; board?: BoardLite; today: string; onComplete: () => void; onOpen: () => void;
}) {
  return (
    <div className={cn(CARD, "px-2.5 py-2")}>
      <div className="flex items-start gap-2">
        <Checkbox
          checked={false}
          onCheckedChange={onComplete}
          className="relative z-10 mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full"
          aria-label="Concluir subtarefa"
        />
        <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <button type="button" onClick={onOpen} title={it.title} className={OPEN_BUTTON}>
          <span className="line-clamp-2 break-words text-[12px] leading-4 text-foreground/90">{it.title}</span>
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground" title={it.parent_title || undefined}>
          Subtarefa de <span className="font-mono">{it.parent_short_id}</span>
        </span>
        <BoardPill board={board} />
        <DueChip due={it.due_date} today={today} />
      </div>
    </div>
  );
}

function DoneCard({
  it, board, onReopen, onOpen,
}: {
  it: DoneItem; board?: BoardLite; onReopen: () => void; onOpen: () => void;
}) {
  const time = new Date(it.completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn(CARD, "p-3")}>
      <div className="flex items-start gap-2">
        <Checkbox
          checked
          onCheckedChange={onReopen}
          className="relative z-10 mt-0.5 shrink-0 rounded-full"
          aria-label="Reabrir tarefa"
        />
        <button type="button" onClick={onOpen} title={it.title} className={OPEN_BUTTON}>
          <span className="line-clamp-2 break-words text-[13px] font-medium leading-5 text-muted-foreground line-through decoration-muted-foreground/40">
            {it.title}
          </span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <BoardPill board={board} />
        <span className="text-[11px] tabular-nums text-muted-foreground">às {time}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/50">{it.short_id}</span>
      </div>
    </div>
  );
}
