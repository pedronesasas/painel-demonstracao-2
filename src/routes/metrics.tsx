import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRL } from "@/lib/campaign-utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Mail, MessageSquare, DollarSign, Trophy, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguages, languageLabel } from "@/hooks/use-languages";
import { PageHeader } from "@/components/PageHeader";
import { chartAxisProps, chartGridProps, chartTooltipProps } from "@/lib/chart-theme";

export const Route = createFileRoute("/metrics")({
  head: () => ({
    meta: [
      { title: "Dashboard — NEXUS" },
      { name: "description", content: "Painel de métricas das campanhas." },
      { property: "og:title", content: "Dashboard — NEXUS" },
      { property: "og:description", content: "Painel de métricas das campanhas." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="dashboard">
      <AppLayout><MetricsPage /></AppLayout>
    </RequireTabAccess>
  ),
});

function MetricsPage() {
  const [langFilter, setLangFilter] = useState<string>("all");
  const { data: languages = [] } = useLanguages();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-overview"],
    staleTime: 60_000,
    queryFn: async () => {
      const [campaignsRes, salesRes, emailsRes, waRes] = await Promise.all([
        supabase.from("campaigns").select("id, code, product_name, week_number, year, language_id").order("year", { ascending: false }).order("week_number", { ascending: true }).range(0, 4999),
        // revenue_other vem pelo "*": coluna nova ainda fora do types.ts gerado
        supabase.from("sales").select("*").range(0, 4999),
        supabase.from("emails").select("campaign_id, sent_count, opened_count, clicked_count").range(0, 9999),
        supabase.from("whatsapp_messages").select("campaign_id, reactions_count").range(0, 9999),
      ]);
      return {
        campaigns: campaignsRes.data ?? [],
        sales: salesRes.data ?? [],
        emails: emailsRes.data ?? [],
        whatsapp: waRes.data ?? [],
      };
    },
  });

  const filtered = useMemo(() => {
    const allCampaigns = data?.campaigns ?? [];
    const filteredCampaigns = langFilter === "all"
      ? allCampaigns
      : langFilter === "none"
        ? allCampaigns.filter((c) => !c.language_id)
        : allCampaigns.filter((c) => c.language_id === langFilter);
    const ids = new Set(filteredCampaigns.map((c) => c.id));
    return {
      campaigns: filteredCampaigns,
      sales: (data?.sales ?? []).filter((s) => ids.has(s.campaign_id)),
      emails: (data?.emails ?? []).filter((e) => ids.has(e.campaign_id)),
      whatsapp: (data?.whatsapp ?? []).filter((w) => ids.has(w.campaign_id)),
    };
  }, [data, langFilter]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    );
  }

  const campaigns = filtered.campaigns;
  const sales = filtered.sales;
  const emails = filtered.emails;
  const whatsapp = filtered.whatsapp;

  const revenueOfSale = (r: (typeof sales)[number]) =>
    Number(r.revenue_email) + Number(r.revenue_whatsapp) + Number((r as Record<string, unknown>).revenue_other ?? 0);
  const totalRevenue = sales.reduce((s, r) => s + revenueOfSale(r), 0);
  const totalSales = sales.reduce((s, r) => s + r.sales_count, 0);
  const totalLeads = sales.reduce((m, r) => Math.max(m, r.leads_count), 0);
  const totalSent = emails.reduce((s, e) => s + e.sent_count, 0);
  const totalOpened = emails.reduce((s, e) => s + e.opened_count, 0);
  const openRate = totalSent ? (totalOpened / totalSent) * 100 : 0;
  const totalReactions = whatsapp.reduce((s, m) => s + m.reactions_count, 0);

  const revenueByCampaign = campaigns
    .map((c) => {
      const s = sales.find((x) => x.campaign_id === c.id);
      return { name: c.code, receita: s ? revenueOfSale(s) : 0 };
    })
    .filter((x) => x.receita > 0)
    .slice(0, 12);

  return (
    <div className="space-y-6">
      {/* Filtro abaixo do título: ao lado, com o botão, apertaria o título no tablet */}
      <PageHeader
        title="Dashboard"
        description="Visão geral de todas as suas campanhas"
        actions={
          <Button asChild>
            <Link to="/campaigns"><Plus className="h-4 w-4" /> Nova campanha</Link>
          </Button>
        }
      >
        <Select value={langFilter} onValueChange={setLangFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Mercado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os mercados</SelectItem>
            {languages.map((l) => (
              <SelectItem key={l.id} value={l.id}>{languageLabel(l)}</SelectItem>
            ))}
            <SelectItem value="none">Sem mercado</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<DollarSign className="h-5 w-5" />} label="Receita total" value={formatCurrencyBRL(totalRevenue)} accent="from-primary to-sale" />
        <KpiCard icon={<Trophy className="h-5 w-5" />} label="Vendas" value={`${totalSales} • ${totalLeads} leads`} accent="from-primary to-primary-glow" />
        <KpiCard icon={<Mail className="h-5 w-5" />} label="Taxa de abertura" value={`${openRate.toFixed(1)}%`} sub={`${totalSent.toLocaleString("pt-BR")} enviados`} accent="from-nurture to-primary" />
        <KpiCard icon={<MessageSquare className="h-5 w-5" />} label="Reações WhatsApp" value={totalReactions.toLocaleString("pt-BR")} sub={`${whatsapp.length} mensagens`} accent="from-sale to-primary" />
      </div>

      <Card>
        <CardHeader><CardTitle>Receita por campanha</CardTitle></CardHeader>
        <CardContent>
          {revenueByCampaign.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Nenhuma campanha com receita ainda.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenueByCampaign}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="name" {...chartAxisProps} />
                <YAxis {...chartAxisProps} />
                <Tooltip {...chartTooltipProps} formatter={(v) => formatCurrencyBRL(Number(v))} />
                <Bar dataKey="receita" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Campanhas recentes</CardTitle></CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma campanha cadastrada. <Link to="/campaigns" className="text-primary underline">Criar primeira campanha</Link>
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {campaigns.slice(0, 6).map((c) => (
                <Link key={c.id} to="/campaigns/$campaignId" params={{ campaignId: c.id }}
                  className="rounded-lg border border-border bg-card/60 px-4 py-3 hover:border-border-strong hover:bg-card-hover transition-colors">
                  <div className="text-sm font-semibold">{c.code}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.product_name}</div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <Card className="overflow-hidden relative">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-primary">{icon}</span>
        </div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
