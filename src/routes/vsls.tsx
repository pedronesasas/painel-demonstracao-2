import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useLanguages, languageLabel } from "@/hooks/use-languages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Film, X, ChevronDown, ChevronRight, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton, EmptyState } from "@/components/ui/loading-state";
import { cn } from "@/lib/utils";

type VslType = "FRONT" | "BACK" | "UP1" | "UP2" | "UP3" | "DOWN1" | "DOWN2";
type FunnelStage = "FRONT" | "BACK";
type VslPart = "P1" | "P2";

type Vsl = {
  id: string;
  name: string;
  product_id: string | null;
  language_id: string | null;
  type: VslType;
  pitch_time_seconds: number | null;
  conversion_pct: number | null;
  notes: string | null;
  editor: string | null;
  funnel_stage: FunnelStage;
  parent_id: string | null;
  part: VslPart | null;
  segment: string | null;
  is_live: boolean;
  vturb_player_id?: string | null;
};

type Product = { id: string; name: string };
type LanguageOption = { id: string; code: string; name: string; flag: string | null; position: number };

const TYPE_OPTIONS: Array<{ value: VslType; label: string; description: string }> = [
  { value: "FRONT", label: "FRONT", description: "Vídeo de vendas principal — o primeiro vídeo que o cliente assiste antes de qualquer compra." },
  { value: "BACK", label: "BACK", description: "Entrada do back-end — VSL de um produto vendido para a base, por disparo de WhatsApp/e-mail." },
  { value: "UP1", label: "UP-1", description: "Upsell 1 — oferta complementar logo após a primeira compra." },
  { value: "UP2", label: "UP-2", description: "Upsell 2 — segunda oferta complementar após o UP-1." },
  { value: "UP3", label: "UP-3", description: "Upsell 3 — terceira oferta complementar após o UP-2." },
  { value: "DOWN1", label: "DOWN-1", description: "Downsell 1 — oferta alternativa caso o cliente recuse um upsell." },
  { value: "DOWN2", label: "DOWN-2", description: "Downsell 2 — segunda oferta alternativa após recusar outro upsell." },
];

const TYPE_LABEL: Record<VslType, string> = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<VslType, string>;

// Ordem em que os vídeos aparecem dentro do funil.
const TYPE_ORDER: Record<VslType, number> = {
  FRONT: 0, BACK: 0, UP1: 1, UP2: 2, UP3: 3, DOWN1: 4, DOWN2: 5,
};

const STAGE_OPTIONS: Array<{ value: FunnelStage; label: string; description: string }> = [
  { value: "FRONT", label: "Front", description: "Funil de entrada, que recebe o tráfego." },
  { value: "BACK", label: "Back-end", description: "Vendido para a base, por disparo de WhatsApp/e-mail." },
];

const STAGE_LABEL: Record<FunnelStage, string> = { FRONT: "Front", BACK: "Back-end" };

// Siglas de editor do SOP de Nomenclatura de VSL v4.0 (fim do nome: [COPY-EDITOR]).
const EDITOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "J", label: "Equipe interna" },
  { value: "EX", label: "Edição externa" },
];

const EDITOR_LABEL: Record<string, string> = Object.fromEntries(
  EDITOR_OPTIONS.map((o) => [o.value, o.label]),
);

const ALL = "all";
const NO_EDITOR = "none";
const NO_PARENT = "none";

// Lê a sigla do editor no fim da nomenclatura. Aceita a ordem nova ([R-J])
// e a antiga ([J-R]): as siglas de copy (M, R, T) nunca coincidem com as de editor.
function editorFromName(name: string): string | null {
  const codes = EDITOR_OPTIONS.map((o) => o.value);
  for (const m of name.toUpperCase().matchAll(/\[([A-Z]+)-([A-Z]+)\]/g)) {
    if (codes.includes(m[2])) return m[2];
    if (codes.includes(m[1])) return m[1];
  }
  return null;
}

// Lê tipo, parte e segmento do token [VSL-...] da nomenclatura.
// Ex.: "[ANJ] [VSL-FRONT-P2] [ID-04] [BR] [DINHEIRO] [PITCH 1389] [R-J]".
function partsFromName(name: string): { type: VslType | null; part: VslPart | null; segment: string | null } {
  const upper = name.toUpperCase();
  const t = upper.match(/\[VSL-(FRONT|BACK|UP1|UP2|UP3|DOWN1|DOWN2)(?:-(P1|P2))?\]/);
  if (!t) return { type: null, part: null, segment: null };
  const part = (t[2] as VslPart | undefined) ?? null;
  let segment: string | null = null;
  if (part) {
    const s = upper.match(/\[VSL-(?:FRONT|BACK)-P[12]\]\s*\[ID-[^\]]+\]\s*\[[^\]]+\]\s*\[([^\]]+)\]/);
    if (s && !s[1].startsWith("PITCH")) segment = s[1];
  }
  return { type: t[1] as VslType, part, segment };
}

function funnelKey(v: Pick<Vsl, "product_id" | "language_id" | "funnel_stage">) {
  return `${v.product_id ?? "-"}|${v.language_id ?? "-"}|${v.funnel_stage}`;
}

export const Route = createFileRoute("/vsls")({
  head: () => ({
    meta: [
      { title: "Inventário de VSLs — NEXUS" },
      { name: "description", content: "Cadastro e gestão de VSLs por funil, produto, mercado e tipo." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="vsls">
      <AppLayout><VslsPage /></AppLayout>
    </RequireTabAccess>
  ),
});

type DialogState =
  | { open: false }
  | { open: true; vsl: Vsl | null; parentId: string | null };

function VslsPage() {
  const { canEditTab } = useAuth();
  const canEdit = canEditTab("vsls");
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [view, setView] = useState<"funnel" | "list">("funnel");

  const [fProduct, setFProduct] = useState<string>(ALL);
  const [fLanguage, setFLanguage] = useState<string>(ALL);
  const [fType, setFType] = useState<string>(ALL);
  const [fEditor, setFEditor] = useState<string>(ALL);
  const [fStage, setFStage] = useState<string>(ALL);

  const { data: products } = useQuery({
    queryKey: ["products", "for-vsls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const { data: languages } = useLanguages({ onlyActive: true });

  const { data: vsls, isLoading } = useQuery({
    queryKey: ["vsls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vsls")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Vsl[];
    },
  });

  const productById = useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p])),
    [products],
  );
  const languageById = useMemo(
    () => new Map((languages ?? []).map((l) => [l.id, l])),
    [languages],
  );
  const languageOptions: LanguageOption[] = useMemo(
    () => (languages ?? []).map((l) => ({ id: l.id, code: l.code, name: l.name, flag: l.flag, position: l.position })),
    [languages],
  );

  // VSL principal (vídeo único ou VSL em partes) e as partes de cada uma.
  const { topLevel, partsByParent } = useMemo(() => {
    const all = vsls ?? [];
    const byParent = new Map<string, Vsl[]>();
    for (const v of all) {
      if (!v.parent_id) continue;
      const list = byParent.get(v.parent_id) ?? [];
      list.push(v);
      byParent.set(v.parent_id, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) =>
        (a.part ?? "").localeCompare(b.part ?? "") || (a.segment ?? a.name).localeCompare(b.segment ?? b.name),
      );
    }
    return { topLevel: all.filter((v) => !v.parent_id), partsByParent: byParent };
  }, [vsls]);

  const matchesEditor = (v: Vsl) => {
    if (fEditor === ALL) return true;
    const editors = [v.editor, ...(partsByParent.get(v.id) ?? []).map((p) => p.editor)];
    return fEditor === NO_EDITOR ? editors.every((e) => !e) : editors.includes(fEditor);
  };

  const filtered = topLevel.filter((v) =>
    (fProduct === ALL || v.product_id === fProduct) &&
    (fLanguage === ALL || v.language_id === fLanguage) &&
    (fType === ALL || v.type === fType) &&
    (fStage === ALL || v.funnel_stage === fStage) &&
    matchesEditor(v),
  );

  const groups = useMemo(() => {
    const map = new Map<string, Vsl[]>();
    for (const v of filtered) {
      const key = funnelKey(v);
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    const out = [...map.entries()].map(([key, items]) => {
      items.sort((a, b) =>
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
        Number(b.is_live) - Number(a.is_live) ||
        a.name.localeCompare(b.name),
      );
      const first = items[0];
      return {
        key,
        items,
        product: first.product_id ? productById.get(first.product_id) ?? null : null,
        language: first.language_id ? languageById.get(first.language_id) ?? null : null,
        stage: first.funnel_stage,
      };
    });
    // Produto, depois mercado na ordem configurada, depois Front antes de Back-end.
    out.sort((a, b) =>
      (a.product?.name ?? "~").localeCompare(b.product?.name ?? "~") ||
      (a.language?.position ?? 99) - (b.language?.position ?? 99) ||
      b.stage.localeCompare(a.stage),
    );
    return out;
  }, [filtered, productById, languageById]);

  const hasFilter = fProduct !== ALL || fLanguage !== ALL || fType !== ALL || fEditor !== ALL || fStage !== ALL;
  const clearFilters = () => {
    setFProduct(ALL); setFLanguage(ALL); setFType(ALL); setFEditor(ALL); setFStage(ALL);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("vsls").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("VSL excluído");
      qc.invalidateQueries({ queryKey: ["vsls"] });
    }
  };

  const openNew = () => setDialog({ open: true, vsl: null, parentId: null });
  const openEdit = (v: Vsl) => setDialog({ open: true, vsl: v, parentId: v.parent_id });
  const openNewPart = (parent: Vsl) => setDialog({ open: true, vsl: null, parentId: parent.id });

  const rowProps = {
    canEdit,
    partsByParent,
    onEdit: openEdit,
    onAddPart: openNewPart,
    onDelete: handleDelete,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventário de VSLs"
        description="VSLs organizadas por funil: produto, mercado e etapa"
        actions={canEdit && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Novo VSL
          </Button>
        )}
      />

      <Dialog
        open={dialog.open}
        onOpenChange={(o) => { if (!o) setDialog({ open: false }); }}
      >
        {dialog.open && (
          <VslDialog
            vsl={dialog.vsl}
            initialParentId={dialog.parentId}
            parents={topLevel}
            products={products ?? []}
            languages={languageOptions}
            onSaved={() => {
              setDialog({ open: false });
              qc.invalidateQueries({ queryKey: ["vsls"] });
            }}
          />
        )}
      </Dialog>

      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground">Produto</Label>
          <Select value={fProduct} onValueChange={setFProduct}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os produtos</SelectItem>
              {(products ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[180px]">
          <Label className="text-xs text-muted-foreground">Mercado</Label>
          <Select value={fLanguage} onValueChange={setFLanguage}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os mercados</SelectItem>
              {(languages ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>{languageLabel(l)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[150px]">
          <Label className="text-xs text-muted-foreground">Etapa</Label>
          <Select value={fStage} onValueChange={setFStage}>
            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as etapas</SelectItem>
              {STAGE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[220px]">
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent className="max-w-[420px]">
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value} className="py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">{t.label}</span>
                    <span className="text-xs text-muted-foreground whitespace-normal">{t.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[190px]">
          <Label className="text-xs text-muted-foreground">Editor</Label>
          <Select value={fEditor} onValueChange={setFEditor}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os editores</SelectItem>
              {EDITOR_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label} ({o.value})</SelectItem>
              ))}
              <SelectItem value={NO_EDITOR}>Sem editor informado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" /> Limpar filtros
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {view === "funnel" && `${groups.length} ${groups.length === 1 ? "funil" : "funis"} · `}
            {filtered.length} {filtered.length === 1 ? "VSL" : "VSLs"}
          </span>
          <Tabs value={view} onValueChange={(v) => setView(v as "funnel" | "list")}>
            <TabsList>
              <TabsTrigger value="funnel">Por funil</TabsTrigger>
              <TabsTrigger value="list">Lista</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-4"><ListSkeleton rows={5} /></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Film}
          title={hasFilter ? "Nenhum VSL com esses filtros" : "Nenhum VSL cadastrado"}
          description={canEdit ? "Cadastre seu primeiro VSL para começar a acompanhar conversão." : "Aguarde alguém com permissão cadastrar VSLs."}
        />
      ) : view === "funnel" ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <FunnelGroup
              key={g.key}
              title={[
                g.product?.name ?? "Sem produto",
                g.language ? languageLabel(g.language) : "Sem mercado",
                STAGE_LABEL[g.stage],
              ].join(" · ")}
              items={g.items}
              highlightEditor={fEditor !== ALL && fEditor !== NO_EDITOR ? fEditor : null}
              {...rowProps}
            />
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomenclatura</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Mercado</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Editor</TableHead>
                <TableHead>Pitch</TableHead>
                <TableHead>Conversão</TableHead>
                <TableHead>No ar</TableHead>
                {canEdit && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => {
                const prod = v.product_id ? productById.get(v.product_id) : null;
                const lang = v.language_id ? languageById.get(v.language_id) : null;
                return (
                  <VslRow
                    key={v.id}
                    vsl={v}
                    leading={
                      <>
                        <TableCell>{prod?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>
                          {lang ? (
                            <Badge variant="secondary" className="text-[10px]">{languageLabel(lang)}</Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">{STAGE_LABEL[v.funnel_stage]}</TableCell>
                      </>
                    }
                    leadingParts={3}
                    showTypeColumn
                    {...rowProps}
                  />
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

type RowActionsProps = {
  canEdit: boolean;
  partsByParent: Map<string, Vsl[]>;
  onEdit: (v: Vsl) => void;
  onAddPart: (parent: Vsl) => void;
  onDelete: (id: string) => void;
};

function FunnelGroup({
  title, items, highlightEditor, ...rowProps
}: RowActionsProps & { title: string; items: Vsl[]; highlightEditor: string | null }) {
  const [open, setOpen] = useState(true);
  const editors = new Set<string>();
  let videoCount = 0;
  for (const v of items) {
    const parts = rowProps.partsByParent.get(v.id) ?? [];
    videoCount += parts.length || 1;
    for (const e of [v.editor, ...parts.map((p) => p.editor)]) if (e) editors.add(e);
  }

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
          >
            {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <span className="font-semibold">{title}</span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {[...editors].map((e) => (
                <Badge key={e} variant="neutral" className="text-[10px]">{EDITOR_LABEL[e] ?? e}</Badge>
              ))}
              <span className="text-xs text-muted-foreground">
                {videoCount} {videoCount === 1 ? "vídeo" : "vídeos"}
              </span>
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Posição</TableHead>
                <TableHead>Nomenclatura</TableHead>
                <TableHead>Editor</TableHead>
                <TableHead>Pitch</TableHead>
                <TableHead>Conversão</TableHead>
                <TableHead>No ar</TableHead>
                {rowProps.canEdit && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((v) => (
                <VslRow
                  key={v.id}
                  vsl={v}
                  leading={
                    <TableCell>
                      <Badge variant="outline" className="font-semibold">{TYPE_LABEL[v.type]}</Badge>
                    </TableCell>
                  }
                  leadingParts={1}
                  leadingFirst
                  highlight={highlightEditor != null && (
                    v.editor === highlightEditor ||
                    (rowProps.partsByParent.get(v.id) ?? []).some((p) => p.editor === highlightEditor)
                  )}
                  {...rowProps}
                />
              ))}
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Linha de uma VSL. Se ela for uma VSL em partes, mostra o resumo das partes
// e abre a lista de P1/P2 logo abaixo.
function VslRow({
  vsl, leading, leadingParts, leadingFirst = false, showTypeColumn = false, highlight = false,
  canEdit, partsByParent, onEdit, onAddPart, onDelete,
}: RowActionsProps & {
  vsl: Vsl;
  leading: React.ReactNode;
  leadingParts: number;
  leadingFirst?: boolean;
  showTypeColumn?: boolean;
  highlight?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const parts = partsByParent.get(vsl.id) ?? [];
  const p1 = parts.filter((p) => p.part === "P1").length;
  const p2 = parts.filter((p) => p.part === "P2").length;
  const other = parts.length - p1 - p2;
  const colCount = 1 + leadingParts + (showTypeColumn ? 1 : 0) + 4 + (canEdit ? 1 : 0);

  const nameCell = (
    <TableCell>
      <div className="font-mono text-xs">{vsl.name}</div>
      {parts.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {[
            p1 ? `P1: ${p1} ${p1 === 1 ? "versão" : "versões"}` : null,
            p2 ? `P2: ${p2} ${p2 === 1 ? "versão" : "versões"}` : null,
            other ? `${other} sem parte` : null,
          ].filter(Boolean).join(" · ")}
        </button>
      )}
    </TableCell>
  );

  return (
    <Fragment>
      <TableRow className={cn(highlight && "bg-info/10")}>
        {leadingFirst ? <>{leading}{nameCell}</> : <>{nameCell}{leading}</>}
        {showTypeColumn && (
          <TableCell>
            <Badge variant="outline" className="font-semibold">{TYPE_LABEL[vsl.type]}</Badge>
          </TableCell>
        )}
        <EditorCell editor={vsl.editor} />
        <TableCell className="font-mono text-xs">
          {vsl.pitch_time_seconds != null ? formatPitch(vsl.pitch_time_seconds) : "—"}
        </TableCell>
        <TableCell><ConversionBadge value={vsl.conversion_pct} /></TableCell>
        <TableCell><LiveBadge live={vsl.is_live} /></TableCell>
        {canEdit && (
          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => onAddPart(vsl)} aria-label="Adicionar parte" title="Adicionar parte (P1/P2)">
                <ListPlus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onEdit(vsl)} aria-label="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon" aria-label="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
                title="Excluir VSL?"
                description={
                  parts.length
                    ? `O VSL "${vsl.name}" e as ${parts.length} partes dele serão removidos. Esta ação não pode ser desfeita.`
                    : `O VSL "${vsl.name}" será removido. Esta ação não pode ser desfeita.`
                }
                confirmLabel="Excluir"
                destructive
                onConfirm={() => onDelete(vsl.id)}
              />
            </div>
          </TableCell>
        )}
      </TableRow>
      {expanded && parts.length > 0 && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colCount} className="bg-muted/30 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px] pl-8">Parte</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Nomenclatura</TableHead>
                  <TableHead>Editor</TableHead>
                  <TableHead>Pitch</TableHead>
                  {canEdit && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-8">
                      <Badge variant="outline" className="font-semibold">{p.part ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.segment ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.name}</TableCell>
                    <EditorCell editor={p.editor} />
                    <TableCell className="font-mono text-xs">
                      {p.pitch_time_seconds != null ? formatPitch(p.pitch_time_seconds) : "—"}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => onEdit(p)} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon" aria-label="Excluir">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            }
                            title="Excluir parte?"
                            description={`A parte "${p.name}" será removida. Esta ação não pode ser desfeita.`}
                            confirmLabel="Excluir"
                            destructive
                            onConfirm={() => onDelete(p.id)}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

function EditorCell({ editor }: { editor: string | null }) {
  return (
    <TableCell>
      {editor
        ? (EDITOR_LABEL[editor] ?? editor)
        : <span className="text-muted-foreground">—</span>}
    </TableCell>
  );
}

function VslDialog({
  vsl, initialParentId, parents, products, languages, onSaved,
}: {
  vsl: Vsl | null;
  initialParentId: string | null;
  parents: Vsl[];
  products: Product[];
  languages: LanguageOption[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(vsl?.name ?? "");
  const [productId, setProductId] = useState<string>(vsl?.product_id ?? "");
  const [languageId, setLanguageId] = useState<string>(vsl?.language_id ?? "");
  const [type, setType] = useState<VslType | "">(vsl?.type ?? "");
  const [stage, setStage] = useState<FunnelStage>(vsl?.funnel_stage ?? "FRONT");
  const [pitch, setPitch] = useState<string>(vsl?.pitch_time_seconds != null ? String(vsl.pitch_time_seconds) : "");
  const [conversion, setConversion] = useState<string>(vsl?.conversion_pct != null ? String(vsl.conversion_pct) : "");
  const [notes, setNotes] = useState<string>(vsl?.notes ?? "");
  const [editor, setEditor] = useState<string>(vsl?.editor ?? "");
  const [isLive, setIsLive] = useState<boolean>(vsl?.is_live ?? false);
  const [isPart, setIsPart] = useState<boolean>(Boolean(initialParentId));
  const [parentId, setParentId] = useState<string>(initialParentId ?? "");
  const [part, setPart] = useState<VslPart | "">(vsl?.part ?? "");
  const [segment, setSegment] = useState<string>(vsl?.segment ?? "");
  const [player, setPlayer] = useState<string>(vsl?.vturb_player_id ?? "");
  const [submitting, setSubmitting] = useState(false);

  const parentOptions = parents.filter((p) => p.id !== vsl?.id);
  const parent = parentId ? parentOptions.find((p) => p.id === parentId) ?? null : null;
  const isP1 = isPart && part === "P1";

  const pitchN = Number(pitch);
  const pitchPreview = pitch && !isNaN(pitchN) && pitchN >= 0 ? formatPitch(Math.floor(pitchN)) : null;

  // Preenche sozinho pela nomenclatura, sem sobrescrever o que já foi escolhido.
  const handleNameChange = (value: string) => {
    setName(value);
    if (!editor) {
      const detected = editorFromName(value);
      if (detected) setEditor(detected);
    }
    const parsed = partsFromName(value);
    if (!type && parsed.type) {
      setType(parsed.type);
      if (parsed.type === "BACK") setStage("BACK");
    }
    if (isPart) {
      if (!part && parsed.part) setPart(parsed.part);
      if (!segment && parsed.segment) setSegment(parsed.segment);
    }
  };

  const handleTypeChange = (v: VslType) => {
    setType(v);
    if (v === "BACK") setStage("BACK");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Preencha a nomenclatura");
      return;
    }
    if (isPart) {
      if (!parent) { toast.error("Escolha a VSL principal desta parte"); return; }
      if (!part) { toast.error("Escolha se é a P1 ou a P2"); return; }
    } else if (!productId || !languageId || !type) {
      toast.error("Preencha nomenclatura, produto, mercado e tipo");
      return;
    }
    setSubmitting(true);
    // A parte herda produto, mercado, tipo e etapa da VSL principal.
    const base = isPart && parent
      ? {
          product_id: parent.product_id,
          language_id: parent.language_id,
          type: parent.type,
          funnel_stage: parent.funnel_stage,
          parent_id: parent.id,
          part: part || null,
          segment: segment.trim().toUpperCase() || null,
          is_live: false,
          conversion_pct: null,
        }
      : {
          product_id: productId,
          language_id: languageId,
          type,
          funnel_stage: stage,
          parent_id: null,
          part: null,
          segment: null,
          is_live: isLive,
          conversion_pct: conversion === "" ? null : Number(conversion),
        };
    const payload = {
      ...base,
      name: name.trim(),
      // A P1 do formato novo não tem pitch.
      pitch_time_seconds: isP1 || pitch === "" ? null : Math.max(0, Math.floor(Number(pitch) || 0)),
      notes: notes.trim() || null,
      editor: editor || null,
      // Coluna nova: só vai no payload quando há valor ou já existia (evita erro antes da migração)
      ...(player.trim() || vsl?.vturb_player_id != null ? { vturb_player_id: player.trim() || null } : {}),
    };
    const { error } = vsl
      ? await supabase.from("vsls").update(payload as never).eq("id", vsl.id)
      : await supabase.from("vsls").insert(payload as never);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success(vsl ? "VSL atualizado" : isPart ? "Parte adicionada" : "VSL criado");
      onSaved();
    }
  };

  const title = vsl
    ? (isPart ? "Editar parte" : "Editar VSL")
    : (isPart ? "Nova parte (P1/P2)" : "Novo VSL");

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Nomenclatura</Label>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={isPart
              ? "[ANJ] [VSL-FRONT-P2] [ID-04] [BR] [DINHEIRO] [PITCH 1389] [R-J]"
              : "[ANJ] [VSL-FRONT] [ID-01] [BR] [PITCH 1099] [R-J]"}
            required
            maxLength={200}
            className="font-mono"
          />
        </div>

        {!vsl && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={isPart}
              onCheckedChange={(c) => setIsPart(c === true)}
              className="mt-0.5"
            />
            <span>
              Este vídeo é uma parte (P1 ou P2) de uma VSL em partes
              <span className="block text-xs text-muted-foreground">
                Formato novo: a VSL principal aparece no funil e as partes ficam dentro dela.
              </span>
            </span>
          </label>
        )}

        {isPart ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2 sm:col-span-3">
              <Label>VSL principal</Label>
              <Select value={parentId || NO_PARENT} onValueChange={(v) => setParentId(v === NO_PARENT ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className="max-w-[640px]">
                  <SelectItem value={NO_PARENT}>Selecione</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs">{p.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Produto, mercado, tipo e etapa vêm da VSL principal.</p>
            </div>
            <div className="space-y-2">
              <Label>Parte</Label>
              <Select value={part} onValueChange={(v) => setPart(v as VslPart)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="P1">P1 — perfil, sem pitch</SelectItem>
                  <SelectItem value="P2">P2 — tema, com pitch</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Segmento</Label>
              <Input
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="Ex.: H-1835-S, DINHEIRO, V3"
                maxLength={40}
                className="font-mono uppercase"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mercado</Label>
                <Select value={languageId} onValueChange={setLanguageId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {languages.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{languageLabel(l)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => handleTypeChange(v as VslType)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-w-[480px]">
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold">{t.label}</span>
                          <span className="text-xs text-muted-foreground whitespace-normal">{t.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Etapa do funil</Label>
                <Select value={stage} onValueChange={(v) => setStage(v as FunnelStage)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-w-[420px]">
                    {STAGE_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold">{s.label}</span>
                          <span className="text-xs text-muted-foreground whitespace-normal">{s.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Editor</Label>
            <Select
              value={editor || NO_EDITOR}
              onValueChange={(v) => setEditor(v === NO_EDITOR ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {EDITOR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label} ({o.value})</SelectItem>
                ))}
                <SelectItem value={NO_EDITOR}>Não informado</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Preenchido pela nomenclatura quando ela termina em [R-J], [M-EX] etc.</p>
          </div>
          <div className="space-y-2">
            <Label>Pitch Time (segundos)</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={isP1 ? "" : pitch}
              onChange={(e) => setPitch(e.target.value)}
              placeholder={isP1 ? "A P1 não tem pitch" : "Ex.: 1099"}
              disabled={isP1}
            />
            {pitchPreview && !isP1 && (
              <p className="text-xs text-muted-foreground">≈ {pitchPreview}</p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Player da VTurb</Label>
            <Input
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              placeholder="Ex.: 6aee1c86a315ca797235697b"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">A página de Funis lê o pitch e o player daqui.</p>
          </div>
        </div>

        {!isPart && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Conversão (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={conversion}
                onChange={(e) => setConversion(e.target.value)}
                placeholder="Opcional"
              />
              <p className="text-xs text-muted-foreground">Pode ser preenchido depois.</p>
            </div>
            <div className="space-y-2">
              <Label>No ar</Label>
              <label className="flex items-center gap-2 text-sm h-9">
                <Switch checked={isLive} onCheckedChange={setIsLive} />
                <span>{isLive ? "Esta versão está rodando no funil" : "Não está no ar"}</span>
              </label>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Observações</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Links do Drive e da VTurb, notas internas (opcional)"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function LiveBadge({ live }: { live: boolean }) {
  if (!live) return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge variant="success" className="px-2">no ar</Badge>;
}

function ConversionBadge({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  // TODO: tornar faixas configuráveis em Configurações.
  const tone = value < 2 ? "danger" : value <= 5 ? "warning" : "success";
  return (
    <Badge variant={tone} className="px-2 tabular-nums">
      {Number(value).toFixed(2)}%
    </Badge>
  );
}

function formatPitch(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
