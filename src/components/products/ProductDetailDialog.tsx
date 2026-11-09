import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useLanguages, languageLabel, type Language } from "@/hooks/use-languages";
import { PLATFORMS } from "@/components/funil/funnel-items";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type ProductLite = { id: string; name: string };

type LinkRow = { title: string; url: string };
type PixelRow = { title: string; value: string };

type Localization = {
  id: string;
  product_id: string;
  language_id: string;
  price: number;
  currency: string | null;
  funnel_url: string | null;
  presell_url: string | null;
  tracking_pixels: Record<string, string>;
  external_ids: Record<string, string>;
  platform: string | null;
  links: LinkRow[];
  notes: unknown;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: ProductLite | null;
  canEdit: boolean;
};

function pickDefaultLanguage(languages: Language[]): string {
  if (!languages.length) return "";
  const br = languages.find(
    (l) => l.code.toLowerCase().startsWith("pt") || l.name.toLowerCase().includes("brasil"),
  );
  return (br ?? languages[0]).id;
}

export function ProductDetailDialog({ open, onOpenChange, product, canEdit }: Props) {
  const qc = useQueryClient();
  const { data: languages = [] } = useLanguages();
  const [languageId, setLanguageId] = useState<string>("");

  // Mercados já cadastrados para este produto
  const { data: existingLangIds = [] } = useQuery({
    queryKey: ["product-existing-langs", product?.id],
    enabled: open && !!product?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_localizations")
        .select("language_id")
        .eq("product_id", product!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.language_id as string);
    },
  });

  // Ao abrir: se o produto tem exatamente 1 mercado, seleciona-o;
  // caso contrário cai no padrão (pt-BR ou primeiro idioma).
  useEffect(() => {
    if (!open || !languages.length) return;
    setLanguageId((prev) => {
      if (prev) return prev;
      if (existingLangIds.length === 1) return existingLangIds[0];
      return pickDefaultLanguage(languages);
    });
  }, [open, languages, existingLangIds]);

  useEffect(() => {
    if (!open) setLanguageId("");
  }, [open]);

  const language = languages.find((l) => l.id === languageId);

  const { data: loc, isLoading } = useQuery({
    queryKey: ["product-loc", product?.id, languageId],
    enabled: open && !!product?.id && !!languageId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_localizations").select("*")
        .eq("product_id", product!.id).eq("language_id", languageId)
        .maybeSingle();
      if (error) throw error;
      return data as Localization | null;
    },
  });

  // Configuração do produto (não é por mercado): roda oferta no backend?
  const { data: hasBackend = false } = useQuery({
    queryKey: ["product-has-backend", product?.id],
    enabled: open && !!product?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products").select("has_backend" as never)
        .eq("id", product!.id).maybeSingle();
      if (error) return false;
      return ((data as { has_backend?: boolean } | null)?.has_backend) === true;
    },
  });

  const setHasBackend = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase
        .from("products").update({ has_backend: v } as never).eq("id", product!.id);
      if (error) throw new Error(error.message);
      return v;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-has-backend", product?.id] });
      toast.success("Configuração salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["product-loc", product?.id, languageId] });
    qc.invalidateQueries({ queryKey: ["product-locs", product?.id] });
    qc.invalidateQueries({ queryKey: ["product-existing-langs", product?.id] });
    qc.invalidateQueries({ queryKey: ["products-locs-summary"] });
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="truncate">{product.name}</DialogTitle>
            <div className="w-56">
              <Select value={languageId} onValueChange={setLanguageId}>
                <SelectTrigger><SelectValue placeholder="Mercado" /></SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{languageLabel(l)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <Switch
            checked={hasBackend}
            onCheckedChange={(v) => setHasBackend.mutate(v)}
            disabled={!canEdit || setHasBackend.isPending}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium">Roda oferta no backend</div>
            <div className="text-xs text-muted-foreground">
              Ofertado para a base por e-mail/WhatsApp.
            </div>
          </div>
        </div>

        <ProductFunnelSettings productId={product.id} canEdit={canEdit} />

        {!languageId ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Cadastre um mercado primeiro (engrenagem em Produtos).
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
        ) : !loc ? (
          <MissingLocalization
            product={product}
            languageId={languageId}
            languageName={language?.name ?? ""}
            currency={language?.currency ?? "BRL"}
            canEdit={canEdit}
            onCreated={refresh}
          />
        ) : (
          <LocalizationForm
            key={loc.id}
            loc={loc}
            currency={language?.currency ?? "BRL"}
            canEdit={canEdit}
            onSaved={refresh}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MissingLocalization({
  product, languageId, languageName, currency, canEdit, onCreated,
}: {
  product: ProductLite; languageId: string; languageName: string;
  currency: string; canEdit: boolean; onCreated: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const create = async () => {
    setCreating(true);
    const { error } = await supabase.from("product_localizations").insert({
      product_id: product.id, language_id: languageId,
      price: 0, currency, tracking_pixels: {}, external_ids: {},
      links: [], notes: null,
    });
    setCreating(false);
    if (error) toast.error(error.message);
    else { toast.success("Mercado adicionado"); onCreated(); }
  };
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center space-y-3">
      <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
      <div>
        <p className="font-medium">Configurações para {languageName} não encontradas.</p>
        <p className="text-sm text-muted-foreground">Deseja criar agora?</p>
      </div>
      {canEdit ? (
        <Button onClick={create} disabled={creating}>
          {creating ? "Criando..." : "Criar para este mercado"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Somente editores podem criar.</p>
      )}
    </div>
  );
}

function initialLinks(loc: Localization): LinkRow[] {
  if (Array.isArray(loc.links) && loc.links.length) {
    return loc.links.map((l) => ({ title: l?.title ?? "", url: l?.url ?? "" }));
  }
  // Migração transparente dos campos antigos
  const out: LinkRow[] = [];
  if (loc.funnel_url) out.push({ title: "Funnel", url: loc.funnel_url });
  if (loc.presell_url) out.push({ title: "Pressel", url: loc.presell_url });
  return out;
}

function initialPixels(loc: Localization): PixelRow[] {
  const obj = loc.tracking_pixels ?? {};
  return Object.entries(obj).map(([title, value]) => ({ title, value: String(value ?? "") }));
}

function LocalizationForm({
  loc, currency, canEdit, onSaved,
}: { loc: Localization; currency: string; canEdit: boolean; onSaved: () => void }) {
  const [price, setPrice] = useState(String(loc.price ?? 0));
  const [curr, setCurr] = useState(loc.currency || currency);
  const [platform, setPlatform] = useState<string>(loc.platform ?? "none");
  const [links, setLinks] = useState<LinkRow[]>(() => initialLinks(loc));
  const [pixels, setPixels] = useState<PixelRow[]>(() => initialPixels(loc));
  const [notes, setNotes] = useState<unknown>(loc.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm("Remover esta localização?")) return;
    const { error } = await supabase.from("product_localizations").delete().eq("id", loc.id);
    if (error) toast.error(error.message);
    else { toast.success("Localização removida"); onSaved(); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const cleanLinks = links
      .map((l) => ({ title: l.title.trim(), url: l.url.trim() }))
      .filter((l) => l.title || l.url);
    const cleanPixels = pixels
      .map((p) => ({ title: p.title.trim(), value: p.value.trim() }))
      .filter((p) => p.title || p.value);
    // Mantém compat com tracking_pixels (objeto)
    const trackingObj: Record<string, string> = {};
    for (const { title, value } of cleanPixels) {
      if (title) trackingObj[title] = value;
    }

    const payload = {
      price: Number(price) || 0,
      currency: curr.trim().toUpperCase() || null,
      platform: platform === "none" ? null : platform,
      links: cleanLinks,
      tracking_pixels: trackingObj,
      notes: (notes && (typeof notes !== "string" || notes.trim()) ? notes : null) as never,
    };
    // types.ts ainda não tem `platform` em product_localizations
    const { error } = await supabase
      .from("product_localizations")
      .update(payload as never)
      .eq("id", loc.id);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success("Salvo"); onSaved(); }
  };

  const disabled = !canEdit;

  return (
    <form onSubmit={save} className="space-y-6">
      {/* Preço, moeda e plataforma */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Preço</Label>
          <Input type="number" step="0.01" min={0} value={price}
            onChange={(e) => setPrice(e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-2">
          <Label>Moeda</Label>
          <Input value={curr} onChange={(e) => setCurr(e.target.value)}
            disabled={disabled} maxLength={6} />
        </div>
        <div className="space-y-2">
          <Label>Plataforma de vendas</Label>
          <Select value={platform} onValueChange={setPlatform} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="Não definida" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não definida</SelectItem>
              {PLATFORMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="-mt-4 text-xs text-muted-foreground">
        A plataforma deste mercado é usada em Funis para saber onde os checkouts
        deste produto vivem — sem precisar escolher a cada ID cadastrado.
      </p>

      {/* Links */}
      <DynamicList
        label="Links"
        addLabel="Adicionar link"
        rows={links}
        setRows={setLinks}
        disabled={disabled}
        keyField="title"
        valueField="url"
        keyPlaceholder="Funnel, Pressel, Drive..."
        valuePlaceholder="https://..."
        empty={() => ({ title: "", url: "" })}
      />

      {/* Pixels & Tags */}
      <DynamicList
        label="Pixels & Tags"
        addLabel="Adicionar item"
        rows={pixels}
        setRows={setPixels}
        disabled={disabled}
        keyField="title"
        valueField="value"
        keyPlaceholder="Pixel ID, Exclusion Tag..."
        valuePlaceholder="valor"
        empty={() => ({ title: "", value: "" })}
      />

      {/* Documentação */}
      <div className="space-y-2">
        <Label>Documentação</Label>
        <RichTextEditor
          value={notes}
          onChange={setNotes}
          placeholder="Notas, instruções, contexto deste mercado..."
          expandTitle="Documentação do mercado"
          disabled={disabled}
        />
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {canEdit ? (
          <Button type="button" variant="ghost" onClick={handleDelete}
            className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> Remover localização
          </Button>
        ) : <div />}
        <Button type="submit" disabled={submitting || disabled}>
          {submitting ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DynamicList<T extends Record<string, string>>({
  label, addLabel, rows, setRows, disabled,
  keyField, valueField, keyPlaceholder, valuePlaceholder, empty,
}: {
  label: string;
  addLabel: string;
  rows: T[];
  setRows: (r: T[]) => void;
  disabled?: boolean;
  keyField: keyof T & string;
  valueField: keyof T & string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  empty: () => T;
}) {
  const update = (i: number, field: keyof T & string, v: string) => {
    setRows(rows.map((r, idx) => idx === i ? { ...r, [field]: v } : r));
  };
  const remove = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const add = () => setRows([...rows, empty()]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-base">{label}</Label>
        {!disabled && (
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <Plus className="h-4 w-4" /> {addLabel}
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Nenhum item.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={r[keyField]} onChange={(e) => update(i, keyField, e.target.value)}
                placeholder={keyPlaceholder} disabled={disabled} className="w-1/3"
              />
              <Input
                value={r[valueField]} onChange={(e) => update(i, valueField, e.target.value)}
                placeholder={valuePlaceholder} disabled={disabled} className="flex-1"
              />
              {!disabled && (
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}
                  aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type FunnelSettings = { code: string | null; kind: "principal" | "upsell"; archived: boolean };

/**
 * Como o produto aparece na tela de Funis: sigla, se é oferta principal ou
 * produto de upsell, e se está arquivado. Fica aqui para ter um cadastro só.
 */
function ProductFunnelSettings({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["product-funnel-settings", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products").select("code,kind,archived" as never).eq("id", productId).maybeSingle();
      if (error) return null;
      return data as unknown as FunnelSettings | null;
    },
  });
  const [code, setCode] = useState("");
  useEffect(() => { setCode(data?.code ?? ""); }, [data?.code]);

  const save = useMutation({
    mutationFn: async (patch: Partial<FunnelSettings>) => {
      const { error } = await supabase.from("products").update(patch as never).eq("id", productId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-funnel-settings", productId] });
      qc.invalidateQueries({ queryKey: ["funis"] });
      toast.success("Configuração salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Coluna nova: enquanto a migração não roda, o bloco não aparece
  if (!data) return null;
  const disabled = !canEdit || save.isPending;

  return (
    <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 sm:grid-cols-[110px_160px_1fr] sm:items-end">
      <div className="space-y-1">
        <Label className="text-xs">Sigla</Label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onBlur={() => { const v = code.trim() || null; if (v !== (data.code ?? null)) save.mutate({ code: v }); }}
          placeholder="PR1"
          maxLength={6}
          disabled={disabled}
          className="h-8 font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Tipo</Label>
        <Select value={data.kind} onValueChange={(v) => save.mutate({ kind: v as FunnelSettings["kind"] })} disabled={disabled}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="principal">Oferta principal</SelectItem>
            <SelectItem value="upsell">Produto de upsell</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={data.archived} onCheckedChange={(v) => save.mutate({ archived: v })} disabled={disabled} />
        <div className="min-w-0">
          <div className="text-sm font-medium">Arquivado</div>
          <div className="text-xs text-muted-foreground">Ofertas principais aparecem como card na tela de Funis; arquivadas vão para o fim.</div>
        </div>
      </div>
    </div>
  );
}
