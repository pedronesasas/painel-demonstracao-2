import { useState } from "react";
import { ChevronDown, ChevronRight, Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TEST_STATUS_LABEL, type FunnelTest, type TestStatus } from "./funnel-data";

const STATUS_CLASS: Record<TestStatus, string> = {
  running: "bg-warning/15 text-warning",
  paused: "bg-muted text-muted-foreground",
  finished: "bg-success/15 text-success",
};

/**
 * Testes de um funil (língua + front/back). Os campos de texto são texto puro.
 * Testes antigos da oferta, ainda sem funil, aparecem embaixo para serem ligados.
 */
export function FunnelTests({
  productId, funnelId, tests, canEdit, userId, onChanged,
}: {
  productId: string;
  funnelId: string;
  tests: FunnelTest[];
  canEdit: boolean;
  userId: string | null;
  onChanged: () => void;
}) {
  const mine = tests.filter((t) => t.funnel_id === funnelId);
  const unlinked = tests.filter((t) => t.product_id === productId && !t.funnel_id);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const create = async () => {
    if (!newName.trim()) { toast.error("Dê um nome para o teste."); return; }
    const { error } = await supabase.from("offer_tests").insert({
      product_id: productId, funnel_id: funnelId, name: newName.trim(), status: "running",
      start_date: new Date().toISOString().slice(0, 10), created_by: userId,
    } as never);
    if (error) { toast.error(error.message); return; }
    setNewName(""); setCreating(false); onChanged();
  };

  const link = async (t: FunnelTest) => {
    const { error } = await supabase.from("offer_tests").update({ funnel_id: funnelId } as never).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Teste ligado a este funil");
    onChanged();
  };

  return (
    <div className="space-y-2">
      {mine.length === 0 && !creating && (
        <div className="text-sm text-muted-foreground">Nenhum teste neste funil.</div>
      )}
      {mine.map((t) => <TestRow key={t.id} test={t} canEdit={canEdit} onChanged={onChanged} />)}

      {canEdit && (creating ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
            placeholder="Nome do teste (ex.: Up 1 a R$ 297)" />
          <Button size="sm" onClick={create}>Adicionar</Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); }}>Cancelar</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo teste</Button>
      ))}

      {unlinked.length > 0 && (
        <div className="mt-4 space-y-2 rounded-lg border border-dashed p-3">
          <div className="text-xs text-muted-foreground">
            Testes desta oferta ainda sem mercado e front/back definidos{canEdit ? ". Ligue cada um ao funil certo." : "."}
          </div>
          {unlinked.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", STATUS_CLASS[t.status])}>{TEST_STATUS_LABEL[t.status]}</span>
              <span className="text-sm flex-1 min-w-0 truncate">{t.name}</span>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => link(t)}>
                  <Link2 className="h-3.5 w-3.5" /> Ligar a este funil
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestRow({ test: t, canEdit, onChanged }: { test: FunnelTest; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);

  const patch = async (data: Partial<FunnelTest>) => {
    const { error } = await supabase.from("offer_tests").update(data as never).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  };

  const area = (label: string, k: "description" | "hypothesis" | "result" | "conclusion") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Textarea rows={2} defaultValue={t[k] ?? ""} disabled={!canEdit}
        onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== t[k]) patch({ [k]: v }); }} />
    </div>
  );

  return (
    <div className="rounded-lg border">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/30">
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", STATUS_CLASS[t.status])}>{TEST_STATUS_LABEL[t.status]}</span>
        <span className="flex-1 min-w-0 truncate text-sm font-medium">{t.name}</span>
        {(t.start_date || t.end_date) && (
          <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">
            {fmt(t.start_date)}{t.end_date ? ` – ${fmt(t.end_date)}` : ""}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t p-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Nome</Label>
              <Input defaultValue={t.name} disabled={!canEdit}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) patch({ name: v }); }} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={t.status} onValueChange={(v) => patch({ status: v as TestStatus })} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="running">Rodando</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                  <SelectItem value="finished">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:col-span-1 sm:grid-cols-1">
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input type="date" defaultValue={t.start_date ?? ""} disabled={!canEdit}
                  onBlur={(e) => { const v = e.target.value || null; if (v !== t.start_date) patch({ start_date: v }); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fim</Label>
                <Input type="date" defaultValue={t.end_date ?? ""} disabled={!canEdit}
                  onBlur={(e) => { const v = e.target.value || null; if (v !== t.end_date) patch({ end_date: v }); }} />
              </div>
            </div>
          </div>
          {area("Descrição", "description")}
          {area("Hipótese", "hypothesis")}
          {area("Resultado", "result")}
          {area("Conclusão", "conclusion")}
        </div>
      )}
    </div>
  );
}

function fmt(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}
