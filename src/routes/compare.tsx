import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyBRL, formatPercent, rate } from "@/lib/campaign-utils";
import { useLanguages } from "@/hooks/use-languages";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Comparar — NEXUS" },
      { name: "description", content: "Comparação entre campanhas." },
      { property: "og:title", content: "Comparar — NEXUS" },
      { property: "og:description", content: "Comparação entre campanhas." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="compare">
      <AppLayout><ComparePage /></AppLayout>
    </RequireTabAccess>
  ),
});

function ComparePage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [langFilter, setLangFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<"all" | "nurture" | "sale">("all");
  const { data: languages = [] } = useLanguages();
  const langById = useMemo(() => new Map(languages.map((l) => [l.id, l])), [languages]);

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns-compare"],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("id, code, product_name, year, week_number, language_id").order("year", { ascending: false }).order("week_number");
      return data ?? [];
    },
  });

  const visibleCampaigns = (campaigns ?? []).filter((c) =>
    langFilter === "all" ? true
      : langFilter === "none" ? !c.language_id
      : c.language_id === langFilter
  );

  const { data: details } = useQuery({
    queryKey: ["compare-details", selected, phaseFilter],
    enabled: selected.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campaign_compare_metrics_by_phase", { _campaign_ids: selected, _phase: phaseFilter });
      if (error) throw error;
      return (data ?? []) as Array<{
        campaign_id: string;
        emails_sent: number; emails_opened: number; emails_clicked: number; emails_unsubscribed: number;
        wa_messages: number; wa_reactions: number; wa_members: number;
        revenue_email: number | string; revenue_whatsapp: number | string;
        leads_count: number; sales_count: number;
        // Colunas novas do RPC (migração 20261013150000); ausentes antes dela
        wa_recipients?: number; wa_reads?: number; revenue_other?: number | string;
      }>;
    },
  });

  const toggle = (id: string) => {
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const rows = selected.map((id) => {
    const c = campaigns?.find((x) => x.id === id);
    const m = (details ?? []).find((x) => x.campaign_id === id);
    const sent = m?.emails_sent ?? 0;
    const opened = m?.emails_opened ?? 0;
    const clicked = m?.emails_clicked ?? 0;
    const messages = m?.wa_messages ?? 0;
    const reactions = m?.wa_reactions ?? 0;
    const members = m?.wa_members ?? 0;
    const totalRev =
      Number(m?.revenue_email ?? 0) + Number(m?.revenue_whatsapp ?? 0) + Number(m?.revenue_other ?? 0);
    const recipients = Number(m?.wa_recipients ?? 0);
    return {
      id,
      code: c?.code ?? "",
      sent,
      open: rate(opened, sent),
      ctr: rate(clicked, sent),
      messages,
      reactions,
      engagement: members && messages ? reactions / (members * messages) : 0,
      readRate: recipients ? rate(Number(m?.wa_reads ?? 0), recipients) : null,
      revenue: totalRev,
      conversion: m && m.leads_count ? m.sales_count / m.leads_count : 0,
    };
  });


  return (
    <div className="space-y-6">
      {/* Filtros abaixo do título, como em Dashboard e Relatórios: ao lado apertariam o título no tablet */}
      <PageHeader
        title="Comparar campanhas"
        description="Selecione duas ou mais campanhas para comparar."
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-48">
            <Select value={phaseFilter} onValueChange={(v) => setPhaseFilter(v as "all" | "nurture" | "sale")}>
              <SelectTrigger><SelectValue placeholder="Fase" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as fases</SelectItem>
                <SelectItem value="nurture">Somente nutrição</SelectItem>
                <SelectItem value="sale">Somente venda</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-56">
            <Select value={langFilter} onValueChange={setLangFilter}>
              <SelectTrigger><SelectValue placeholder="Mercado" /></SelectTrigger>
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
          </div>
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Campanhas</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-3">
              <div className="space-y-2">
                {visibleCampaigns.map((c) => {
                  const lang = c.language_id ? langById.get(c.language_id) : null;
                  return (
                    <label key={c.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/40 cursor-pointer">
                      <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
                      <div className="text-sm min-w-0 flex-1">
                        <div className="font-mono font-semibold">{c.code}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.product_name}</div>
                        {lang && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {lang.flag ? `${lang.flag} ` : ""}{lang.code}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Comparação</CardTitle></CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Selecione ao menos uma campanha à esquerda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Métrica</TableHead>
                    {rows.map((r) => <TableHead key={r.id} className="text-right font-mono">{r.code}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <CompareRow label="E-mails enviados" rows={rows} get={(r) => r.sent.toLocaleString("pt-BR")} />
                  <CompareRow label="Taxa de abertura" rows={rows} get={(r) => formatPercent(r.open)} />
                  <CompareRow label="CTR" rows={rows} get={(r) => formatPercent(r.ctr)} />
                  <CompareRow label="Mensagens WhatsApp" rows={rows} get={(r) => String(r.messages)} />
                  <CompareRow label="Leitura WhatsApp" rows={rows} get={(r) => (r.readRate === null ? "—" : formatPercent(r.readRate))} />
                  <CompareRow label="Reações totais" rows={rows} get={(r) => r.reactions.toLocaleString("pt-BR")} />
                  <CompareRow label="Engajamento médio" rows={rows} get={(r) => formatPercent(r.engagement)} />
                  {phaseFilter === "all" && (
                    <>
                      <CompareRow label="Receita total" rows={rows} get={(r) => formatCurrencyBRL(r.revenue)} />
                      <CompareRow label="Conversão" rows={rows} get={(r) => formatPercent(r.conversion)} />
                    </>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CompareRow({ label, rows, get }: { label: string; rows: Array<{ id: string }>; get: (r: any) => string }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      {rows.map((r) => <TableCell key={r.id} className="text-right">{get(r)}</TableCell>)}
    </TableRow>
  );
}
