import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff, CheckCheck, CloudOff, PartyPopper } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NOTIFICATIONS_LIMIT, useNotifications, type NotificationWithMeta } from "@/hooks/use-notifications";
import { useMyDeadlines, type DeadlineCard } from "@/hooks/use-my-deadlines";
import { NotificationItem, PanelEmpty, PanelSkeleton } from "@/components/notifications/NotificationItem";
import { DeadlinesPanel } from "@/components/notifications/DeadlinesPanel";
import { groupByDay } from "@/components/notifications/notification-format";
import { cn } from "@/lib/utils";

type Tab = "unread" | "all" | "deadlines";

// Número pequeno ao lado do nome da aba
function CountPill({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={cn("min-w-[18px] rounded-full px-1.5 text-[10px] font-semibold leading-[18px] tabular-nums", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

// Lista agrupada por dia (Hoje / Ontem / Esta semana / Anteriores)
function GroupedList({
  items,
  now,
  onOpen,
  onMarkRead,
}: {
  items: NotificationWithMeta[];
  now: Date;
  onOpen: (n: NotificationWithMeta) => void;
  onMarkRead: (n: NotificationWithMeta) => void;
}) {
  return (
    <>
      {groupByDay(items, now).map((g) => (
        <section key={g.key}>
          <h3 className="eyebrow sticky top-0 z-10 border-b bg-popover px-4 py-1.5">{g.label}</h3>
          <ul className="divide-y divide-border">
            {g.items.map((n) => (
              <NotificationItem key={n.id} n={n} now={now} onOpen={onOpen} onMarkRead={onMarkRead} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function NotificationBell() {
  const { data = [], isLoading, isError, unreadCount, markRead, markAllRead, markCardRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("unread");
  // Relógio do "há 5 min": atualiza a cada minuto com o painel aberto
  const [now, setNow] = useState(() => new Date());
  // Prazos só são buscados com o painel aberto (não entram no número do sino)
  const deadlines = useMyDeadlines(open);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [open]);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setNow(new Date());
      // Abre em "Não lidas" quando tem novidade; senão no histórico
      setTab(unreadCount > 0 ? "unread" : "all");
    }
    setOpen(next);
  };

  const goToCard = (boardId: string, cardId: string) => {
    setOpen(false);
    navigate({ to: "/boards/$boardId", params: { boardId }, search: { card: cardId } });
  };

  const onOpenNotification = (n: NotificationWithMeta) => {
    // Abrir o card marca como lidas todas as notificações dele
    if (n.card_id && n.card_board_id) {
      void markCardRead(n.card_id);
      goToCard(n.card_board_id, n.card_id);
    } else {
      // Card removido ou sem acesso: só marca esta como lida
      void markRead(n.id);
    }
  };

  const onOpenDeadline = (c: DeadlineCard) => goToCard(c.board_id, c.id);

  const unreadItems = data.filter((n) => !n.read_at);
  // Não lidas além das que o painel carregou (mais de 50)
  const hiddenUnread = Math.max(0, unreadCount - unreadItems.length);
  const dl = deadlines.data;
  const dlTotal = dl ? dl.overdue + dl.today + dl.tomorrow : 0;
  // Cor do contador de prazos: vermelho se tem atrasado, âmbar se vence hoje
  const dlTone = !dl
    ? ""
    : dl.overdue > 0
      ? "bg-destructive/15 text-destructive"
      : dl.today > 0
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : "Notificações"}
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-md",
            "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors",
          )}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary-strong text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={8}
        className="w-[440px] max-w-[calc(100vw-16px)] overflow-hidden p-0"
      >
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <div className="space-y-2.5 border-b px-4 pb-3 pt-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Notificações</h2>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-2 h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => void markAllRead()}
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
                </Button>
              )}
            </div>
            <TabsList className="grid h-8 w-full grid-cols-3">
              <TabsTrigger value="unread" className="gap-1.5 text-xs">
                Não lidas <CountPill n={unreadCount} className="bg-primary-strong text-primary-foreground" />
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs">
                Todas
              </TabsTrigger>
              <TabsTrigger value="deadlines" className="gap-1.5 text-xs">
                Prazos <CountPill n={dlTotal} className={dlTone} />
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="max-h-[min(70vh,560px)] overflow-y-auto">
            <TabsContent value="unread" className="mt-0">
              {isLoading ? (
                <PanelSkeleton />
              ) : isError && data.length === 0 ? (
                <PanelEmpty
                  icon={CloudOff}
                  title="Não deu para carregar"
                  description="Verifique a conexão e abra o sino de novo."
                />
              ) : unreadItems.length === 0 && hiddenUnread === 0 ? (
                <PanelEmpty
                  icon={PartyPopper}
                  title="Tudo em dia!"
                  description="Você já viu todas as notificações. As antigas continuam na aba Todas."
                />
              ) : (
                <>
                  <GroupedList items={unreadItems} now={now} onOpen={onOpenNotification} onMarkRead={(n) => void markRead(n.id)} />
                  {hiddenUnread > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-1 border-t px-4 py-2.5 text-center text-xs text-muted-foreground">
                      {hiddenUnread === 1 ? "Há mais 1 não lida antiga." : `Há mais ${hiddenUnread} não lidas antigas.`}
                      <button
                        type="button"
                        onClick={() => void markAllRead()}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        Marcar todas como lidas
                      </button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-0">
              {isLoading ? (
                <PanelSkeleton />
              ) : isError && data.length === 0 ? (
                <PanelEmpty
                  icon={CloudOff}
                  title="Não deu para carregar"
                  description="Verifique a conexão e abra o sino de novo."
                />
              ) : data.length === 0 ? (
                <PanelEmpty
                  icon={BellOff}
                  title="Nenhuma notificação ainda"
                  description="Quando alguém mencionar você, comentar num card seu ou passar uma tarefa para você, aparece aqui."
                />
              ) : (
                <>
                  <GroupedList items={data} now={now} onOpen={onOpenNotification} onMarkRead={(n) => void markRead(n.id)} />
                  {data.length >= NOTIFICATIONS_LIMIT && (
                    <div className="border-t px-4 py-2.5 text-center text-xs text-muted-foreground">
                      Mostrando só as mais recentes (e as não lidas).
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="deadlines" className="mt-0">
              <DeadlinesPanel
                data={dl}
                loading={deadlines.isPending}
                error={deadlines.isError}
                onOpen={onOpenDeadline}
                onNavigate={() => setOpen(false)}
              />
            </TabsContent>
          </div>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
