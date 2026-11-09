import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type Tag = { id: string; name: string; color: string };

export function TagsSettings() {
  const { isAdmin, hasCapability } = useAuth();
  const canManage = isAdmin || hasCapability("manage_tags");
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  const load = async () => {
    const { data } = await supabase.from("tags").select("*").order("name");
    setTags((data ?? []) as Tag[]);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("tags").insert({ name, color } as never);
    if (error) return toast.error(error.message);
    setName(""); load();
  };
  const remove = async (id: string) => {
    if (!window.confirm("Excluir tag?")) return;
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="font-semibold">Etiquetas</h2>
      {canManage && (
        <div className="flex gap-2">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16" />
          <Button onClick={create}><Plus className="h-4 w-4" /></Button>
        </div>
      )}
      <div className="space-y-1">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded border p-2">
            <span className="tint rounded-full bg-(--tint-pill) px-2 py-0.5 text-sm text-(--tint-ink)" style={{ "--tint": t.color } as React.CSSProperties}>{t.name}</span>
            <span className="flex-1" />
            {canManage && <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
          </div>
        ))}
        {tags.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma tag.</div>}
      </div>
    </div>
  );
}
