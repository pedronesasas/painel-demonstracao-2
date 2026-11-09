import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Pencil, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { buildCampaignCode } from "@/lib/campaign-utils";
import { useLanguages } from "@/hooks/use-languages";
import { groupCampaigns, normalizeProductName } from "@/lib/campaign-groups";
import { CampaignGroupsView } from "@/components/campaigns/CampaignGroupsView";

export const Route = createFileRoute("/campaigns/")({
  head: () => ({
    meta: [
      { title: "Campanhas — NEXUS" },
      { name: "description", content: "Lista de campanhas." },
      { property: "og:title", content: "Campanhas — NEXUS" },
      { property: "og:description", content: "Lista de campanhas." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="campaigns">
      <AppLayout><CampaignsListPage /></AppLayout>
    </RequireTabAccess>
  ),
});

type CampaignRow = {
  id: string;
  code: string;
  product_name: string;
  week_number: number;
  year: number;
  status: string;
  language_id: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

function formatDateBR(value?: string | null) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
}

type CampaignsView = "grouped" | "list";
const VIEW_STORAGE_KEY = "nexus.campaigns.view";

function loadView(): CampaignsView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grouped";
  } catch {
    return "grouped";
  }
}

function CampaignsListPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  // "Agrupada" (padrão): um cartão por semana + produto. "Lista detalhada": uma linha por língua.
  const [view, setView] = useState<CampaignsView>(() => loadView());
  const changeView = (v: string) => {
    const next: CampaignsView = v === "list" ? "list" : "grouped";
    setView(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* ignore */ }
  };
  // Inclui línguas inativas: campanhas antigas podem estar nelas
  const { data: languages = [] } = useLanguages({ onlyActive: false });
  const langById = useMemo(() => new Map(languages.map((l) => [l.id, l])), [languages]);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("year", { ascending: false })
        .order("week_number", { ascending: false })
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const years = Array.from(new Set((campaigns ?? []).map((c) => c.year))).sort((a, b) => b - a);
  const searchLower = search.toLowerCase();
  const searchNorm = normalizeProductName(search);
  const matchSearch = (c: { code: string; product_name: string }) =>
    !search ||
    c.code.toLowerCase().includes(searchLower) ||
    c.product_name.toLowerCase().includes(searchLower) ||
    // sem acento: "unico" acha "Único"
    (!!searchNorm && normalizeProductName(c.product_name).includes(searchNorm));
  const matchYear = (year: number) => yearFilter === "all" || String(year) === yearFilter;
  const matchLang = (languageId: string | null) =>
    langFilter === "all" || (langFilter === "none" ? !languageId : languageId === langFilter);

  const filtered = (campaigns ?? []).filter(
    (c) => matchSearch(c) && matchYear(c.year) && matchLang(c.language_id),
  );

  // Visão agrupada: o grupo aparece inteiro (todas as línguas) se uma mesma língua bater com a busca
  // E com o mercado (igual à lista detalhada, para as duas visões acharem as mesmas campanhas)
  const allGroups = useMemo(
    () => groupCampaigns((campaigns ?? []) as CampaignRow[], langById),
    [campaigns, langById],
  );
  const filteredGroups = allGroups.filter(
    (g) => matchYear(g.year) && g.members.some((m) => matchSearch(m) && matchLang(m.language_id)),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campanhas"
        description="Todas as campanhas semanais"
        actions={canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Nova campanha
              </Button>
            </DialogTrigger>
            {open && (
              <NewCampaignDialog
                onCreated={() => {
                  setOpen(false);
                  qc.invalidateQueries({ queryKey: ["campaigns"] });
                  qc.invalidateQueries({ queryKey: ["campaign-siblings"] });
                }}
              />
            )}
          </Dialog>
        )}
      />

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código ou produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={langFilter} onValueChange={setLangFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Mercado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os mercados</SelectItem>
              <SelectItem value="none">Sem mercado</SelectItem>
              {languages.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.flag ? `${l.flag} ` : ""}{l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={view} onValueChange={changeView}>
            <TabsList className="h-9">
              <TabsTrigger value="grouped"><LayoutGrid className="h-4 w-4" /> Agrupada</TabsTrigger>
              <TabsTrigger value="list"><List className="h-4 w-4" /> Lista detalhada</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>

      {view === "grouped" ? (
        isLoading ? (
          <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>
        ) : filteredGroups.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            Nenhuma campanha encontrada.
          </Card>
        ) : (
          <CampaignGroupsView
            groups={filteredGroups}
            langById={langById}
            highlightLangId={langFilter === "all" ? undefined : langFilter}
          />
        )
      ) : (
      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            Nenhuma campanha encontrada.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Mercado</TableHead>
                <TableHead>Semana</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Período</TableHead>

                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const lang = c.language_id ? langById.get(c.language_id) : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                    <TableCell>{c.product_name}</TableCell>
                    <TableCell>
                      {lang ? (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {lang.flag ? `${lang.flag} ` : ""}{lang.code}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{c.week_number}</TableCell>
                    <TableCell>{c.year}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateBR(c.start_date) || formatDateBR(c.end_date) ? (
                        <>
                          {formatDateBR(c.start_date) ?? "—"} <span className="text-muted-foreground">–</span> {formatDateBR(c.end_date) ?? "—"}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant={c.status === "active" ? "success" : "neutral"}>
                        {c.status === "active" ? "Ativa" : "Encerrada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Editar campanha"
                            onClick={() => setEditing(c as CampaignRow)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/campaigns/$campaignId" params={{ campaignId: c.id }}>
                            Ver detalhes
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditCampaignDialog
            campaign={editing}
            onSaved={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["campaigns"] });
              qc.invalidateQueries({ queryKey: ["campaign", editing.id] });
              qc.invalidateQueries({ queryKey: ["sales"] });
              qc.invalidateQueries({ queryKey: ["whatsapp"] });
              qc.invalidateQueries({ queryKey: ["metrics"] });
              qc.invalidateQueries({ queryKey: ["ranking-emails"] });
              qc.invalidateQueries({ queryKey: ["campaigns-list"] });
              qc.invalidateQueries({ queryKey: ["campaign-siblings"] });
              qc.invalidateQueries({ queryKey: ["campaign-metrics"] });
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function NewCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const [week, setWeek] = useState(1);
  const [productId, setProductId] = useState<string>("");
  const [languageId, setLanguageId] = useState<string>("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: languages = [] } = useLanguages();

  // Localizações do produto selecionado
  const { data: productLocs = [] } = useQuery({
    queryKey: ["product-locs", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_localizations")
        .select("language_id, funnel_url, presell_url")
        .eq("product_id", productId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const availableLangs = languages.filter((l) =>
    productLocs.some((loc) => loc.language_id === l.id)
  );
  const selectedLoc = productLocs.find((l) => l.language_id === languageId);

  const selectedProduct = products?.find((p) => p.id === productId);
  const productName = selectedProduct?.name ?? "";

  const selectedLang = languages.find((l) => l.id === languageId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName) return toast.error("Selecione um produto");
    if (!languageId) return toast.error("Selecione um mercado");
    setSubmitting(true);
    const code = buildCampaignCode(week, productName, selectedLang?.code);
    const { error } = await supabase.from("campaigns").insert({
      code,
      product_name: productName,
      week_number: week,
      year,
      start_date: startDate || null,
      end_date: endDate || null,
      language_id: languageId,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Campanha criada");
      onCreated();
    }
  };

  const hasProducts = products && products.length > 0;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nova campanha</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Semana (1-52)</Label>
            <Input
              type="number"
              min={1}
              max={52}
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Ano</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Produto</Label>
          {hasProducts ? (
            <Select value={productId} onValueChange={(v) => { setProductId(v); setLanguageId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um produto" />
              </SelectTrigger>
              <SelectContent>
                {products!.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum produto cadastrado.{" "}
              <Link to="/products" className="text-primary underline">
                Cadastrar produto
              </Link>
            </p>
          )}
          {productName && (
            <p className="text-xs text-muted-foreground">
              Código:{" "}
              <span className="font-mono">
                {buildCampaignCode(week, productName, selectedLang?.code)}
              </span>
            </p>
          )}
        </div>

        {productId && (
          <div className="space-y-2">
            <Label>Mercado</Label>
            {availableLangs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este produto não tem mercados configurados.{" "}
                <Link to="/products" className="text-primary underline">
                  Configurar mercados
                </Link>
              </p>
            ) : (
              <Select value={languageId} onValueChange={setLanguageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um mercado" />
                </SelectTrigger>
                <SelectContent>
                  {availableLangs.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.flag ? `${l.flag} ` : ""}{l.name} ({l.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedLoc && (selectedLoc.funnel_url || selectedLoc.presell_url) && (
              <div className="rounded-md border border-border p-2 text-xs text-muted-foreground space-y-1">
                {selectedLoc.funnel_url && <div className="truncate"><span className="font-medium text-foreground">Funil:</span> {selectedLoc.funnel_url}</div>}
                {selectedLoc.presell_url && <div className="truncate"><span className="font-medium text-foreground">Présell:</span> {selectedLoc.presell_url}</div>}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Início</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fim</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting || !productId || !languageId}>
            {submitting ? "Criando..." : "Criar campanha"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditCampaignDialog({ campaign, onSaved }: { campaign: CampaignRow; onSaved: () => void }) {
  const [productId, setProductId] = useState<string>("");
  const [productName, setProductName] = useState(campaign.product_name);
  const [week, setWeek] = useState(campaign.week_number);
  const [languageId, setLanguageId] = useState<string>(campaign.language_id ?? "");
  const [submitting, setSubmitting] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: languages = [] } = useLanguages();

  // Localizações disponíveis para o produto selecionado (se houver troca de produto)
  const { data: productLocs = [] } = useQuery({
    queryKey: ["product-locs", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_localizations")
        .select("language_id")
        .eq("product_id", productId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const langOptions = productId
    ? languages.filter((l) => productLocs.some((loc) => loc.language_id === l.id))
    : languages;

  const selectedLang = languages.find((l) => l.id === languageId);

  const onProductChange = (v: string) => {
    setProductId(v);
    const p = products?.find((p) => p.id === v);
    if (p) setProductName(p.name);
    // limpa mercado pois pode não existir no novo produto
    setLanguageId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) return toast.error("Informe o nome");
    if (!languageId) return toast.error("Selecione um mercado");
    setSubmitting(true);
    const code = buildCampaignCode(week, productName, selectedLang?.code);
    const { error } = await supabase
      .from("campaigns")
      .update({
        code,
        product_name: productName,
        week_number: week,
        language_id: languageId,
      })
      .eq("id", campaign.id);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success("Campanha atualizada"); onSaved(); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Editar campanha</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Produto (alterar)</Label>
          <Select value={productId} onValueChange={onProductChange}>
            <SelectTrigger><SelectValue placeholder="Selecione para alterar" /></SelectTrigger>
            <SelectContent>
              {(products ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Atual: {campaign.product_name}</p>
        </div>
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Semana (1-52)</Label>
            <Input type="number" min={1} max={52} value={week} onChange={(e) => setWeek(Number(e.target.value))} required />
          </div>
          <div className="space-y-2">
            <Label>Mercado</Label>
            <Select value={languageId} onValueChange={setLanguageId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {langOptions.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.flag ? `${l.flag} ` : ""}{l.name} ({l.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {productId && langOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Este produto não tem mercados configurados.
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Código: <span className="font-mono">{buildCampaignCode(week, productName, selectedLang?.code)}</span>
        </p>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
