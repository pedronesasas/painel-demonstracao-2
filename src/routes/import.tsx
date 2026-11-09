import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Importar — NEXUS" },
      { name: "description", content: "Importação de dados." },
      { property: "og:title", content: "Importar — NEXUS" },
      { property: "og:description", content: "Importação de dados." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="import">
      <AppLayout><ImportPage /></AppLayout>
    </RequireTabAccess>
  ),
});

function ImportPage() {
  const { canEdit } = useAuth();
  const [campaignId, setCampaignId] = useState<string>("");

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns-import"],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("id, code, product_name")
        .order("year", { ascending: false });
      return data ?? [];
    },
  });

  if (!canEdit) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Você precisa de permissão de editor para importar planilhas.
        </CardContent>
      </Card>
    );
  }

  const open = () => {
    if (!campaignId) return;
    window.location.href = `/campaigns/${campaignId}?tab=import`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar Planilha"
        description={<>
          A importação agora acontece dentro de cada campanha. Selecione uma para abrir a aba <strong>Importar</strong>.
        </>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Escolha a campanha de destino</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label>Campanha</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {(campaigns ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="lg" onClick={open} disabled={!campaignId}>
              Abrir importação <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-start gap-3 rounded-md border border-dashed border-primary/30 bg-primary/5 p-4 text-sm">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Dica</p>
              <p className="text-muted-foreground">
                Você também pode abrir a aba <strong>Importar</strong> direto na tela da campanha,
                ao lado de Visão geral, E-mails, WhatsApp e Vendas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
