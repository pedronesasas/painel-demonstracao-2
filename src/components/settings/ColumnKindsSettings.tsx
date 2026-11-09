import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Kind = {
  id: string;
  label: string;
  is_done: boolean;
  is_paused: boolean;
  is_system: boolean;
  sort: number;
};

export function ColumnKindsSettings() {
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [k, c] = await Promise.all([
      supabase.from("board_column_kinds").select("*").order("sort").order("label"),
      supabase.from("board_columns").select("kind_id").range(0, 9999),
    ]);
    setKinds((k.data ?? []) as Kind[]);
    const m = new Map<string, number>();
    ((c.data ?? []) as { kind_id: string | null }[]).forEach((r) => {
      if (r.kind_id) m.set(r.kind_id, (m.get(r.kind_id) ?? 0) + 1);
    });
    setUsage(m);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addKind = async () => {
    const label = prompt("Nome do novo tipo:")?.trim();
    if (!label) return;
    const maxSort = kinds.reduce((m, k) => Math.max(m, k.sort), 0);
    const { error } = await supabase.from("board_column_kinds").insert({
      label, is_done: false, is_system: false, sort: maxSort + 10,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Tipo criado");
    load();
  };

  const updateKind = async (id: string, patch: Partial<Kind>) => {
    const { error } = await supabase.from("board_column_kinds").update(patch as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const removeKind = async (k: Kind) => {
    const count = usage.get(k.id) ?? 0;
    if (count > 0) {
      toast.error("Tipo em uso", { description: `${count} coluna(s) usam este tipo.` });
      return;
    }
    if (!confirm(`Remover o tipo "${k.label}"?`)) return;
    const { error } = await supabase.from("board_column_kinds").delete().eq("id", k.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Tipo removido");
    load();
  };

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tipos de coluna</h2>
          <p className="text-sm text-muted-foreground">
            Categorias usadas nas esteiras (Kanban). O tipo "Concluído" é fixo e não pode ser removido.
          </p>
        </div>
        <Button size="sm" onClick={addKind}><Plus className="h-4 w-4 mr-1" /> Adicionar tipo</Button>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="text-left p-2 px-4">Nome</th>
              <th className="text-left p-2 px-4 w-40">Conclui o card?</th>
              <th className="text-left p-2 px-4 w-32">Pausada?</th>
              <th className="text-right p-2 px-4 w-24">Em uso</th>
              <th className="p-2 px-4 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => {
              const count = usage.get(k.id) ?? 0;
              const isConcluido = k.label === "Concluído";
              const isPausadaSystem = k.label === "Pausada";
              return (
                <tr key={k.id} className="border-t">
                  <td className="p-2 px-4">
                    <Input
                      defaultValue={k.label}
                      disabled={isConcluido || isPausadaSystem}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== k.label) updateKind(k.id, { label: v });
                      }}
                      className="h-8"
                    />
                  </td>
                  <td className="p-2 px-4">
                    <Switch
                      checked={k.is_done}
                      disabled={k.is_system || k.is_paused}
                      onCheckedChange={(v) => updateKind(k.id, { is_done: v })}
                    />
                    {k.is_system && k.is_done && <span className="text-[10px] text-muted-foreground ml-2">sistema</span>}
                  </td>
                  <td className="p-2 px-4">
                    <Switch
                      checked={k.is_paused}
                      disabled={isPausadaSystem || k.is_done}
                      onCheckedChange={(v) => updateKind(k.id, { is_paused: v })}
                    />
                    {isPausadaSystem && <span className="text-[10px] text-muted-foreground ml-2">sistema</span>}
                  </td>
                  <td className="p-2 px-4 text-right text-muted-foreground">{count}</td>
                  <td className="p-2 px-4 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={k.is_system || count > 0}
                      onClick={() => removeKind(k)}
                      aria-label="Remover"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
