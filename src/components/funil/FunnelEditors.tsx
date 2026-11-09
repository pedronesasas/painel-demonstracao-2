import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DEFAULT_STEPS, STEP_KIND_LABEL, stepIdLabels, vslTypeForStep,
  type Funnel, type FunnelStep, type FunnelVsl, type StepKind,
} from "./funnel-data";

const NONE = "__nenhum__";

const toNum = (v: string): number | null => {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const toInt = (v: string): number | null => {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
};
const txt = (v: string): string | null => (v.trim() ? v.trim() : null);

const PLATFORM_NAME: Record<string, string> = { plataforma_a: "Plataforma A", plataforma_b: "Plataforma B" };

/**
 * Formulário de uma etapa. Só o que é da etapa fica aqui (página, botão, oferta na
 * plataforma, preço da oferta). Pitch e player vêm da VSL escolhida; o preço da
 * entrada vem de Produtos quando fica vazio.
 */
export function StepDialog({
  step, steps, platform, funnel, vsls, productPrice, onClose, onSaved,
}: {
  step: FunnelStep;
  steps: FunnelStep[];
  platform: string | null;
  funnel: Funnel;
  vsls: FunnelVsl[];
  productPrice: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(() => ({
    label: step.label,
    page_url: step.page_url ?? "",
    product_name: step.product_name ?? "",
    product_external_id: step.product_external_id ?? "",
    offer_name: step.offer_name ?? "",
    offer_external_id: step.offer_external_id ?? "",
    checkout_url: step.checkout_url ?? "",
    price: step.price != null ? String(step.price) : "",
    currency: step.currency ?? "",
    vsl_id: step.vsl_id ?? NONE,
    button_delay_seconds: step.button_delay_seconds != null ? String(step.button_delay_seconds) : "",
    next_on_buy: step.next_on_buy ?? NONE,
    next_on_decline: step.next_on_decline ?? NONE,
    notes: step.notes ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const isEnd = step.kind === "entregavel";
  const isEntry = step.kind === "entrada";
  const others = steps.filter((s) => s.id !== step.id);
  const ids = stepIdLabels(platform);

  // VSLs deste mercado e deste front/back; as do tipo da etapa e as que estão no ar primeiro
  const wanted = vslTypeForStep(step.key, funnel.stage);
  const vslOptions = vsls
    .filter((v) => v.language_id === funnel.language_id && v.funnel_stage === funnel.stage && !v.parent_id)
    .sort((a, b) =>
      Number(b.type === wanted) - Number(a.type === wanted)
      || Number(b.is_live) - Number(a.is_live)
      || a.name.localeCompare(b.name));
  const chosenVsl = vsls.find((v) => v.id === f.vsl_id) ?? null;
  const pitch = chosenVsl?.pitch_time_seconds ?? null;

  const save = async () => {
    if (!f.label.trim()) { toast.error("Dê um nome para a etapa."); return; }
    setSaving(true);
    const patch = {
      label: f.label.trim(),
      page_url: txt(f.page_url),
      product_name: txt(f.product_name),
      product_external_id: txt(f.product_external_id),
      offer_name: txt(f.offer_name),
      offer_external_id: txt(f.offer_external_id),
      checkout_url: txt(f.checkout_url),
      price: toNum(f.price),
      currency: txt(f.currency)?.toUpperCase() ?? null,
      vsl_id: f.vsl_id === NONE ? null : f.vsl_id,
      button_delay_seconds: toInt(f.button_delay_seconds),
      next_on_buy: f.next_on_buy === NONE ? null : f.next_on_buy,
      next_on_decline: f.next_on_decline === NONE ? null : f.next_on_decline,
      notes: txt(f.notes),
    };
    const { error } = await supabase.from("funnel_steps" as never).update(patch as never).eq("id" as never, step.id as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Etapa salva");
    onSaved();
    onClose();
  };

  const field = (label: string, k: keyof typeof f, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={f[k]} onChange={set(k)} placeholder={placeholder} />
    </div>
  );

  const destSelect = (label: string, k: "next_on_buy" | "next_on_decline") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={f[k]} onValueChange={(v) => setF((p) => ({ ...p, [k]: v }))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Padrão do funil</SelectItem>
          {others.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar etapa: {step.label}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Nome da etapa", "label")}
          {field("Página", "page_url", "https://exemplo.com/…")}
          {!isEnd && (
            <>
              {field(`Produto na ${platform ? PLATFORM_NAME[platform] ?? platform : "plataforma"}`, "product_name", "Acelerador Angelical [Back]")}
              {field(ids.product, "product_external_id")}
              {field("Oferta", "offer_name", "PR1 - UP 1 - BR - [BACK]")}
              {field(ids.offer, "offer_external_id")}
              {field("Link do checkout", "checkout_url", ids.checkout)}
              <div className="grid grid-cols-[1fr_90px] gap-2">
                {field(isEntry ? "Preço (vazio = o de Produtos)" : "Preço da oferta", "price", isEntry && productPrice ? productPrice : "297")}
                {field("Moeda", "currency", isEntry ? "de Produtos" : "BRL")}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">VSL da etapa (Inventário de VSLs)</Label>
                <Select value={f.vsl_id} onValueChange={(v) => setF((p) => ({ ...p, vsl_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem vídeo ou não informado</SelectItem>
                    {vslOptions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.is_live ? "● " : ""}{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {chosenVsl
                    ? `Pitch ${pitch ?? "—"} s · player ${chosenVsl.vturb_player_id ?? "não cadastrado"}. Pitch e player se editam no Inventário de VSLs.`
                    : vslOptions.length === 0
                      ? "Nenhuma VSL deste produto, mercado e front/back no Inventário de VSLs."
                      : "● = marcada como no ar no inventário."}
                </p>
              </div>
              {field("Botão aparece (s)", "button_delay_seconds", pitch != null ? String(pitch - 10) : "221")}
              <div />
              {destSelect("Se comprar, vai para", "next_on_buy")}
              {destSelect("Se recusar, vai para", "next_on_decline")}
            </>
          )}
        </div>
        {!isEnd && (
          <p className="text-xs text-muted-foreground">
            Regra do botão: aparece 10 s antes do pitch{pitch != null ? ` (aqui, ${pitch - 10} s)` : ""}.
            O pitch é quando o vídeo chama para a compra.
          </p>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Observações</Label>
          <Textarea rows={3} value={f.notes} onChange={set("notes")} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lista das etapas: incluir, tirar, renomear e mudar a ordem. */
export function StepsEditor({
  funnelId, steps, userId, onClose, onSaved,
}: {
  funnelId: string;
  steps: FunnelStep[];
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [list, setList] = useState<FunnelStep[]>(() => [...steps].sort((a, b) => a.position - b.position));
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<StepKind>("extra");
  const [confirmDelete, setConfirmDelete] = useState<FunnelStep | null>(null);

  useEffect(() => { setList([...steps].sort((a, b) => a.position - b.position)); }, [steps]);

  const missingDefaults = DEFAULT_STEPS.filter((d) => !list.some((s) => s.key === d.key));

  const insert = async (rows: Array<Partial<FunnelStep>>) => {
    const payload = rows.map((r) => ({ ...r, funnel_id: funnelId, created_by: userId }));
    const { error } = await supabase.from("funnel_steps" as never).insert(payload as never);
    if (error) { toast.error(error.message); return; }
    onSaved();
  };

  const addDefaults = () => insert(missingDefaults.map((d) => ({ ...d })));

  const addCustom = async () => {
    const label = newLabel.trim();
    if (!label) { toast.error("Dê um nome para a etapa."); return; }
    const beforeEnd = list.filter((s) => s.kind !== "entregavel");
    const maxPos = beforeEnd.reduce((m, s) => Math.max(m, s.position), 0);
    await insert([{
      key: `custom_${Math.random().toString(36).slice(2, 8)}`,
      kind: newKind, label, position: Math.min(maxPos + 5, 89),
    }]);
    setNewLabel("");
  };

  const rename = async (s: FunnelStep, label: string) => {
    if (!label.trim() || label.trim() === s.label) return;
    const { error } = await supabase.from("funnel_steps" as never).update({ label: label.trim() } as never).eq("id" as never, s.id as never);
    if (error) { toast.error(error.message); return; }
    onSaved();
  };

  // Troca a posição com o vizinho
  const move = async (idx: number, dir: -1 | 1) => {
    const a = list[idx];
    const b = list[idx + dir];
    if (!a || !b) return;
    const pa = a.position === b.position ? b.position + dir : b.position;
    const pb = a.position;
    const r1 = await supabase.from("funnel_steps" as never).update({ position: pa } as never).eq("id" as never, a.id as never);
    const r2 = await supabase.from("funnel_steps" as never).update({ position: pb } as never).eq("id" as never, b.id as never);
    const err = r1.error ?? r2.error;
    if (err) { toast.error(err.message); return; }
    onSaved();
  };

  const remove = async (s: FunnelStep) => {
    const { error } = await supabase.from("funnel_steps" as never).delete().eq("id" as never, s.id as never);
    setConfirmDelete(null);
    if (error) { toast.error(error.message); return; }
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Etapas do funil</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          A ordem define o desenho: um Upsell seguido de um Downsell fica lado a lado.
          Para um caminho diferente do padrão, edite a etapa e escolha para onde ela vai.
        </p>
        <div className="space-y-1.5">
          {list.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
              <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{STEP_KIND_LABEL[s.kind]}</span>
              <Input defaultValue={s.label} onBlur={(e) => rename(s, e.target.value)} className="h-8" />
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Descer">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setConfirmDelete(s)} aria-label="Tirar etapa">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {list.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma etapa ainda.</div>}
        </div>

        {missingDefaults.length > 0 && (
          <Button variant="outline" size="sm" onClick={addDefaults}>
            <Plus className="h-4 w-4" />
            {list.length === 0 ? "Criar etapas padrão (entrada, 3 upsells, 3 downsells e entregável)" : `Incluir etapas padrão que faltam (${missingDefaults.length})`}
          </Button>
        )}

        <div className="space-y-1 border-t pt-3">
          <Label className="text-xs">Nova etapa</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={newKind} onValueChange={(v) => setNewKind(v as StepKind)}>
              <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="extra">Etapa extra</SelectItem>
                <SelectItem value="upsell">Upsell</SelectItem>
                <SelectItem value="downsell">Downsell</SelectItem>
              </SelectContent>
            </Select>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex.: Order bump, Upsell 4"
              onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} />
            <Button onClick={addCustom}><Plus className="h-4 w-4" /> Incluir</Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tirar a etapa "{confirmDelete?.label}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Os dados dela (página, oferta, preço, VSL escolhida) somem junto. Não dá para desfazer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmDelete && remove(confirmDelete)} className="bg-destructive hover:bg-destructive/90">
                Tirar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/** Dados do funil na plataforma: código, nome, página de entrada e observações. */
export function FunnelInfoDialog({
  funnel, platform, onClose, onSaved,
}: {
  funnel: Funnel;
  platform: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    platform_funnel_code: funnel.platform_funnel_code ?? "",
    platform_funnel_name: funnel.platform_funnel_name ?? "",
    entry_page_url: funnel.entry_page_url ?? "",
    notes: funnel.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    const { error } = await supabase.from("funnels" as never).update({
      platform_funnel_code: txt(f.platform_funnel_code),
      platform_funnel_name: txt(f.platform_funnel_name),
      entry_page_url: txt(f.entry_page_url),
      notes: txt(f.notes),
    } as never).eq("id" as never, funnel.id as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Dados do funil salvos");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Dados do funil</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Plataforma: {platform ? PLATFORM_NAME[platform] ?? platform : "não cadastrada"}. Ela vem da tela de Produtos, no mercado deste funil.
        </p>
        <div className="grid gap-3">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Código</Label>
              <Input value={f.platform_funnel_code} onChange={set("platform_funnel_code")} placeholder={stepIdLabels(platform).funnel} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome do funil na plataforma</Label>
              <Input value={f.platform_funnel_name} onChange={set("platform_funnel_name")} placeholder="Produto 1 [BACKEND]" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Página de entrada (TSL ou VSL)</Label>
            <Input value={f.entry_page_url} onChange={set("entry_page_url")} placeholder="https://exemplo.com/produto-1/" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Textarea rows={3} value={f.notes} onChange={set("notes")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
