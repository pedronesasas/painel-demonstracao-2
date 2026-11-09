import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2, Globe } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Language } from "@/hooks/use-languages";
import { REGIONS, REGION_LABEL } from "@/components/funil/regions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function LanguagesDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Language | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: languages = [], isLoading } = useQuery({
    queryKey: ["languages-all"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("languages").select("*").order("position").order("name");
      if (error) throw error;
      return data as Language[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["languages-all"] });
    qc.invalidateQueries({ queryKey: ["languages"] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("languages").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Mercado removido"); refresh(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Gestão de Mercados
          </DialogTitle>
        </DialogHeader>

        {showForm || editing ? (
          <LanguageForm
            initial={editing}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            onSaved={() => { setShowForm(false); setEditing(null); refresh(); }}
          />
        ) : (
          <>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> Novo mercado
              </Button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : languages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum mercado cadastrado.
                </p>
              ) : languages.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <span className="text-xl">{l.flag || "🌐"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.code} • {l.currency}
                    </div>
                  </div>
                  {!l.active && <Badge variant="secondary">Arquivado</Badge>}
                  <Button variant="ghost" size="icon" onClick={() => setEditing(l)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <ConfirmDialog
                    trigger={<Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>}
                    title="Remover mercado?"
                    description={`O mercado "${l.name}" será removido. Localizações de produtos vinculadas a ele perderão a referência.`}
                    confirmLabel="Remover"
                    destructive
                    onConfirm={() => handleDelete(l.id)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LanguageForm({
  initial, onSaved, onCancel,
}: { initial: Language | null; onSaved: () => void; onCancel: () => void }) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "BRL");
  const [flag, setFlag] = useState(initial?.flag ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [position, setPosition] = useState(initial?.position ?? 0);
  const [region, setRegion] = useState<string>(initial?.region ?? "none");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      code: code.trim(), name: name.trim(),
      currency: currency.trim().toUpperCase(),
      flag: flag.trim() || null, active, position,
      region: region === "none" ? null : region,
    };
    // types.ts ainda não tem `region` em languages — cast como no resto do projeto
    const { error } = initial
      ? await supabase.from("languages").update(payload as never).eq("id", initial.id)
      : await supabase.from("languages").insert(payload as never);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success(initial ? "Mercado atualizado" : "Mercado criado"); onSaved(); }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Código (ISO)</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="pt-BR" required />
        </div>
        <div className="space-y-2">
          <Label>Moeda</Label>
          <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="BRL" required maxLength={6} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Português (Brasil)" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Bandeira (emoji)</Label>
          <Input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="🇧🇷" />
        </div>
        <div className="space-y-2">
          <Label>Ordem</Label>
          <Input type="number" value={position} onChange={(e) => setPosition(Number(e.target.value))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Região no Funis</Label>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger><SelectValue placeholder="Sem região" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem região</SelectItem>
            {REGIONS.map((r) => (
              <SelectItem key={r} value={r}>{REGION_LABEL[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Liga este mercado a uma região dos funis — é o que permite descobrir a
          plataforma de vendas de cada estrutura automaticamente.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={active} onCheckedChange={setActive} id="lang-active" />
        <Label htmlFor="lang-active" className="cursor-pointer">Ativo</Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={submitting || !code.trim() || !name.trim()}>
          {submitting ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
