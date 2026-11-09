import { Check, ListChecks, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { NotificationWithMeta } from "@/hooks/use-notifications";
import { renderMentionsPlain } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { avatarTone, fullDateTimeBR, initials, timeAgoBR, typeMeta } from "./notification-format";

// Trecho do comentário, com @[Nome](id) virando @Nome
function snippet(body: string | null, max = 160) {
  if (!body) return "";
  const t = renderMentionsPlain(body).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** Nome da esteira na cor dela (mesma pílula das colunas do quadro) */
export function BoardPill({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return null;
  return (
    <span
      className="tint inline-flex h-5 max-w-full items-center gap-1.5 rounded-sm bg-(--tint-pill) px-1.5 text-2xs font-semibold uppercase tracking-wide text-(--tint-ink)"
      style={{ "--tint": color ?? undefined } as React.CSSProperties}
      title={`Esteira ${name}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--tint)" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function NotificationItem({
  n,
  now,
  onOpen,
  onMarkRead,
}: {
  n: NotificationWithMeta;
  now: Date;
  onOpen: (n: NotificationWithMeta) => void;
  onMarkRead: (n: NotificationWithMeta) => void;
}) {
  const unread = !n.read_at;
  const meta = typeMeta(n.type);
  const Icon = meta.icon;
  // Aviso agrupado de subtarefas (o banco tira a subtarefa quando junta várias)
  const phrase = n.type === "subtask_assigned" && !n.subitem_id ? "passou subtarefas para você" : meta.phrase;
  const quote = snippet(n.comment_body);
  const hasCard = !!n.card_board_id;

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(n)}
        className={cn(
          "flex w-full gap-3 px-4 py-3 text-left transition-colors",
          "hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
          unread && "bg-primary/5",
        )}
      >
        {/* Barra lateral = não lida */}
        {unread && <span aria-hidden className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary" />}

        {/* Quem fez + ícone do tipo */}
        <div className="relative mt-0.5 shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarFallback className={cn("text-[11px] font-semibold text-foreground", avatarTone(n.actor_id))}>
              {initials(n.actor_name)}
            </AvatarFallback>
          </Avatar>
          <span
            aria-hidden
            className={cn(
              "absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-popover",
              meta.badge,
            )}
          >
            <Icon className="h-2.5 w-2.5" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[13px] leading-snug">
              <span className="font-semibold text-foreground">{n.actor_name ?? "Alguém"}</span>{" "}
              <span className={unread ? "text-foreground" : "text-muted-foreground"}>{phrase}</span>
            </p>
            <span className="flex shrink-0 items-center gap-1.5 pt-px">
              <time
                dateTime={n.created_at}
                title={fullDateTimeBR(n.created_at)}
                className="text-[11px] text-muted-foreground"
              >
                {timeAgoBR(n.created_at, now)}
              </time>
              {unread && (
                <>
                  <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
                  <span className="sr-only">Não lida</span>
                </>
              )}
            </span>
          </div>

          {/* Card: código + título */}
          {hasCard ? (
            <div className="mt-1 flex min-w-0 items-baseline gap-1.5 text-xs">
              {n.card_short_id && (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{n.card_short_id}</span>
              )}
              <span className="truncate text-foreground/90">{n.card_title}</span>
            </div>
          ) : (
            n.card_id && <div className="mt-1 text-xs italic text-muted-foreground">Card removido ou sem acesso</div>
          )}

          {/* Subtarefa (aviso de subtarefa) */}
          {n.subitem_title && (
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <ListChecks className="h-3 w-3 shrink-0" />
              <span className="truncate">{n.subitem_title}</span>
            </div>
          )}

          {/* Trecho do comentário como citação */}
          {quote && (
            <blockquote className="mt-1.5 line-clamp-2 border-l-2 border-border-strong pl-2 text-xs text-muted-foreground">
              {quote}
            </blockquote>
          )}

          {(n.board_name || unread) && (
            // Não lida: reserva a linha (e o espaço à direita) para o botão "Marcar como lida"
            <div className={cn("mt-2 flex min-h-5", unread && "pr-32")}>
              <BoardPill name={n.board_name} color={n.board_color} />
            </div>
          )}
        </div>
      </button>

      {/* Marcar só esta como lida: aparece ao passar o mouse, na linha da esteira
          (em tela de toque fica sempre visível) */}
      {unread && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(n);
          }}
          title="Marcar como lida"
          className={cn(
            "absolute bottom-2.5 right-3 hidden h-6 items-center gap-1 rounded-md border bg-popover px-1.5",
            "text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground",
            "group-hover:inline-flex group-focus-within:inline-flex [@media(hover:none)]:inline-flex",
          )}
        >
          <Check className="h-3 w-3" /> Marcar como lida
        </button>
      )}
    </li>
  );
}

/** Estado vazio de cada aba */
export function PanelEmpty({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lane text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-[280px] text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/** Carregando: linhas no formato de um aviso */
export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4 px-4 py-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
