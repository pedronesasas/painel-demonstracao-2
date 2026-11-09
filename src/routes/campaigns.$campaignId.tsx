import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Mail, MessageSquare, DollarSign, BarChart3, Pencil, Upload } from "lucide-react";
import { ImportEmailsPanel } from "@/components/import/ImportEmailsPanel";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  formatCurrency,
  formatPercent,
  rate,
  getPhaseFromDate,
  DAYS_OF_WEEK,
  dayToPhase,
  normalizeMergeTags,
} from "@/lib/campaign-utils";
import { useLanguages } from "@/hooks/use-languages";
import { CampaignLanguageSwitcher } from "@/components/campaigns/CampaignLanguageSwitcher";
import {
  TIMING_BADGE,
  TIMING_LABEL,
  campaignTiming,
  currencyOf,
  currencySymbol,
  formatPeriod,
  productSlug,
} from "@/lib/campaign-groups";

// ?tab=emails|whatsapp|sales|import (o /import abre direto na aba "import")
const searchSchema = z.object({
  tab: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/campaigns/$campaignId")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Campanha — NEXUS" },
      { name: "description", content: "Detalhes da campanha." },
      { property: "og:title", content: "Campanha — NEXUS" },
      { property: "og:description", content: "Detalhes da campanha." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="campaigns">
      <AppLayout><CampaignDetailPage /></AppLayout>
    </RequireTabAccess>
  ),
});

const DETAIL_TABS = ["overview", "emails", "whatsapp", "sales", "import"] as const;

// Depois de mexer em e-mails, WhatsApp ou vendas: atualiza a visão geral desta campanha
// e os números da lista agrupada (/campaigns) e da página "Todas as línguas"
function invalidateCampaignNumbers(qc: QueryClient, campaignId: string) {
  qc.invalidateQueries({ queryKey: ["campaign-overview", campaignId] });
  qc.invalidateQueries({ queryKey: ["campaign-metrics"] });
}

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/campaigns/$campaignId" });
  const { canEdit, canEditTab } = useAuth();
  const { data: languages = [] } = useLanguages({ onlyActive: false });

  const { data: campaign } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
      if (error) throw error;
      return data;
    },
  });

  if (!campaign) return <div className="text-muted-foreground">Carregando...</div>;

  // Aba vem da URL (?tab=), assim o seletor de língua mantém a aba aberta
  const canImport = canEditTab("import");
  const activeTab =
    tab && (DETAIL_TABS as readonly string[]).includes(tab) && (tab !== "import" || canImport)
      ? tab
      : "overview";
  const changeTab = (value: string) => {
    navigate({
      search: (prev) => ({ ...prev, tab: value === "overview" ? undefined : value }),
      replace: true,
      resetScroll: false,
    });
  };

  const lang = campaign.language_id ? languages.find((l) => l.id === campaign.language_id) : undefined;
  const currency = currencyOf(lang);
  const timing = campaignTiming(campaign.start_date, campaign.end_date);
  const period = formatPeriod(campaign.start_date, campaign.end_date);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/campaigns">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="font-mono text-sm text-primary">{campaign.code}</div>
          <PageHeader title={campaign.product_name} />
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground items-center">
            <span>Campanha {campaign.week_number} / {campaign.year}</span>
            {period && <span>{period}</span>}
            {/* Situação pelas datas; sem datas, mantém o status do cadastro */}
            {timing !== "unknown" ? (
              <Badge variant={TIMING_BADGE[timing]}>{TIMING_LABEL[timing]}</Badge>
            ) : (
              <Badge variant={campaign.status === "active" ? "success" : "neutral"}>
                {campaign.status === "active" ? "Ativa" : "Encerrada"}
              </Badge>
            )}
          </div>
        </div>
        <CampaignLanguageSwitcher
          year={campaign.year}
          week={campaign.week_number}
          slug={productSlug(campaign.product_name)}
          current={campaign}
          tab={activeTab === "overview" ? undefined : activeTab}
        />
      </div>

      {/* key: ao trocar de língua, as abas recomeçam do zero (nada digitado passa para outra campanha) */}
      <Tabs key={campaignId} value={activeTab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="overview"><BarChart3 className="h-4 w-4" /> Visão geral</TabsTrigger>
          <TabsTrigger value="emails"><Mail className="h-4 w-4" /> E-mails</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageSquare className="h-4 w-4" /> WhatsApp</TabsTrigger>
          <TabsTrigger value="sales"><DollarSign className="h-4 w-4" /> Vendas</TabsTrigger>
          {canImport && (
            <TabsTrigger value="import"><Upload className="h-4 w-4" /> Importar</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <OverviewTab campaignId={campaignId} currency={currency} />
        </TabsContent>
        <TabsContent value="emails" className="mt-4">
          <EmailsTab campaignId={campaignId} canEdit={canEdit} currency={currency} />
        </TabsContent>
        <TabsContent value="whatsapp" className="mt-4">
          <WhatsAppTab campaignId={campaignId} canEdit={canEdit} currency={currency} />
        </TabsContent>
        <TabsContent value="sales" className="mt-4">
          <SalesTab campaignId={campaignId} canEdit={canEdit} currency={currency} />
        </TabsContent>
        {canImport && (
          <TabsContent value="import" className="mt-4">
            <ImportEmailsPanel campaignId={campaignId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function OverviewTab({ campaignId, currency }: { campaignId: string; currency: string }) {
  const { data } = useQuery({
    queryKey: ["campaign-overview", campaignId],
    queryFn: async () => {
      const [emails, wa, waStats, sales] = await Promise.all([
        supabase.from("emails").select("*").eq("campaign_id", campaignId),
        supabase.from("whatsapp_messages").select("*").eq("campaign_id", campaignId),
        supabase.from("whatsapp_stats").select("*").eq("campaign_id", campaignId).maybeSingle(),
        supabase.from("sales").select("*").eq("campaign_id", campaignId).maybeSingle(),
      ]);
      return { emails: emails.data ?? [], wa: wa.data ?? [], waStats: waStats.data, sales: sales.data };
    },
  });

  const emails = data?.emails ?? [];
  const wa = data?.wa ?? [];
  const sent = emails.reduce((s, e) => s + e.sent_count, 0);
  const opened = emails.reduce((s, e) => s + e.opened_count, 0);
  const clicks = emails.reduce((s, e) => s + e.clicked_count, 0);
  const openedHuman = emails.reduce((s, e) => s + numField(e, "opened_human_count"), 0);
  const clicksHuman = emails.reduce((s, e) => s + numField(e, "clicked_human_count"), 0);
  const reactions = wa.reduce((s, m) => s + m.reactions_count, 0);
  // Colunas novas (recipients_count, read_count, revenue_other) ainda fora do types.ts
  const recipients = wa.reduce((s, m) => s + numField(m, "recipients_count"), 0);
  const reads = wa.reduce((s, m) => s + numField(m, "read_count"), 0);
  const totalRev = data?.sales
    ? Number(data.sales.revenue_email) + Number(data.sales.revenue_whatsapp) + numField(data.sales, "revenue_other")
    : 0;
  const conversion = data?.sales && data.sales.leads_count ? data.sales.sales_count / data.sales.leads_count : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <KpiBox label="E-mails enviados" value={sent.toLocaleString("pt-BR")} />
      <KpiBox label="Taxa de abertura" value={formatPercent(rate(opened, sent))} hint={humanHint(openedHuman, sent)} />
      <KpiBox label="CTR" value={formatPercent(rate(clicks, sent))} hint={humanHint(clicksHuman, sent)} />
      <KpiBox label="Receita total" value={formatCurrency(totalRev, currency)} />
      <KpiBox label="Mensagens WhatsApp" value={String(wa.length)} />
      <KpiBox label="Leitura WhatsApp" value={recipients ? formatPercent(rate(reads, recipients)) : "—"} />
      <KpiBox label="Reações totais" value={reactions.toLocaleString("pt-BR")} />
      <KpiBox label="Conversão" value={formatPercent(conversion)} />
    </div>
  );
}

/** Lê um número de uma linha do banco, inclusive coluna que o types.ts ainda não conhece (ausente = 0) */
function numField(row: unknown, key: string): number {
  const v = Number((row as Record<string, unknown> | null | undefined)?.[key] ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** "8,80% humanas": a GetResponse separa aberturas e cliques de pessoas dos feitos por robôs (ex.: Apple Mail) */
function humanHint(human: number, sent: number): string | undefined {
  return human > 0 ? `${formatPercent(rate(human, sent))} humanas` : undefined;
}

function KpiBox({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

type EmailRow = {
  id: string; subject: string; sent_at: string | null; phase: string;
  sent_count: number; opened_count: number; clicked_count: number;
  unsubscribed_count: number; sales_count: number;
  // Colunas novas (migração 20261013150000); numeric pode vir como texto
  revenue?: number | string | null; bounced_count?: number | null; complaints_count?: number | null;
  // Aberturas e cliques só de pessoas (sem robôs) e o ID da mensagem na GetResponse
  opened_human_count?: number | null; clicked_human_count?: number | null; getresponse_id?: string | null;
};

function EmailsTab({ campaignId, canEdit, currency }: { campaignId: string; canEdit: boolean; currency: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EmailRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phaseFilter, setPhaseFilter] = useState<"all" | "nurture" | "sale">("all");
  const { data: allEmails } = useQuery({
    queryKey: ["emails", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data as EmailRow[];
    },
  });
  const emails = phaseFilter === "all" ? allEmails : allEmails?.filter((e) => e.phase === phaseFilter);


  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => { const next = new Set(prev); if (checked) next.add(id); else next.delete(id); return next; });
  };
  const toggleAll = (checked: boolean) => {
    if (!emails) return;
    setSelected(checked ? new Set(emails.map((e) => e.id)) : new Set());
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir este e-mail?")) return;
    const { error } = await supabase.from("emails").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["emails", campaignId] }); invalidateCampaignNumbers(qc, campaignId); }
  };
  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Excluir ${ids.length} e-mail(s) selecionado(s)?`)) return;
    const { error } = await supabase.from("emails").delete().in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} excluído(s)`); setSelected(new Set()); qc.invalidateQueries({ queryKey: ["emails", campaignId] }); invalidateCampaignNumbers(qc, campaignId); }
  };

  const allChecked = !!emails && emails.length > 0 && selected.size === emails.length;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>E-mails da campanha</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={phaseFilter} onValueChange={(v) => setPhaseFilter(v as "all" | "nurture" | "sale")}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fases</SelectItem>
              <SelectItem value="nurture">Só nutrição</SelectItem>
              <SelectItem value="sale">Só venda</SelectItem>
            </SelectContent>
          </Select>

          {canEdit && selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4" /> Excluir ({selected.size})
            </Button>
          )}
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4" /> Adicionar</Button>
              </DialogTrigger>
              {open && (
                <EmailFormDialog
                  campaignId={campaignId}
                  email={null}
                  currency={currency}
                  onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["emails", campaignId] }); qc.invalidateQueries({ queryKey: ["ranking-emails"] }); invalidateCampaignNumbers(qc, campaignId); }}
                />
              )}
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!emails || emails.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhum e-mail ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {canEdit && (
                  <TableHead className="w-10">
                    <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Selecionar todos" />
                  </TableHead>
                )}
                <TableHead>Assunto</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Enviados</TableHead>
                <TableHead className="text-right">Abertura</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Desc.</TableHead>
                <TableHead className="text-right" title="Não entregues">Bounce</TableHead>
                <TableHead className="text-right" title="Marcaram como spam">Spam</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                {canEdit && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((e) => (
                <TableRow key={e.id} data-state={selected.has(e.id) ? "selected" : undefined}>
                  {canEdit && (
                    <TableCell>
                      <Checkbox checked={selected.has(e.id)} onCheckedChange={(v) => toggleOne(e.id, v === true)} aria-label={`Selecionar ${e.subject}`} />
                    </TableCell>
                  )}
                  <TableCell className="max-w-xs truncate">{normalizeMergeTags(e.subject)}</TableCell>
                  <TableCell><PhaseBadge phase={e.phase as "nurture" | "sale"} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.sent_at ? new Date(e.sent_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-right">{e.sent_count.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">
                    {formatPercent(rate(e.opened_count, e.sent_count))}
                    <HumanRate human={numField(e, "opened_human_count")} sent={e.sent_count} />
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(rate(e.clicked_count, e.sent_count))}
                    <HumanRate human={numField(e, "clicked_human_count")} sent={e.sent_count} />
                  </TableCell>
                  <TableCell className="text-right">{formatPercent(rate(e.unsubscribed_count, e.sent_count))}</TableCell>
                  <TableCell className="text-right">{formatPercent(rate(numField(e, "bounced_count"), e.sent_count))}</TableCell>
                  <TableCell className="text-right">{numField(e, "complaints_count").toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right font-semibold">{(e.sales_count ?? 0).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{formatCurrency(numField(e, "revenue"), currency)}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(e)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EmailFormDialog
            campaignId={campaignId}
            email={editing}
            currency={currency}
            onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["emails", campaignId] }); qc.invalidateQueries({ queryKey: ["ranking-emails"] }); invalidateCampaignNumbers(qc, campaignId); }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function HumanRate({ human, sent }: { human: number; sent: number }) {
  const hint = humanHint(human, sent);
  return hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null;
}

function PhaseBadge({ phase }: { phase: "nurture" | "sale" }) {
  if (phase === "nurture") return <Badge className="bg-nurture/20 text-nurture border-nurture/40">Nutrição</Badge>;
  return <Badge className="bg-sale/20 text-sale border-sale/40">Venda</Badge>;
}

function EmailFormDialog({ campaignId, email, currency, onSaved }: { campaignId: string; email: EmailRow | null; currency: string; onSaved: () => void }) {
  const [subject, setSubject] = useState(normalizeMergeTags(email?.subject ?? ""));
  const [sentAt, setSentAt] = useState(email?.sent_at ? email.sent_at.slice(0, 10) : "");
  const [phase, setPhase] = useState<"nurture" | "sale">((email?.phase as "nurture" | "sale") ?? "nurture");
  const [sent, setSent] = useState(email?.sent_count ?? 0);
  const [opened, setOpened] = useState(email?.opened_count ?? 0);
  const [clicked, setClicked] = useState(email?.clicked_count ?? 0);
  const [openedHuman, setOpenedHuman] = useState(numField(email, "opened_human_count"));
  const [clickedHuman, setClickedHuman] = useState(numField(email, "clicked_human_count"));
  const [unsub, setUnsub] = useState(email?.unsubscribed_count ?? 0);
  const [salesCount, setSalesCount] = useState(email?.sales_count ?? 0);
  const [revenue, setRevenue] = useState(numField(email, "revenue"));
  const [bounced, setBounced] = useState(numField(email, "bounced_count"));
  const [complaints, setComplaints] = useState(numField(email, "complaints_count"));
  const [submitting, setSubmitting] = useState(false);

  const handleDateChange = (v: string) => { setSentAt(v); if (v) setPhase(getPhaseFromDate(v)); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      campaign_id: campaignId,
      subject: normalizeMergeTags(subject),
      sent_at: sentAt || null,
      phase,
      sent_count: sent,
      opened_count: opened,
      clicked_count: clicked,
      opened_human_count: openedHuman,
      clicked_human_count: clickedHuman,
      unsubscribed_count: unsub,
      sales_count: salesCount,
      revenue,
      bounced_count: bounced,
      complaints_count: complaints,
    };
    // "as never": colunas novas ainda fora do types.ts gerado
    const { error } = email
      ? await supabase.from("emails").update(payload as never).eq("id", email.id)
      : await supabase.from("emails").insert(payload as never);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success(email ? "E-mail atualizado" : "E-mail adicionado"); onSaved(); }
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{email ? "Editar e-mail" : "Novo e-mail"}</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Assunto / Conteúdo</Label>
          <Textarea value={subject} onChange={(e) => setSubject(e.target.value)} required rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Data de envio</Label>
            <Input type="date" value={sentAt} onChange={(e) => handleDateChange(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fase</Label>
            <Select value={phase} onValueChange={(v) => setPhase(v as "nurture" | "sale")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nurture">Nutrição (seg-sex)</SelectItem>
                <SelectItem value="sale">Venda (sáb-dom)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2"><Label>Enviados</Label><Input type="number" min={0} value={sent} onChange={(e) => setSent(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Abertos</Label><Input type="number" min={0} value={opened} onChange={(e) => setOpened(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Cliques</Label><Input type="number" min={0} value={clicked} onChange={(e) => setClicked(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label title="Sem robôs">Abertos (humanos)</Label><Input type="number" min={0} value={openedHuman} onChange={(e) => setOpenedHuman(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label title="Sem robôs">Cliques (humanos)</Label><Input type="number" min={0} value={clickedHuman} onChange={(e) => setClickedHuman(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Desc.</Label><Input type="number" min={0} value={unsub} onChange={(e) => setUnsub(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Bounces</Label><Input type="number" min={0} value={bounced} onChange={(e) => setBounced(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Spam</Label><Input type="number" min={0} value={complaints} onChange={(e) => setComplaints(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Vendas</Label><Input type="number" min={0} value={salesCount} onChange={(e) => setSalesCount(Number(e.target.value))} /></div>
          <div className="space-y-2"><Label>Receita ({currencySymbol(currency)})</Label><Input type="number" min={0} step="0.01" value={revenue} onChange={(e) => setRevenue(Number(e.target.value))} /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

type WaRow = {
  id: string; message: string; day_of_week: string; sent_time: string | null;
  phase: string; reactions_count: number; sales_count: number;
  // Colunas novas (migração 20261013150000); numeric pode vir como texto
  recipients_count?: number | null; read_count?: number | null; revenue?: number | string | null;
};

function WhatsAppTab({ campaignId, canEdit, currency }: { campaignId: string; canEdit: boolean; currency: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WaRow | null>(null);
  const [members, setMembers] = useState(0);
  // "" = manter o valor salvo (mesmo padrão da aba Vendas)
  const [joined, setJoined] = useState("");
  const [left, setLeft] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phaseFilter, setPhaseFilter] = useState<"all" | "nurture" | "sale">("all");

  const { data } = useQuery({
    queryKey: ["whatsapp", campaignId],
    queryFn: async () => {
      const [msgs, stats] = await Promise.all([
        supabase.from("whatsapp_messages").select("*").eq("campaign_id", campaignId).order("created_at"),
        supabase.from("whatsapp_stats").select("*").eq("campaign_id", campaignId).maybeSingle(),
      ]);
      return { msgs: (msgs.data ?? []) as WaRow[], stats: stats.data };
    },
  });

  const allMessages = data?.msgs ?? [];
  const messages = phaseFilter === "all" ? allMessages : allMessages.filter((m) => m.phase === phaseFilter);
  const totalReactions = messages.reduce((s, m) => s + m.reactions_count, 0);

  const memberCount = data?.stats?.members_count ?? 0;
  const engagement = memberCount && messages.length ? totalReactions / (memberCount * messages.length) : 0;
  const totalRecipients = messages.reduce((s, m) => s + numField(m, "recipients_count"), 0);
  const totalReads = messages.reduce((s, m) => s + numField(m, "read_count"), 0);
  const savedJoined = numField(data?.stats, "joined_count");
  const savedLeft = numField(data?.stats, "left_count");

  const saveMembers = async () => {
    const payload = {
      campaign_id: campaignId,
      // Sem digitar, mantém o número salvo (antes gravava 0 por engano)
      members_count: members || memberCount,
      joined_count: joined !== "" ? Number(joined) : savedJoined,
      left_count: left !== "" ? Number(left) : savedLeft,
      updated_at: new Date().toISOString(),
    };
    // "as never": colunas novas ainda fora do types.ts gerado
    const { error } = await supabase.from("whatsapp_stats").upsert(payload as never, { onConflict: "campaign_id" });
    if (error) toast.error(error.message);
    else {
      toast.success("Grupos atualizados");
      setJoined("");
      setLeft("");
      qc.invalidateQueries({ queryKey: ["whatsapp", campaignId] });
      invalidateCampaignNumbers(qc, campaignId);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir esta mensagem?")) return;
    await supabase.from("whatsapp_messages").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["whatsapp", campaignId] });
    invalidateCampaignNumbers(qc, campaignId);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => { const next = new Set(prev); if (checked) next.add(id); else next.delete(id); return next; });
  };
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(messages.map((m) => m.id)) : new Set());
  };
  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Excluir ${ids.length} mensagem(ns) selecionada(s)?`)) return;
    const { error } = await supabase.from("whatsapp_messages").delete().in("id", ids);
    if (error) toast.error(error.message);
    else {
      toast.success(`${ids.length} mensagem(ns) excluída(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["whatsapp", campaignId] });
      invalidateCampaignNumbers(qc, campaignId);
    }
  };

  const allChecked = messages.length > 0 && selected.size === messages.length;
  const someChecked = selected.size > 0 && !allChecked;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["whatsapp", campaignId] }); qc.invalidateQueries({ queryKey: ["ranking-whatsapp"] }); invalidateCampaignNumbers(qc, campaignId); };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <KpiBox label="Mensagens" value={String(messages.length)} />
        <KpiBox label="Membros" value={memberCount.toLocaleString("pt-BR")} />
        <KpiBox
          label="Entraram / saíram na campanha"
          value={`+${savedJoined.toLocaleString("pt-BR")} / −${savedLeft.toLocaleString("pt-BR")}`}
        />
        <KpiBox label="Leitura média" value={totalRecipients ? formatPercent(rate(totalReads, totalRecipients)) : "—"} />
        <KpiBox label="Reações totais" value={totalReactions.toLocaleString("pt-BR")} />
        <KpiBox label="Engajamento médio" value={formatPercent(engagement)} />
      </div>

      {canEdit && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2 flex-1 min-w-[160px] max-w-xs">
              <Label>Membros nos grupos</Label>
              <Input type="number" min={0} value={members || memberCount} onChange={(e) => setMembers(Number(e.target.value))} />
            </div>
            <div className="space-y-2 w-36">
              <Label>Entraram na campanha</Label>
              <Input type="number" min={0} value={joined} placeholder={String(savedJoined)} onChange={(e) => setJoined(e.target.value)} />
            </div>
            <div className="space-y-2 w-36">
              <Label>Saíram na campanha</Label>
              <Input type="number" min={0} value={left} placeholder={String(savedLeft)} onChange={(e) => setLeft(e.target.value)} />
            </div>
            <Button onClick={saveMembers}>Salvar</Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Mensagens</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={phaseFilter} onValueChange={(v) => setPhaseFilter(v as "all" | "nurture" | "sale")}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as fases</SelectItem>
                <SelectItem value="nurture">Só nutrição</SelectItem>
                <SelectItem value="sale">Só venda</SelectItem>
              </SelectContent>
            </Select>

            {canEdit && selected.size > 0 && (
              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                <Trash2 className="h-4 w-4" /> Excluir ({selected.size})
              </Button>
            )}
            {canEdit && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" /> Adicionar</Button>
                </DialogTrigger>
                {open && (
                  <WhatsAppFormDialog campaignId={campaignId} message={null} currency={currency} onSaved={() => { setOpen(false); refresh(); }} />
                )}
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma mensagem ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {canEdit && (
                    <TableHead className="w-10">
                      <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Selecionar todas" />
                    </TableHead>
                  )}
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Dia</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead className="text-right" title="Pessoas nos grupos no envio">Pessoas</TableHead>
                  <TableHead className="text-right">Leram</TableHead>
                  <TableHead className="text-right">Reações</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  {canEdit && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => (
                  <TableRow key={m.id} data-state={selected.has(m.id) ? "selected" : undefined}>
                    {canEdit && (
                      <TableCell>
                        <Checkbox checked={selected.has(m.id)} onCheckedChange={(v) => toggleOne(m.id, v === true)} aria-label="Selecionar mensagem" />
                      </TableCell>
                    )}
                    <TableCell className="max-w-md truncate">{m.message}</TableCell>
                    <TableCell>{m.day_of_week}</TableCell>
                    <TableCell>{m.sent_time?.slice(0, 5) ?? "—"}</TableCell>
                    <TableCell><PhaseBadge phase={m.phase as "nurture" | "sale"} /></TableCell>
                    <TableCell className="text-right">{numField(m, "recipients_count").toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      {numField(m, "read_count").toLocaleString("pt-BR")}
                      {numField(m, "recipients_count") > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({formatPercent(rate(numField(m, "read_count"), numField(m, "recipients_count")))})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{m.reactions_count}</TableCell>
                    <TableCell className="text-right font-semibold">{(m.sales_count ?? 0).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right">{formatCurrency(numField(m, "revenue"), currency)}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditing(m)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <WhatsAppFormDialog campaignId={campaignId} message={editing} currency={currency} onSaved={() => { setEditing(null); refresh(); }} />
        )}
      </Dialog>
    </div>
  );
}

function WhatsAppFormDialog({ campaignId, message, currency, onSaved }: { campaignId: string; message: WaRow | null; currency: string; onSaved: () => void }) {
  const [text, setText] = useState(message?.message ?? "");
  const [day, setDay] = useState<string>(message?.day_of_week ?? "Segunda");
  const [time, setTime] = useState(message?.sent_time?.slice(0, 5) ?? "");
  const [phase, setPhase] = useState<"nurture" | "sale">((message?.phase as "nurture" | "sale") ?? "nurture");
  const [reactions, setReactions] = useState(message?.reactions_count ?? 0);
  const [salesCount, setSalesCount] = useState(message?.sales_count ?? 0);
  const [recipients, setRecipients] = useState(numField(message, "recipients_count"));
  const [reads, setReads] = useState(numField(message, "read_count"));
  const [revenue, setRevenue] = useState(numField(message, "revenue"));

  const handleDayChange = (v: string) => { setDay(v); setPhase(dayToPhase(v)); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      campaign_id: campaignId,
      message: text,
      day_of_week: day,
      sent_time: time || null,
      phase,
      reactions_count: reactions,
      sales_count: salesCount,
      recipients_count: recipients,
      read_count: reads,
      revenue,
    };
    // "as never": colunas novas ainda fora do types.ts gerado
    const { error } = message
      ? await supabase.from("whatsapp_messages").update(payload as never).eq("id", message.id)
      : await supabase.from("whatsapp_messages").insert(payload as never);
    if (error) toast.error(error.message);
    else { toast.success(message ? "Mensagem atualizada" : "Mensagem adicionada"); onSaved(); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{message ? "Editar mensagem" : "Nova mensagem WhatsApp"}</DialogTitle></DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Mensagem</Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} required rows={4} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Dia</Label>
            <Select value={day} onValueChange={handleDayChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Horário</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fase</Label>
            <Select value={phase} onValueChange={(v) => setPhase(v as "nurture" | "sale")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nurture">Nutrição</SelectItem>
                <SelectItem value="sale">Venda</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Pessoas nos grupos</Label>
            <Input type="number" min={0} value={recipients} onChange={(e) => setRecipients(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Leram</Label>
            <Input type="number" min={0} value={reads} onChange={(e) => setReads(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Reações</Label>
            <Input type="number" min={0} value={reactions} onChange={(e) => setReactions(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Vendas</Label>
            <Input type="number" min={0} value={salesCount} onChange={(e) => setSalesCount(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Receita ({currencySymbol(currency)})</Label>
            <Input type="number" min={0} step="0.01" value={revenue} onChange={(e) => setRevenue(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function SalesTab({ campaignId, canEdit, currency }: { campaignId: string; canEdit: boolean; currency: string }) {
  const qc = useQueryClient();
  const { data: sales } = useQuery({
    queryKey: ["sales", campaignId],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*").eq("campaign_id", campaignId).maybeSingle();
      return data;
    },
  });

  const [revEmail, setRevEmail] = useState<string>("");
  const [revWa, setRevWa] = useState<string>("");
  const [leads, setLeads] = useState<string>("");
  const [salesCount, setSalesCount] = useState<string>("");
  const [revOther, setRevOther] = useState<string>("");
  const [salesEmail, setSalesEmail] = useState<string>("");
  const [salesWa, setSalesWa] = useState<string>("");
  const [salesOther, setSalesOther] = useState<string>("");

  // "" = manter o valor salvo; colunas novas lidas com numField (fora do types.ts)
  const current = {
    revEmail: revEmail !== "" ? Number(revEmail) : Number(sales?.revenue_email ?? 0),
    revWa: revWa !== "" ? Number(revWa) : Number(sales?.revenue_whatsapp ?? 0),
    revOther: revOther !== "" ? Number(revOther) : numField(sales, "revenue_other"),
    leads: leads !== "" ? Number(leads) : sales?.leads_count ?? 0,
    salesCount: salesCount !== "" ? Number(salesCount) : sales?.sales_count ?? 0,
    salesEmail: salesEmail !== "" ? Number(salesEmail) : numField(sales, "sales_email_count"),
    salesWa: salesWa !== "" ? Number(salesWa) : numField(sales, "sales_whatsapp_count"),
    salesOther: salesOther !== "" ? Number(salesOther) : numField(sales, "sales_other_count"),
  };

  const totalRev = current.revEmail + current.revWa + current.revOther;
  const channelSales = current.salesEmail + current.salesWa + current.salesOther;
  const ticket = current.salesCount ? totalRev / current.salesCount : 0;
  const conv = current.leads ? current.salesCount / current.leads : 0;

  const save = async () => {
    const { error } = await supabase.from("sales").upsert(
      {
        campaign_id: campaignId,
        revenue_email: current.revEmail,
        revenue_whatsapp: current.revWa,
        revenue_other: current.revOther,
        leads_count: current.leads,
        sales_count: current.salesCount,
        sales_email_count: current.salesEmail,
        sales_whatsapp_count: current.salesWa,
        sales_other_count: current.salesOther,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "campaign_id" },
    );
    if (error) toast.error(error.message);
    else {
      toast.success("Vendas atualizadas");
      setRevEmail(""); setRevWa(""); setRevOther(""); setLeads("");
      setSalesCount(""); setSalesEmail(""); setSalesWa(""); setSalesOther("");
      qc.invalidateQueries({ queryKey: ["sales", campaignId] });
      invalidateCampaignNumbers(qc, campaignId);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <KpiBox label="Receita E-mail" value={formatCurrency(current.revEmail, currency)} />
        <KpiBox label="Receita WhatsApp" value={formatCurrency(current.revWa, currency)} />
        <KpiBox label="Receita outras origens" value={formatCurrency(current.revOther, currency)} />
        <KpiBox label="Receita total" value={formatCurrency(totalRev, currency)} />
        <KpiBox label="Vendas" value={String(current.salesCount)} />
        <KpiBox
          label="Vendas: e-mail / WhatsApp / outras"
          value={`${current.salesEmail} / ${current.salesWa} / ${current.salesOther}`}
        />
        <KpiBox label="Ticket médio" value={formatCurrency(ticket, currency)} />
        <KpiBox label="Leads" value={String(current.leads)} />
        <KpiBox label="Conversão" value={formatPercent(conv)} />
      </div>
      {channelSales > 0 && channelSales !== current.salesCount && (
        <p className="text-xs text-muted-foreground">
          A soma das vendas por canal ({channelSales}) é diferente do total de vendas ({current.salesCount}).
        </p>
      )}

      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Atualizar dados de venda</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Receita E-mail ({currencySymbol(currency)})</Label>
                <Input type="number" step="0.01" value={revEmail} placeholder={String(sales?.revenue_email ?? 0)} onChange={(e) => setRevEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Receita WhatsApp ({currencySymbol(currency)})</Label>
                <Input type="number" step="0.01" value={revWa} placeholder={String(sales?.revenue_whatsapp ?? 0)} onChange={(e) => setRevWa(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Receita outras origens ({currencySymbol(currency)})</Label>
                <Input type="number" step="0.01" value={revOther} placeholder={String(numField(sales, "revenue_other"))} onChange={(e) => setRevOther(e.target.value)} />
                <p className="text-xs text-muted-foreground">Vendas sem UTM de e-mail ou WhatsApp.</p>
              </div>
              <div className="space-y-2">
                <Label>Leads</Label>
                <Input type="number" min={0} value={leads} placeholder={String(sales?.leads_count ?? 0)} onChange={(e) => setLeads(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Vendas (total)</Label>
                <Input type="number" min={0} value={salesCount} placeholder={String(sales?.sales_count ?? 0)} onChange={(e) => setSalesCount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Vendas pelo e-mail</Label>
                <Input type="number" min={0} value={salesEmail} placeholder={String(numField(sales, "sales_email_count"))} onChange={(e) => setSalesEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Vendas pelo WhatsApp</Label>
                <Input type="number" min={0} value={salesWa} placeholder={String(numField(sales, "sales_whatsapp_count"))} onChange={(e) => setSalesWa(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Vendas de outras origens</Label>
                <Input type="number" min={0} value={salesOther} placeholder={String(numField(sales, "sales_other_count"))} onChange={(e) => setSalesOther(e.target.value)} />
              </div>
            </div>
            <Button onClick={save}>Salvar vendas</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
