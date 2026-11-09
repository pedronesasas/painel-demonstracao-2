import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth, type TabKey } from "@/lib/auth";
import {
  LayoutDashboard, ListChecks, Trophy, GitCompareArrows, Upload, Users,
  LogOut, Package, KanbanSquare, Calendar as CalendarIcon,
  BarChart3, Settings, ChevronDown, FileText, Menu, Home, Film, Rocket, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import nexusLogo from "@/assets/nexus-logo.png";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; tab: TabKey };
type Board = { id: string; name: string; color: string };

const operationItems: NavItem[] = [
  { to: "/boards", label: "Esteiras", icon: KanbanSquare, tab: "boards" },
  { to: "/funis", label: "Funis", icon: Rocket, tab: "funnels" },
  { to: "/calendar", label: "Agenda", icon: CalendarIcon, tab: "calendar" },
  { to: "/documents", label: "Documentos", icon: FileText, tab: "documents" },
  { to: "/vsls", label: "Inventário de VSLs", icon: Film, tab: "vsls" },
  { to: "/chips", label: "Chips de WhatsApp", icon: Smartphone, tab: "chips" },
  { to: "/reports", label: "Relatórios", icon: BarChart3, tab: "reports" },
];

const metricsItems: NavItem[] = [
  { to: "/metrics", label: "Dashboard", icon: LayoutDashboard, tab: "dashboard" },
  { to: "/campaigns", label: "Campanhas", icon: ListChecks, tab: "campaigns" },
  { to: "/products", label: "Produtos", icon: Package, tab: "products" },
  
  { to: "/compare", label: "Comparar", icon: GitCompareArrows, tab: "compare" },
  { to: "/ranking", label: "Ranking", icon: Trophy, tab: "ranking" },
];
const systemItems: NavItem[] = [
  { to: "/settings", label: "Configurações", icon: Settings, tab: "settings" },
  { to: "/users", label: "Usuários", icon: Users, tab: "users" },
];

// Item ativo: fundo neutro e barra roxa de 3px à esquerda (o ícone fica text-primary)
const ACTIVE_ITEM =
  "relative bg-sidebar-accent text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary";

function NavGroup({
  title, items, currentPath, canView, boards,
}: {
  title: string; items: NavItem[]; currentPath: string;
  canView: (t: TabKey) => boolean; canEditTab: (t: TabKey) => boolean;
  boards?: Board[];
}) {
  const boardsActive = currentPath.startsWith("/boards");
  const [boardsOpen, setBoardsOpen] = useState(boardsActive);
  useEffect(() => { if (boardsActive) setBoardsOpen(true); }, [boardsActive]);
  const visible = items.filter((i) => canView(i.tab));
  if (visible.length === 0) return null;

  return (
    <div className="pt-3">
      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/45">
        {title}
      </div>
      <div className="space-y-0.5">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to);
          const isBoards = item.to === "/boards" && boards;
          return (
            <div key={item.to}>
              <div className="flex items-center group">
                <Link
                  to={item.to}
                  className={cn(
                    "flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? ACTIVE_ITEM
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-primary")} />
                  {item.label}
                </Link>
                {isBoards && (
                  <button onClick={() => setBoardsOpen((v) => !v)}
                    className="ml-1 rounded-md p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    aria-label={boardsOpen ? "Recolher" : "Expandir"}>
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", boardsOpen && "rotate-180")} />
                  </button>
                )}
              </div>
              {isBoards && boardsOpen && (
                <div className="mt-0.5 ml-6 border-l border-sidebar-border/60 pl-2 space-y-0.5">
                  {boards!.length === 0 ? (
                    <div className="px-2 py-1 text-[11px] text-sidebar-foreground/50">Nenhuma esteira</div>
                  ) : boards!.map((b) => {
                    const bActive = currentPath === `/boards/${b.id}`;
                    return (
                      <Link key={b.id} to="/boards/$boardId" params={{ boardId: b.id }}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                          bActive
                            ? "bg-sidebar-accent text-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}>
                        <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: b.color }} />
                        <span className="truncate">{b.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AppLayout({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  const { user, signOut, canViewTab, canEditTab } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: boards = [] } = useQuery({
    queryKey: ["sidebar-boards"],
    queryFn: async () => {
      const { data } = await supabase.from("boards")
        .select("id,name,color,position").order("position");
      return (data ?? []) as Board[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  useEffect(() => {
    type RTPayload<T> = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: T; old: T };
    const channelName = `sidebar-data-${Math.random().toString(36).slice(2)}`;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase.channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "boards" }, (p) => {
          const { eventType, new: nw, old } = p as unknown as RTPayload<Board & { id: string; position: number }>;
          qc.setQueryData<Board[]>(["sidebar-boards"], (prev = []) => {
            if (eventType === "INSERT") return [...prev, nw as Board].sort((a, b) => (a as Board & {position:number}).position - (b as Board & {position:number}).position);
            if (eventType === "UPDATE") return prev.map((b) => b.id === nw.id ? { ...b, ...nw } : b);
            if (eventType === "DELETE") return prev.filter((b) => b.id !== old.id);
            return prev;
          });
        })
        .subscribe();
    } catch (e) {
      console.warn("[sidebar realtime] falhou:", e);
    }
    return () => { if (ch) supabase.removeChannel(ch); };
  }, [qc]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", search: { next: undefined } });
  };

  const sidebarBody = (
    <>
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <img src={nexusLogo} alt="NEXUS" className="h-10 w-10 rounded-full object-cover ring-1 ring-sidebar-border" />
        <div>
          <div className="text-sm font-semibold leading-tight tracking-wide">NEXUS</div>
          <div className="text-xs text-muted-foreground">Operação & Métricas</div>
        </div>
      </div>

      <div className="px-3 pt-3 flex items-center gap-2">
        <div className="flex-1 min-w-0"><GlobalSearch /></div>
        <NotificationBell />
      </div>

      <nav className="flex-1 px-3 py-3 space-y-2 overflow-y-auto">
        <Link to="/" className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          location.pathname === "/"
            ? ACTIVE_ITEM
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )}>
          <Home className={cn("h-4 w-4", location.pathname === "/" && "text-primary")} /> Minhas tarefas
        </Link>
        <NavGroup title="Operação" items={operationItems} currentPath={location.pathname}
          canView={canViewTab} canEditTab={canEditTab} boards={boards} />
        <NavGroup title="Métricas" items={metricsItems} currentPath={location.pathname}
          canView={canViewTab} canEditTab={canEditTab} />
        <NavGroup title="Sistema" items={systemItems} currentPath={location.pathname}
          canView={canViewTab} canEditTab={canEditTab} />
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex-col">
        {sidebarBody}
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-2 border-b border-border px-3 py-2 sticky top-0 bg-background z-30">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground flex flex-col">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              {sidebarBody}
            </SheetContent>
          </Sheet>
          <img src={nexusLogo} alt="NEXUS" className="h-7 w-7 rounded-full object-cover" />
          <div className="text-sm font-semibold">NEXUS</div>
        </div>
        {fullBleed ? children : <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 md:py-8">{children}</div>}
      </main>
    </div>
  );
}
