import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useSquads, type Squad } from "@/hooks/use-squads";

type Profile = { id: string; full_name: string | null; email: string | null };

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#eab308", "#06b6d4", "#ef4444"];

export function SquadsSettings() {
  const { isAdmin, hasCapability } = useAuth();
  const canManage = isAdmin || hasCapability("manage_squads");
  const { squads, members, loading, reload } = useSquads();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<Squad | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id,full_name,email").eq("status", "approved").order("full_name")
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, []);

  const membersBySquad = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of members) {
      if (!m.has(r.squad_id)) m.set(r.squad_id, []);
      m.get(r.squad_id)!.push(r.user_id);
    }
    return m;
  }, [members]);

  const remove = async (s: Squad) => {
    if (!confirm(`Excluir o squad "${s.name}"? Cards atribuídos a ele ficam sem responsável.`)) return;
    const { error } = await supabase.from("squads").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Squad removido");
    reload();
  };

  if (!canManage) return <div className="text-sm text-muted-foreground">Você precisa da permissão "Gerenciar squads" para acessar essa seção.</div>;
  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Squads</h2>
          <p className="text-sm text-muted-foreground">Grupos de pessoas que podem ser responsáveis por um card em conjunto.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo squad
        </Button>
      </div>

      <div className="space-y-2">
        {squads.length === 0 && <div className="text-sm text-muted-foreground">Nenhum squad criado ainda.</div>}
        {squads.map((s) => {
          const memberIds = membersBySquad.get(s.id) ?? [];
          return (
            <div key={s.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
              {/* Pílula tingida, como o squad na Home: texto branco sobre a cor sólida não tem contraste */}
              <div className="tint h-8 w-8 rounded-full grid place-items-center bg-(--tint-pill) text-(--tint-ink) text-xs font-bold shrink-0"
                style={{ "--tint": s.color } as React.CSSProperties}>
                {s.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> {memberIds.length} membro(s)
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(s)} aria-label="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(s)} aria-label="Excluir">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>

      <SquadEditor
        open={creating}
        onOpenChange={setCreating}
        squad={null}
        profiles={profiles}
        currentMembers={[]}
        onSaved={reload}
      />
      <SquadEditor
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        squad={editing}
        profiles={profiles}
        currentMembers={editing ? (membersBySquad.get(editing.id) ?? []) : []}
        onSaved={reload}
      />
    </div>
  );
}

function SquadEditor({
  open, onOpenChange, squad, profiles, currentMembers, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  squad: Squad | null;
  profiles: Profile[];
  currentMembers: string[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(squad?.name ?? "");
    setColor(squad?.color ?? COLORS[0]);
    setMemberIds(currentMembers);
  }, [open, squad, currentMembers]);

  const toggle = (id: string) => {
    setMemberIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    let squadId = squad?.id;
    if (squadId) {
      const { error } = await supabase.from("squads").update({ name: name.trim(), color } as never).eq("id", squadId);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("squads").insert({ name: name.trim(), color } as never).select("id").single();
      if (error || !data) { toast.error(error?.message ?? "Erro ao criar"); setSaving(false); return; }
      squadId = (data as { id: string }).id;
    }
    // Sync members
    const toAdd = memberIds.filter((id) => !currentMembers.includes(id));
    const toRemove = currentMembers.filter((id) => !memberIds.includes(id));
    if (toAdd.length) {
      const { error } = await supabase.from("squad_members")
        .insert(toAdd.map((user_id) => ({ squad_id: squadId!, user_id })) as never);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    if (toRemove.length) {
      const { error } = await supabase.from("squad_members")
        .delete().eq("squad_id", squadId!).in("user_id", toRemove);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    toast.success(squad ? "Squad atualizado" : "Squad criado");
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{squad ? "Editar squad" : "Novo squad"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ring-2 transition ${color === c ? "ring-primary" : "ring-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div>
            <Label>Membros</Label>
            <div className="mt-1 max-h-64 overflow-y-auto space-y-1 rounded-md border p-2">
              {profiles.map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent cursor-pointer">
                  <Checkbox checked={memberIds.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                  <span className="text-sm">{p.full_name ?? p.email ?? "—"}</span>
                </label>
              ))}
              {profiles.length === 0 && <div className="text-xs text-muted-foreground p-2">Sem usuários aprovados.</div>}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{memberIds.length} selecionado(s)</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{squad ? "Salvar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
