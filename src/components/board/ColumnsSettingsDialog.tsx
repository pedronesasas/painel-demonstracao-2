import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";


export type ColumnRow = {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
  is_done_column: boolean;
  kind_id: string | null;
};

type Kind = { id: string; label: string; is_done: boolean; sort: number };


const COLOR_PALETTE = [
  "#94a3b8", "#64748b", "#475569",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e", "#ef4444",
  "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#10b981", "#14b8a6", "#06b6d4",
];

export function ColumnsSettingsDialog({
  open, boardId, onOpenChange, onSaved,
}: {
  open: boolean;
  boardId: string;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}) {
  const [items, setItems] = useState<ColumnRow[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const defaultKindId = (ks: Kind[]) => ks.find((k) => k.label === "Pendente")?.id ?? ks[0]?.id ?? null;

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [colsRes, kindsRes] = await Promise.all([
        supabase
          .from("board_columns")
          .select("id,board_id,name,color,position,is_done_column,kind_id")
          .eq("board_id", boardId)
          .order("position"),
        supabase
          .from("board_column_kinds")
          .select("id,label,is_done,sort")
          .order("sort").order("label"),
      ]);
      if (colsRes.error) { toast.error(colsRes.error.message); return; }
      if (kindsRes.error) { toast.error(kindsRes.error.message); return; }
      const rows = (colsRes.data ?? []) as ColumnRow[];
      setItems(rows);
      setOriginalIds(rows.map((r) => r.id));
      setRemovedIds([]);
      setKinds((kindsRes.data ?? []) as Kind[]);
    })();
  }, [open, boardId]);

  const updateLocal = (id: string, patch: Partial<ColumnRow>) => {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setItems(arrayMove(items, oldIdx, newIdx));
  };

  const addNew = () => {
    const tempId = `new-${crypto.randomUUID()}`;
    const kId = defaultKindId(kinds);
    setItems((prev) => [
      ...prev,
      {
        id: tempId, board_id: boardId, name: "Nova coluna",
        color: COLOR_PALETTE[3], position: prev.length, is_done_column: false, kind_id: kId,
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    if (originalIds.includes(id)) setRemovedIds((prev) => [...prev, id]);
  };


  const save = async () => {
    setSaving(true);
    try {
      // Deletes
      if (removedIds.length) {
        const { error } = await supabase.from("board_columns").delete().in("id", removedIds);
        if (error) throw error;
      }
      // Inserts (new- prefix) and Updates (existing)
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.id.startsWith("new-")) {
          const { error } = await supabase.from("board_columns").insert({
            board_id: boardId,
            name: it.name.trim() || "Coluna",
            color: it.color,
            position: i,
            kind_id: it.kind_id,
          } as never);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("board_columns").update({
            name: it.name.trim() || "Coluna",
            color: it.color,
            position: i,
            kind_id: it.kind_id,
          } as never).eq("id", it.id);
          if (error) throw error;
        }
      }

      toast.success("Colunas atualizadas");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar colunas</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Arraste para reordenar, clique no círculo para mudar a cor. A cor é usada nas tarefas no calendário.
        </p>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((col) => (
                <SortableRow
                  key={col.id}
                  col={col}
                  kinds={kinds}
                  onChange={(patch) => updateLocal(col.id, patch)}
                  onRemove={() => removeItem(col.id)}
                />
              ))}

            </SortableContext>
          </DndContext>

          <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground" onClick={addNew}>
            <Plus className="h-4 w-4" /> Adicionar coluna
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableRow({
  col, kinds, onChange, onRemove,
}: {
  col: ColumnRow;
  kinds: Kind[];
  onChange: (patch: Partial<ColumnRow>) => void;
  onRemove: () => void;
}) {

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-2 py-1.5"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground touch-none p-1"
        aria-label="Reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-6 w-6 rounded-full border border-border/40 shrink-0 transition hover:scale-110"
            style={{ backgroundColor: col.color }}
            aria-label="Cor da coluna"
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-6 gap-1.5">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange({ color: c })}
                className={cn(
                  "h-7 w-7 rounded-full border-2 flex items-center justify-center transition",
                  col.color === c ? "border-foreground" : "border-transparent hover:border-border",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Cor ${c}`}
              >
                {/* Check sobre um disco escuro: legível em qualquer amostra, até no amarelo */}
                {col.color === c && (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-background/70">
                    <Check className="h-3 w-3 text-foreground" strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-2">
            <label className="text-xs text-muted-foreground">Personalizada:</label>
            <input
              type="color"
              value={col.color}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-7 w-10 rounded cursor-pointer bg-transparent"
            />
            <span className="text-xs font-mono text-muted-foreground">{col.color}</span>
          </div>
        </PopoverContent>
      </Popover>

      <Input
        value={col.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="h-8 flex-1"
        placeholder="Nome da coluna"
      />

      <Select value={col.kind_id ?? ""} onValueChange={(v) => onChange({ kind_id: v })}>
        <SelectTrigger className="h-8 w-[170px] text-xs">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          {kinds.map((k) => (
            <SelectItem key={k.id} value={k.id} className="text-xs">{k.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>


      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label="Remover"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
