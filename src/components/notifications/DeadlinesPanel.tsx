import { Link } from "@tanstack/react-router";
import { CalendarCheck, CalendarClock, CloudOff } from "lucide-react";
import type { DeadlineCard, MyDeadlines } from "@/hooks/use-my-deadlines";
import { cn, formatDateBR } from "@/lib/utils";
import { deadlineLabel, deadlineTone } from "./notification-format";
import { BoardPill, PanelEmpty, PanelSkeleton } from "./NotificationItem";

// Máximo de cards na aba (o resto fica em "Minhas tarefas")
const LIMIT = 20;

// Hoje e amanhã sempre aparecem; o espaço que sobra vai para os atrasados mais recentes
function pickVisible(items: DeadlineCard[]) {
  if (items.length <= LIMIT) return items;
  const soon = items.filter((i) => i.days >= 0).slice(0, LIMIT);
  const room = LIMIT - soon.length;
  const late = room > 0 ? items.filter((i) => i.days < 0).slice(-room) : [];
  return [...late, ...soon];
}

export function DeadlinesPanel({
  data,
  loading,
  error,
  onOpen,
  onNavigate,
}: {
  data: MyDeadlines | undefined;
  loading: boolean;
  error?: boolean;
  onOpen: (c: DeadlineCard) => void;
  /** Fecha o painel ao ir para outra página */
  onNavigate: () => void;
}) {
  if (error && !data) {
    return <PanelEmpty icon={CloudOff} title="Não deu para carregar os prazos" description="Verifique a conexão e abra o sino de novo." />;
  }
  if (loading && !data) return <PanelSkeleton rows={3} />;
  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <PanelEmpty
        icon={CalendarCheck}
        title="Nenhum prazo apertado"
        description="Nada atrasado nem vencendo hoje ou amanhã nos seus cards. Bom trabalho!"
      />
    );
  }
  const visible = pickVisible(items);

  return (
    <div>
      {/* Resumo em uma linha */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5 text-[11px]">
        {data!.overdue > 0 && (
          <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
            {data!.overdue} {data!.overdue === 1 ? "atrasado" : "atrasados"}
          </span>
        )}
        {data!.today > 0 && (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-medium text-warning">
            {data!.today} {data!.today === 1 ? "vence hoje" : "vencem hoje"}
          </span>
        )}
        {data!.tomorrow > 0 && (
          <span className="rounded-full border bg-muted px-2 py-0.5 font-medium text-muted-foreground">
            {data!.tomorrow} {data!.tomorrow === 1 ? "vence amanhã" : "vencem amanhã"}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">Cards em que você é responsável</span>
      </div>

      <ul className="divide-y divide-border">
        {visible.map((c) => {
          const tone = deadlineTone(c.days);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
              >
                <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", tone.icon)}>
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-[13px] leading-snug">
                      {c.short_id && (
                        <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">{c.short_id}</span>
                      )}
                      <span className="text-foreground">{c.title}</span>
                    </p>
                    <span
                      className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", tone.pill)}
                      title={`Prazo: ${formatDateBR(c.due_date)}`}
                    >
                      {deadlineLabel(c.days)}
                    </span>
                  </div>
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <BoardPill name={c.board_name} color={c.board_color} />
                    <span className="shrink-0 text-[11px] text-muted-foreground">Prazo {formatDateBR(c.due_date)}</span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {items.length > visible.length && (
        <div className="border-t px-4 py-2.5 text-center text-xs text-muted-foreground">
          Mostrando {visible.length} de {items.length}.{" "}
          <Link to="/" onClick={onNavigate} className="font-medium text-primary hover:underline underline-offset-2">
            Ver todos em Minhas tarefas
          </Link>
        </div>
      )}
    </div>
  );
}
