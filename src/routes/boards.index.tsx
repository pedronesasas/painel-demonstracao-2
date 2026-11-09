import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, KanbanSquare, Trash2, Shield, GripVertical, FileDown } from "lucide-react";
import { toast } from "sonner";
import { exportActiveTasksAsDocx } from "@/lib/exportActiveTasks";

import { BoardPermissionsDialog } from "@/components/board/BoardPermissionsDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState, CardGridSkeleton } from "@/components/ui/loading-state";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/boards/")({
  head: () => ({
    meta: [
      { title: "Esteiras — NEXUS" },
      { name: "description", content: "Gerencie suas esteiras Kanban no NEXUS." },
      { property: "og:title", content: "Esteiras — NEXUS" },
      { property: "og:description", content: "Gerencie suas esteiras Kanban no NEXUS." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="boards">
      <AppLayout><BoardsPage /></AppLayout>
    </RequireTabAccess>
  ),
});

type Board = { id: string; name: string; description: string | null; color: string; position: number; created_at: string };
type Counts = Record<string, { columns: number; cards: number }>;

function BoardsPage() {
  const { isAdmin, hasCapability } = useAuth();
  const canCreate = isAdmin || hasCapability("create_board");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [nameError, setNameError] = useState<string | null>(null);
  const [permsBoard, setPermsBoard] = useState<Board | null>(null);
  const [exporting, setExporting] = useState(false);

  const exportActive = async () => {
    setExporting(true);
    try {
      const n = await exportActiveTasksAsDocx();
      toast.success(`${n} tarefas ativas exportadas`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  };

  const { data: boards = [], isLoading: loading } = useQuery({
    queryKey: ["boards-list"],
    queryFn: async () => {
      const { data } = await supabase.from("boards").select("id,name,description,color,position,created_at").order("position").range(0, 499);
      return (data ?? []) as Board[];
    },
    staleTime: 30_000,
  });

  const { data: counts = {} } = useQuery<Counts>({
    queryKey: ["boards-counts"],
    queryFn: async () => {
      const [cols, cards] = await Promise.all([
        supabase.from("board_columns").select("board_id"),
        supabase.from("cards").select("board_id"),
      ]);
      const out: Counts = {};
      ((cols.data ?? []) as { board_id: string }[]).forEach((r) => {
        (out[r.board_id] ??= { columns: 0, cards: 0 }).columns++;
      });
      ((cards.data ?? []) as { board_id: string }[]).forEach((r) => {
        (out[r.board_id] ??= { columns: 0, cards: 0 }).cards++;
      });
      return out;
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["boards-list"] });
    qc.invalidateQueries({ queryKey: ["boards-counts"] });
  };

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) { setNameError("Use ao menos 2 caracteres."); return; }
    const { data: u } = await supabase.auth.getUser();
    const nextPos = (boards.reduce((m, b) => Math.max(m, b.position ?? 0), -1)) + 1;
    const { error } = await supabase.from("boards").insert({
      name: trimmed, description: desc || null, color, position: nextPos, created_by: u.user?.id,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Esteira criada");
    setOpen(false); setName(""); setDesc(""); setColor("#6366f1"); setNameError(null);
    invalidate();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("boards").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Esteira excluída"); invalidate();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const orderedIds = useMemo(() => boards.map((b) => b.id), [boards]);

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedIds.indexOf(String(active.id));
    const newIdx = orderedIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(boards, oldIdx, newIdx);
    // Optimistic update
    qc.setQueryData<Board[]>(["boards-list"], reordered.map((b, i) => ({ ...b, position: i })));
    const updates = reordered.map((b, i) => ({ id: b.id, position: i }));
    const results = await Promise.all(updates.map((u) =>
      supabase.from("boards").update({ position: u.position } as never).eq("id", u.id)
    ));
    const errored = results.find((r) => r.error);
    if (errored?.error) { toast.error(errored.error.message); invalidate(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Esteiras"
        description={<>
            Organize tarefas em quadros kanban.
            {isAdmin && boards.length > 1 && " Arraste para reordenar."}
        </>}
        actions={<>
        <Button variant="outline" onClick={exportActive} disabled={exporting}>
          <FileDown className="h-4 w-4" /> {exporting ? "Gerando..." : "Exportar tarefas ativas"}
        </Button>
        {canCreate && (

          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setNameError(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Nova esteira</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova esteira</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
                    aria-invalid={!!nameError}
                  />
                  {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
                </div>
                <div><Label>Descrição</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
                <div><Label>Cor</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20" /></div>
              </div>
              <DialogFooter><Button onClick={create}>Criar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        </>}
      />


      {loading ? (
        <CardGridSkeleton count={6} />
      ) : boards.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="Nenhuma esteira ainda"
          description={canCreate ? "Crie sua primeira esteira para começar a organizar tarefas." : "Peça a um administrador para criar uma esteira."}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {boards.map((b) => (
                <BoardCard
                  key={b.id}
                  board={b}
                  counts={counts[b.id]}
                  isAdmin={isAdmin}
                  onOpenPerms={() => setPermsBoard(b)}
                  onRemove={() => remove(b.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {permsBoard && (
        <BoardPermissionsDialog
          boardId={permsBoard.id}
          boardName={permsBoard.name}
          open={!!permsBoard}
          onOpenChange={(o) => !o && setPermsBoard(null)}
        />
      )}
    </div>
  );
}

function BoardCard({
  board: b, counts, isAdmin, onOpenPerms, onRemove,
}: {
  board: Board;
  counts: { columns: number; cards: number } | undefined;
  isAdmin: boolean;
  onOpenPerms: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id, disabled: !isAdmin });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const cardsCount = counts?.cards ?? 0;
  const colsCount = counts?.columns ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-xl border bg-card p-5 shadow-card hover:border-border-strong hover:bg-card-hover transition-colors"
    >
      <Link to="/boards/$boardId" params={{ boardId: b.id }} className="block min-w-0">
        {/* Mesmo ícone tingido do cabeçalho do quadro */}
        <div className="tint mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-(--tint-pill) text-(--tint-ink)" style={{ "--tint": b.color } as React.CSSProperties}>
          <KanbanSquare className="h-5 w-5" />
        </div>
        <div className="font-semibold truncate">{b.name}</div>
        {b.description && <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{b.description}</div>}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-foreground/70 tabular-nums">
            {cardsCount} {cardsCount === 1 ? "card" : "cards"}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-foreground/70 tabular-nums">
            {colsCount} {colsCount === 1 ? "coluna" : "colunas"}
          </span>
        </div>
      </Link>
      {isAdmin && (
        <>
          <button
            {...attributes}
            {...listeners}
            className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded"
            aria-label={`Reordenar ${b.name}`}
            title="Arrastar para reordenar"
            onClick={(e) => e.preventDefault()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <Button size="icon" variant="ghost" onClick={onOpenPerms} aria-label={`Permissões de ${b.name}`} title="Permissões">
              <Shield className="h-4 w-4" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button size="icon" variant="ghost" aria-label={`Excluir esteira ${b.name}`} title="Excluir">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              }
              title="Excluir esteira?"
              description={
                cardsCount > 0 || colsCount > 0
                  ? `A esteira "${b.name}" tem ${colsCount} ${colsCount === 1 ? "coluna" : "colunas"} e ${cardsCount} ${cardsCount === 1 ? "card" : "cards"}. Tudo será removido permanentemente. Esta ação não pode ser desfeita.`
                  : `A esteira "${b.name}" será removida permanentemente. Esta ação não pode ser desfeita.`
              }
              confirmLabel="Excluir"
              destructive
              onConfirm={onRemove}
            />
          </div>
        </>
      )}
    </div>
  );
}
