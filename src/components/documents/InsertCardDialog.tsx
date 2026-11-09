import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfiles, firstName, type ProfileLite } from "@/hooks/use-profiles";
import { toast } from "sonner";
import { Search, Plus, Hash, X } from "lucide-react";

export type InsertedCard = {
  cardId: string;
  boardId: string;
  shortId: string;
  title: string;
};

type CardRow = {
  id: string; short_id: string; title: string; board_id: string;
  assignee_id: string | null; completed_at: string | null;
};
type BoardRow = { id: string; name: string; color: string };
type ColumnRow = { id: string; board_id: string; position: number; is_done_column: boolean };

const ALL = "__all__";
const NONE = "__none__";

function initialsOf(p?: ProfileLite) {
  const n = p?.full_name || p?.email || "?";
  const parts = n.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function InsertCardDialog({
  open, onOpenChange, onInsert,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInsert: (card: InsertedCard) => void;
}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"search" | "create">("search");
  const [query, setQuery] = useState("");
  const [boardFilter, setBoardFilter] = useState<string>(ALL);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(ALL);
  const [newBoardId, setNewBoardId] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // Boards visible to current user — RLS already filters by can_view_board
  const { data: boards = [] } = useQuery<BoardRow[]>({
    queryKey: ["boards", "picker", user?.id],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boards").select("id,name,color").order("position");
      if (error) throw error;
      return (data ?? []) as BoardRow[];
    },
  });

  const { data: columns = [] } = useQuery<ColumnRow[]>({
    queryKey: ["board_columns", "picker", user?.id],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_columns").select("id,board_id,position,is_done_column").order("position");
      if (error) throw error;
      return (data ?? []) as ColumnRow[];
    },
  });

  const { data: profiles = [] } = useProfiles();

  // Reset state on open
  useEffect(() => {
    if (!open) return;
    setQuery(""); setNewTitle(""); setTab("search");
    setBoardFilter(ALL); setAssigneeFilter(ALL);
  }, [open]);

  // Default board for "create" tab
  useEffect(() => {
    if (open && !newBoardId && boards[0]) setNewBoardId(boards[0].id);
  }, [open, boards, newBoardId]);

  // Cards query — combines text + board + assignee filters (RLS-enforced)
  const cardsQuery = useQuery<CardRow[]>({
    queryKey: ["cards", "picker", { q: query.trim(), boardFilter, assigneeFilter, uid: user?.id }],
    enabled: open && tab === "search",
    staleTime: 30 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("cards")
        .select("id,short_id,title,board_id,assignee_id,completed_at")
        .order("created_at", { ascending: false })
        .limit(30);
      const txt = query.trim();
      if (txt) q = q.or(`title.ilike.%${txt}%,short_id.ilike.%${txt}%`);
      if (boardFilter !== ALL) q = q.eq("board_id", boardFilter);
      if (assigneeFilter === NONE) q = q.is("assignee_id", null);
      else if (assigneeFilter !== ALL) q = q.eq("assignee_id", assigneeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CardRow[];
    },
  });

  const boardsById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);
  const profilesById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const filtersActive = boardFilter !== ALL || assigneeFilter !== ALL;

  const handleSelect = (c: CardRow) => {
    onInsert({ cardId: c.id, boardId: c.board_id, shortId: c.short_id, title: c.title });
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newBoardId) return;
    setCreating(true);
    const cols = columns
      .filter((c) => c.board_id === newBoardId && !c.is_done_column)
      .sort((a, b) => a.position - b.position);
    const firstCol = cols[0] ?? columns.find((c) => c.board_id === newBoardId);
    if (!firstCol) {
      toast.error("Esta esteira não tem colunas configuradas.");
      setCreating(false);
      return;
    }
    const { data, error } = await supabase
      .from("cards")
      .insert({ board_id: newBoardId, column_id: firstCol.id, title: newTitle.trim(), created_by: user?.id ?? null, position: 0 } as never)
      .select("id,short_id,title,board_id")
      .maybeSingle();
    setCreating(false);
    if (error || !data) { toast.error(error?.message ?? "Erro ao criar tarefa"); return; }
    const d = data as { id: string; short_id: string; title: string; board_id: string };
    onInsert({ cardId: d.id, boardId: d.board_id, shortId: d.short_id, title: d.title });
    onOpenChange(false);
    toast.success(`Tarefa ${d.short_id} criada`);
  };

  const results = cardsQuery.data ?? [];
  const loading = cardsQuery.isFetching;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Inserir tarefa</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "search" | "create")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search"><Search className="h-3.5 w-3.5 mr-1.5" /> Buscar existente</TabsTrigger>
            <TabsTrigger value="create"><Plus className="h-3.5 w-3.5 mr-1.5" /> Criar nova</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-2">
            <Input
              autoFocus
              placeholder="Buscar por título ou CARD-XXXX..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Select value={boardFilter} onValueChange={setBoardFilter}>
                <SelectTrigger className="h-8 text-xs w-auto min-w-[180px]">
                  <SelectValue placeholder="Filtrar por esteira" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as esteiras</SelectItem>
                  {boards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="h-8 text-xs w-auto min-w-[180px]">
                  <SelectValue placeholder="Filtrar por responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os responsáveis</SelectItem>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {firstName(p.full_name) ?? p.email ?? "Usuário"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {filtersActive && (
                <Button
                  size="sm" variant="ghost" className="h-8 px-2 text-xs"
                  onClick={() => { setBoardFilter(ALL); setAssigneeFilter(ALL); }}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Limpar
                </Button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto border rounded-md divide-y">
              {loading && <div className="p-3 text-xs text-muted-foreground">Buscando…</div>}
              {!loading && results.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">Nenhuma tarefa encontrada.</div>
              )}
              {!loading && results.map((c) => {
                const b = boardsById.get(c.board_id);
                const a = c.assignee_id ? profilesById.get(c.assignee_id) : null;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelect(c)}
                    className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2"
                  >
                    <Hash className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{c.short_id}</span>
                    <span className={"flex-1 text-sm truncate " + (c.completed_at ? "line-through text-muted-foreground" : "")}>
                      {c.title}
                    </span>
                    {b && (
                      <span
                        className="tint text-[10px] px-1.5 py-0.5 rounded-full shrink-0 bg-(--tint-pill) text-(--tint-ink)"
                        style={{ "--tint": b.color } as React.CSSProperties}
                        title={b.name}
                      >
                        {b.name}
                      </span>
                    )}
                    <Avatar className="h-5 w-5 shrink-0" title={a?.full_name ?? a?.email ?? "Sem responsável"}>
                      <AvatarFallback className={"text-[9px] " + (a ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                        {a ? initialsOf(a) : "—"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="create" className="space-y-3">
            <div>
              <Label className="text-xs">Esteira</Label>
              <Select value={newBoardId} onValueChange={setNewBoardId}>
                <SelectTrigger><SelectValue placeholder="Selecione uma esteira" /></SelectTrigger>
                <SelectContent>
                  {boards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: b.color }} />
                        {b.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Título</Label>
              <Input
                autoFocus
                placeholder="Título da nova tarefa"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!newTitle.trim() || !newBoardId || creating}>
                {creating ? "Criando…" : "Criar e inserir"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
