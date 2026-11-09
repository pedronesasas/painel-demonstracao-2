import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPercent, normalizeMergeTags, rate } from "@/lib/campaign-utils";

export const Route = createFileRoute("/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking — NEXUS" },
      { name: "description", content: "Ranking de campanhas." },
      { property: "og:title", content: "Ranking — NEXUS" },
      { property: "og:description", content: "Ranking de campanhas." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="ranking">
      <AppLayout><RankingPage /></AppLayout>
    </RequireTabAccess>
  ),
});

type Channel = "email" | "whatsapp";
type EmailMetric = "open" | "ctr" | "unsub" | "sales";
type WaMetric = "reactions" | "sales" | "read";

function RankingPage() {
  const [channel, setChannel] = useState<Channel>("email");
  const [phase, setPhase] = useState<"nurture" | "sale">("sale");
  const [scope, setScope] = useState<string>("all");
  const [emailMetric, setEmailMetric] = useState<EmailMetric>("open");
  const [waMetric, setWaMetric] = useState<WaMetric>("sales");
  const [topLimit, setTopLimit] = useState(10);
  const [bottomLimit, setBottomLimit] = useState(10);

  useEffect(() => {
    setTopLimit(10);
    setBottomLimit(10);
  }, [channel, phase, scope, emailMetric, waMetric]);


  const { data: campaigns } = useQuery({
    queryKey: ["campaigns-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, code, product_name")
        .order("year", { ascending: false })
        .range(0, 4999);
      return data ?? [];
    },
  });

  const { data: emails } = useQuery({
    queryKey: ["ranking-emails", phase, scope],
    enabled: channel === "email",
    queryFn: async () => {
      let q = supabase.from("emails").select("*, campaigns(code, product_name)").eq("phase", phase);
      if (scope !== "all") q = q.eq("campaign_id", scope);
      const { data } = await q.range(0, 9999);
      return data ?? [];
    },
  });

  const { data: waMessages } = useQuery({
    queryKey: ["ranking-whatsapp", phase, scope],
    enabled: channel === "whatsapp",
    queryFn: async () => {
      let q = supabase.from("whatsapp_messages").select("*, campaigns(code, product_name)").eq("phase", phase);
      if (scope !== "all") q = q.eq("campaign_id", scope);
      const { data } = await q.range(0, 9999);
      return data ?? [];
    },
  });

  const computedEmails = (emails ?? [])
    .map((e) => ({
      ...e,
      open_rate: rate(e.opened_count, e.sent_count),
      ctr: rate(e.clicked_count, e.sent_count),
      unsub_rate: rate(e.unsubscribed_count, e.sent_count),
    }))
    .sort((a, b) => {
      if (emailMetric === "open") return b.open_rate - a.open_rate;
      if (emailMetric === "ctr") return b.ctr - a.ctr;
      if (emailMetric === "sales") return (b.sales_count ?? 0) - (a.sales_count ?? 0);
      return a.unsub_rate - b.unsub_rate;
    });

  // Leitura = leram ÷ pessoas nos grupos (colunas novas; sem a base, a mensagem vai para o fim)
  const readRateOf = (m: unknown): number => {
    const r = m as Record<string, unknown>;
    const recipients = Number(r.recipients_count ?? 0);
    return recipients > 0 ? Number(r.read_count ?? 0) / recipients : -1;
  };
  const computedWa = (waMessages ?? []).slice().sort((a, b) => {
    if (waMetric === "sales") return (b.sales_count ?? 0) - (a.sales_count ?? 0);
    if (waMetric === "read") return readRateOf(b) - readRateOf(a);
    return b.reactions_count - a.reactions_count;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ranking"
        description="Compare a performance de e-mails e mensagens de WhatsApp"
      />

      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <TabsList>
              <TabsTrigger value="email">E-mails</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={phase} onValueChange={(v) => setPhase(v as "nurture" | "sale")}>
            <TabsList>
              <TabsTrigger value="nurture">Nutrição</TabsTrigger>
              <TabsTrigger value="sale">Venda</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Histórico global</SelectItem>
              {(campaigns ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {channel === "email" ? (
            <Select value={emailMetric} onValueChange={(v) => setEmailMetric(v as EmailMetric)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Por taxa de abertura</SelectItem>
                <SelectItem value="ctr">Por CTR</SelectItem>
                <SelectItem value="unsub">Menos descadastros</SelectItem>
                <SelectItem value="sales">Por vendas (manual)</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select value={waMetric} onValueChange={(v) => setWaMetric(v as WaMetric)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Por vendas (manual)</SelectItem>
                <SelectItem value="reactions">Por reações</SelectItem>
                <SelectItem value="read">Por leitura</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </Card>

      {channel === "email" ? (
        <>
          <EmailRanking
            title="🏆 Top"
            rows={computedEmails.slice(0, topLimit) as EmailRow[]}
            total={computedEmails.length}
            limit={topLimit}
            onShowMore={() => setTopLimit((n) => n + 10)}
            onShowAll={() => setTopLimit(computedEmails.length)}
            highlight="top"
          />
          {computedEmails.length > 10 && (
            <EmailRanking
              title="🔻 Bottom"
              rows={computedEmails.slice().reverse().slice(0, bottomLimit) as EmailRow[]}
              total={computedEmails.length}
              limit={bottomLimit}
              onShowMore={() => setBottomLimit((n) => n + 10)}
              onShowAll={() => setBottomLimit(computedEmails.length)}
              highlight="bottom"
            />
          )}
        </>
      ) : (
        <>
          <WaRanking
            title="🏆 Top"
            rows={computedWa.slice(0, topLimit) as WaRowR[]}
            total={computedWa.length}
            limit={topLimit}
            onShowMore={() => setTopLimit((n) => n + 10)}
            onShowAll={() => setTopLimit(computedWa.length)}
            highlight="top"
          />
          {computedWa.length > 10 && (
            <WaRanking
              title="🔻 Bottom"
              rows={computedWa.slice().reverse().slice(0, bottomLimit) as WaRowR[]}
              total={computedWa.length}
              limit={bottomLimit}
              onShowMore={() => setBottomLimit((n) => n + 10)}
              onShowAll={() => setBottomLimit(computedWa.length)}
              highlight="bottom"
            />
          )}
        </>
      )}

    </div>
  );
}

type EmailRow = {
  id: string;
  subject: string;
  campaigns: { code: string } | null;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  unsubscribed_count: number;
  sales_count: number;
  open_rate: number;
  ctr: number;
  unsub_rate: number;
};

function EmailRanking({ title, rows, total, limit, onShowMore, onShowAll, highlight }: { title: string; rows: EmailRow[]; total: number; limit: number; onShowMore: () => void; onShowAll: () => void; highlight: "top" | "bottom" }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem dados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead className="text-right">Enviados</TableHead>
                <TableHead className="text-right">Abertura</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Desc.</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge className={highlight === "top" ? "bg-primary/20 text-primary border-primary/30" : "bg-destructive/20 text-destructive border-destructive/30"}>
                      {i + 1}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate font-medium">{normalizeMergeTags(r.subject)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.campaigns?.code ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.sent_count.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right font-semibold">{formatPercent(r.open_rate)}</TableCell>
                  <TableCell className="text-right">{formatPercent(r.ctr)}</TableCell>
                  <TableCell className="text-right">{formatPercent(r.unsub_rate)}</TableCell>
                  <TableCell className="text-right font-semibold">{(r.sales_count ?? 0).toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {rows.length > 0 && total > limit && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="ghost" size="sm" onClick={onShowMore}>Mostrar mais 10</Button>
            <Button variant="ghost" size="sm" onClick={onShowAll}>Mostrar tudo ({total})</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


type WaRowR = {
  id: string;
  message: string;
  day_of_week: string;
  campaigns: { code: string } | null;
  reactions_count: number;
  sales_count: number;
  recipients_count?: number | null;
  read_count?: number | null;
};

function WaRanking({ title, rows, total, limit, onShowMore, onShowAll, highlight }: { title: string; rows: WaRowR[]; total: number; limit: number; onShowMore: () => void; onShowAll: () => void; highlight: "top" | "bottom" }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem dados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead>Dia</TableHead>
                <TableHead className="text-right">Leitura</TableHead>
                <TableHead className="text-right">Reações</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge className={highlight === "top" ? "bg-primary/20 text-primary border-primary/30" : "bg-destructive/20 text-destructive border-destructive/30"}>
                      {i + 1}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate">{r.message}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.campaigns?.code ?? "—"}</TableCell>
                  <TableCell>{r.day_of_week}</TableCell>
                  <TableCell className="text-right">
                    {r.recipients_count ? formatPercent(rate(r.read_count ?? 0, r.recipients_count)) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{r.reactions_count.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right font-semibold">{(r.sales_count ?? 0).toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {rows.length > 0 && total > limit && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="ghost" size="sm" onClick={onShowMore}>Mostrar mais 10</Button>
            <Button variant="ghost" size="sm" onClick={onShowAll}>Mostrar tudo ({total})</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

}
