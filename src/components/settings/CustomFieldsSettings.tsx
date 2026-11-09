import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown, X, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type Field = {
  id: string;
  name: string;
  type: "text" | "link" | "select" | "product";
  options: { values?: string[] } | null;
  board_id: string | null;
  position: number | null;
};
type Board = { id: string; name: string };

export function CustomFieldsSettings() {
  const { isAdmin } = useAuth();
  const [fields, setFields] = useState<Field[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<Field["type"]>("text");
  const [boardId, setBoardId] = useState<string>("global");
  const [optionsRaw, setOptionsRaw] = useState("");

  const load = async () => {
    const [f, b] = await Promise.all([
      supabase.from("custom_fields").select("*").order("position"),
      supabase.from("boards").select("id,name").order("name"),
    ]);
    setFields((f.data ?? []) as Field[]);
    setBoards((b.data ?? []) as Board[]);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    const options = type === "select"
      ? { values: optionsRaw.split(",").map((s) => s.trim()).filter(Boolean) }
      : null;
    const maxPos = fields.reduce((m, f) => Math.max(m, f.position ?? 0), 0);
    const { error } = await supabase.from("custom_fields").insert({
      name, type, options, board_id: boardId === "global" ? null : boardId, position: maxPos + 10,
    } as never);
    if (error) return toast.error(error.message);
    setName(""); setOptionsRaw(""); load();
  };
  const remove = async (id: string) => {
    if (!window.confirm("Excluir campo?")) return;
    const { error } = await supabase.from("custom_fields").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const move = async (id: string, dir: -1 | 1) => {
    const sorted = [...fields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const idx = sorted.findIndex((f) => f.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swap];
    const posA = a.position ?? idx * 10;
    const posB = b.position ?? swap * 10;
    await supabase.from("custom_fields").update({ position: posB } as never).eq("id", a.id);
    await supabase.from("custom_fields").update({ position: posA } as never).eq("id", b.id);
    load();
  };

  if (!isAdmin) return <div className="text-sm text-muted-foreground">Apenas admins podem gerenciar campos personalizados.</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Novo campo</h2>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as Field["type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="link">Link</SelectItem>
                <SelectItem value="select">Menu suspenso</SelectItem>
                <SelectItem value="product">Produto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Escopo</Label>
          <Select value={boardId} onValueChange={setBoardId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global (todas as esteiras)</SelectItem>
              {boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {type === "select" && (
          <div><Label>Opções (separadas por vírgula)</Label><Input value={optionsRaw} onChange={(e) => setOptionsRaw(e.target.value)} placeholder="Opção 1, Opção 2" /></div>
        )}
        <Button onClick={create}><Plus className="h-4 w-4 mr-1" /> Criar</Button>
      </div>

      <div className="space-y-2">
        {fields.map((f, i) => (
          <FieldRow
            key={f.id}
            field={f}
            boardName={f.board_id ? boards.find((b) => b.id === f.board_id)?.name ?? "?" : "Global"}
            canMoveUp={i > 0}
            canMoveDown={i < fields.length - 1}
            onMove={move}
            onRemove={remove}
            onReload={load}
          />
        ))}
        {fields.length === 0 && <div className="text-sm text-muted-foreground">Nenhum campo.</div>}
      </div>
    </div>
  );
}

function FieldRow({
  field, boardName, canMoveUp, canMoveDown, onMove, onRemove, onReload,
}: {
  field: Field;
  boardName: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(field.name);
  const [options, setOptions] = useState<string[]>(field.options?.values ?? []);
  const [newOpt, setNewOpt] = useState("");

  const save = async () => {
    if (!name.trim()) { toast.error("Nome obrigatório"); return; }
    const patch: Partial<Field> = { name: name.trim() };
    if (field.type === "select") {
      patch.options = { values: options.map((s) => s.trim()).filter(Boolean) };
    }
    const { error } = await supabase.from("custom_fields").update(patch as never).eq("id", field.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Campo atualizado");
    setEditing(false);
    onReload();
  };

  const addOption = () => {
    const v = newOpt.trim();
    if (!v || options.includes(v)) return;
    setOptions([...options, v]);
    setNewOpt("");
  };
  const renameOption = (idx: number, v: string) => {
    setOptions(options.map((o, i) => (i === idx ? v : o)));
  };
  const removeOption = (idx: number) => {
    setOptions(options.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <Button size="icon" variant="ghost" className="h-5 w-5" disabled={!canMoveUp}
            onClick={() => onMove(field.id, -1)} aria-label="Mover para cima">
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-5 w-5" disabled={!canMoveDown}
            onClick={() => onMove(field.id, 1)} aria-label="Mover para baixo">
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>
        {editing ? (
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1" autoFocus />
        ) : (
          <span className="font-medium flex-1">{field.name}</span>
        )}
        <span className="text-xs text-muted-foreground">{field.type}</span>
        <span className="text-xs text-muted-foreground">{boardName}</span>
        {editing ? (
          <>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} aria-label="Salvar">
              <Check className="h-4 w-4 text-primary" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7"
              onClick={() => { setName(field.name); setOptions(field.options?.values ?? []); setEditing(false); }}
              aria-label="Cancelar">
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)} aria-label="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemove(field.id)} aria-label="Excluir">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        )}
      </div>

      {editing && field.type === "select" && (
        <div className="mt-3 space-y-2 pl-8">
          <Label className="text-xs">Opções</Label>
          <div className="space-y-1">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Input
                  value={opt}
                  onChange={(e) => renameOption(idx, e.target.value)}
                  className="h-7 text-xs"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => removeOption(idx)} aria-label="Remover opção">
                  <X className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
            {options.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma opção.</div>}
          </div>
          <div className="flex items-center gap-1">
            <Input
              value={newOpt}
              onChange={(e) => setNewOpt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
              placeholder="Nova opção"
              className="h-7 text-xs"
            />
            <Button size="sm" variant="outline" className="h-7" onClick={addOption}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Renomear uma opção não altera valores já registrados nos cards. Considere manter o texto compatível.
          </p>
        </div>
      )}
    </div>
  );
}
