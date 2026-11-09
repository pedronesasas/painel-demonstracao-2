import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { FileSpreadsheet, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { detectEmailSheet, parseDateFromMessageName, getPhaseFromDate, normalizeMergeTags } from "@/lib/campaign-utils";
import { useQueryClient } from "@tanstack/react-query";

type Phase = "auto" | "nurture" | "sale";


const FIELDS = [
  { key: "subject", label: "Assunto" },
  { key: "message_name", label: "Nome da mensagem (data real)" },
  { key: "sent_at", label: "Enviado em" },
  { key: "created_at", label: "Criado em (fallback)" },
  { key: "sent_count", label: "Enviados" },
  { key: "opened_count", label: "Abertos" },
  { key: "clicked_count", label: "Cliques" },
  { key: "unsubscribed_count", label: "Descadastros" },
];

type ResolvedDate = { iso: string | null; source: "nome" | "enviado em" | "criado em" | "—" };

function resolveSentAt(r: Record<string, any>, mapping: Record<string, string>): ResolvedDate {
  if (mapping.message_name) {
    const d = parseDateFromMessageName(r[mapping.message_name]);
    if (d) return { iso: d.toISOString(), source: "nome" };
  }
  if (mapping.sent_at && r[mapping.sent_at]) {
    const raw = r[mapping.sent_at];
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!isNaN(d.getTime())) return { iso: d.toISOString(), source: "enviado em" };
  }
  if (mapping.created_at && r[mapping.created_at]) {
    const raw = r[mapping.created_at];
    const d = raw instanceof Date ? raw : new Date(raw);
    if (!isNaN(d.getTime())) return { iso: d.toISOString(), source: "criado em" };
  }
  return { iso: null, source: "—" };
}

export function ImportEmailsPanel({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("auto");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [detectedSheet, setDetectedSheet] = useState<string | null>(null);
  const [showManualMapping, setShowManualMapping] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetParsed = () => {
    setRows([]);
    setHeaders([]);
    setMapping({});
    setDetectedSheet(null);
    setShowManualMapping(false);
  };

  const handleFile = async (file: File) => {
    resetParsed();
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const parsedRows = res.data as any[];
          const parsedHeaders = res.meta.fields ?? [];
          setRows(parsedRows);
          setHeaders(parsedHeaders);
          setShowManualMapping(true);
        },
      });
    } else if (ext === "xlsx" || ext === "xls") {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        let detection = null;
        try {
          detection = detectEmailSheet(wb);
        } catch (err) {
          console.error("detectEmailSheet failed:", err);
        }
        if (detection) {
          setDetectedSheet(detection.sheetName);
          setHeaders(detection.headers);
          setRows(detection.rows);
          setMapping(detection.mapping);
          setShowManualMapping(false);
          toast.success(
            `Aba "${detection.sheetName}" detectada — ${detection.rows.length} e-mails encontrados`,
          );
        } else {
          let json: any[] = [];
          let usedSheet = wb.SheetNames[0];
          for (const name of wb.SheetNames) {
            const j = XLSX.utils.sheet_to_json<any>(wb.Sheets[name], { defval: null });
            if (j.length) {
              json = j;
              usedSheet = name;
              break;
            }
          }
          setRows(json);
          setHeaders(json.length ? Object.keys(json[0]) : []);
          setShowManualMapping(true);
          toast.info(
            json.length
              ? `Aba "${usedSheet}" carregada — faça o mapeamento manual`
              : "Planilha vazia",
          );
        }
      } catch (err: any) {
        console.error("Erro ao ler XLSX:", err);
        toast.error(`Erro ao ler planilha: ${err?.message ?? "desconhecido"}`);
      }
    } else {
      toast.error("Formato não suportado. Use CSV ou XLSX.");
    }
  };

  const handleImport = async () => {
    if (!mapping.subject) return toast.error("Campo Assunto é obrigatório");
    setSubmitting(true);
    const records = rows
      .map((r) => {
        const { iso } = resolveSentAt(r, mapping);
        return {
          campaign_id: campaignId,
          subject: normalizeMergeTags(String(r[mapping.subject] ?? "")).trim(),
          sent_at: iso,
          phase: phase === "auto" ? (iso ? getPhaseFromDate(iso) : "nurture") : phase,
          sent_count: Number(r[mapping.sent_count] ?? 0) || 0,
          opened_count: Number(r[mapping.opened_count] ?? 0) || 0,
          clicked_count: Number(r[mapping.clicked_count] ?? 0) || 0,
          unsubscribed_count: Number(r[mapping.unsubscribed_count] ?? 0) || 0,
        };
      })
      .filter((r) => r.subject);

    const { error } = await supabase.from("emails").insert(records);
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`${records.length} e-mails importados!`);
      resetParsed();
      qc.invalidateQueries({ queryKey: ["emails", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-overview", campaignId] });
      qc.invalidateQueries({ queryKey: ["ranking-emails"] });
      qc.invalidateQueries({ queryKey: ["campaign-metrics"] });
    }
  };

  // Resolved dates for preview + counts
  const resolved = rows.map((r) => resolveSentAt(r, mapping));
  const sourceCounts = resolved.reduce(
    (acc, x) => { acc[x.source] = (acc[x.source] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Arquivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Fase</Label>
              <Select value={phase} onValueChange={(v: Phase) => setPhase(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático (fim de semana = Venda)</SelectItem>
                  <SelectItem value="nurture">Nutrição</SelectItem>
                  <SelectItem value="sale">Venda</SelectItem>
                </SelectContent>
              </Select>
              {phase === "auto" && (
                <p className="text-xs text-muted-foreground">
                  Cada e-mail recebe a fase pela data: sábado e domingo entram como Venda, os outros dias como Nutrição.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Arquivo (CSV ou XLSX)</Label>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <>
          {detectedSheet && !showManualMapping && (
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-5 w-5 text-primary" /> Detecção automática
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>✓ Aba detectada: <span className="font-medium">{detectedSheet}</span></p>
                <p>✓ <span className="font-medium">{rows.length}</span> e-mails encontrados</p>
                <p>✓ {Object.keys(mapping).length} de {FIELDS.length} colunas mapeadas automaticamente</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowManualMapping(true)}>
                  Ajustar mapeamento manualmente
                </Button>
              </CardContent>
            </Card>
          )}

          {showManualMapping && (
            <Card>
              <CardHeader>
                <CardTitle>2. Mapeamento de colunas</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-2">
                    <Label>
                      {f.label}{" "}
                      {f.key === "subject" && <span className="text-destructive">*</span>}
                    </Label>
                    <Select
                      value={mapping[f.key] ?? ""}
                      onValueChange={(v) => setMapping({ ...mapping, [f.key]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" /> 3. Preview ({rows.length} linhas)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="bg-primary/5 sticky left-0">Data resolvida</TableHead>
                      <TableHead className="bg-primary/5">Fase</TableHead>
                      {headers.map((h) => (<TableHead key={h}>{h}</TableHead>))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 8).map((r, i) => {
                      const rd = resolved[i];
                      return (
                        <TableRow key={i}>
                          <TableCell className="text-xs bg-primary/5 sticky left-0 whitespace-nowrap">
                            {rd.iso ? (
                              <>
                                <div className="font-medium">{new Date(rd.iso).toLocaleString("pt-BR")}</div>
                                <div className="text-[10px] text-muted-foreground">via {rd.source}</div>
                              </>
                            ) : (
                              <span className="text-destructive">sem data</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs bg-primary/5 whitespace-nowrap">
                            {(phase === "auto" ? (rd.iso ? getPhaseFromDate(rd.iso) : "nurture") : phase) === "sale"
                              ? "Venda"
                              : "Nutrição"}
                          </TableCell>
                          {headers.map((h) => (
                            <TableCell key={h} className="text-xs max-w-xs truncate">
                              {String(r[h] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {rows.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {(["nome", "enviado em", "criado em", "—"] as const).map((s) =>
                    sourceCounts[s] ? (
                      <span
                        key={s}
                        className={
                          s === "criado em"
                            ? "px-2 py-1 rounded border border-warning/40 bg-warning/10 text-warning"
                            : s === "—"
                            ? "px-2 py-1 rounded border border-destructive/40 bg-destructive/10 text-destructive"
                            : "px-2 py-1 rounded border border-primary/30 bg-primary/10 text-primary"
                        }
                      >
                        {sourceCounts[s]} via {s}
                      </span>
                    ) : null,
                  )}
                  {sourceCounts["criado em"] ? (
                    <span className="text-muted-foreground">
                      ⚠ "Criado em" é a data de configuração do fluxo, não do envio. Confira se a coluna "Nome da mensagem" contém a data real (ex.: <code>… - 20/06/2026 - 11H</code>).
                    </span>
                  ) : null}
                </div>
              )}

              <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  {!mapping.subject && "⚠ Mapeie a coluna Assunto"}
                  {mapping.subject && (
                    <>Pronto para importar <span className="font-semibold text-foreground">{rows.length}</span> e-mails como <span className="font-semibold text-primary">{phase === "auto" ? "fase automática pela data" : phase === "nurture" ? "Nutrição" : "Venda"}</span></>
                  )}
                </div>
                <Button
                  size="lg"
                  onClick={handleImport}
                  disabled={submitting || !mapping.subject}
                  className="w-full sm:w-auto"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {submitting ? "Importando..." : `Importar ${rows.length} e-mails`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
