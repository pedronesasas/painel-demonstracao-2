import * as XLSX from "xlsx";
import { formatDateBR, formatDurationHMS } from "@/lib/utils";

type Entry = {
  id: string;
  editor_id: string;
  card_id: string | null;
  title: string;
  duration_seconds: number;
  delivered_at: string;
  notes: string | null;
  demand_id: string | null;
};
type Demand = {
  id: string;
  editor_id: string;
  title: string;
  delivered_at: string;
  card_id: string | null;
  mode: "detailed" | "aggregate";
  aggregate_video_count: number | null;
  aggregate_total_seconds: number | null;
  notes: string | null;
};
type Card = { id: string; short_id: string | null; title: string };
type Editor = { id: string; name: string };

export type WeeklyRow = {
  editorId: string;
  editorName: string;
  weekLabel: string;
  deliveredMin: number;
  targetMin: number;
  overMin: number;
  rateCents: number;
  payCents: number;
};

export type PerEditorRow = {
  id: string;
  name: string;
  seconds: number;
  videos: number;
};

export type ReportState = {
  rangeLabel: string;
  from: string | null;
  to: string | null;
  editorLabel: string;
  totalSeconds: number;
  totalVideos: number;
  avgSeconds: number;
  totalPayCents: number;
  perEditor: PerEditorRow[];
  weeklyRows: WeeklyRow[];
  filtered: Entry[];
  filteredDemands: Demand[];
  editors: Editor[];
  cards: Map<string, Card>;
};

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const editorName = (editors: Editor[], id: string) =>
  editors.find((e) => e.id === id)?.name ?? "—";

const cardLabel = (cards: Map<string, Card>, id: string | null) => {
  if (!id) return "";
  const c = cards.get(id);
  if (!c) return "";
  return `${c.short_id ?? ""} ${c.title}`.trim();
};

type Section = { title: string; rows: (string | number)[][] };

function buildSections(s: ReportState): Section[] {
  const sections: Section[] = [];

  sections.push({
    title: "Filtros",
    rows: [
      ["Campo", "Valor"],
      ["Período", s.rangeLabel],
      ["De", s.from ?? "—"],
      ["Até", s.to ?? "—"],
      ["Editor", s.editorLabel],
      ["Exportado em", new Date().toLocaleString("pt-BR")],
    ],
  });

  sections.push({
    title: "KPIs",
    rows: [
      ["Indicador", "Valor"],
      ["Tempo total editado", formatDurationHMS(s.totalSeconds)],
      ["Vídeos entregues", s.totalVideos],
      ["Média por vídeo", formatDurationHMS(s.avgSeconds)],
      ["Total a pagar (extras)", brl(s.totalPayCents)],
    ],
  });

  sections.push({
    title: "Resumo por editor",
    rows: [
      ["Editor", "Vídeos", "Tempo total", "Minutos totais"],
      ...s.perEditor.map((r) => [
        r.name,
        r.videos,
        formatDurationHMS(r.seconds),
        Math.round(r.seconds / 60),
      ]),
    ],
  });

  if (s.weeklyRows.length > 0) {
    sections.push({
      title: "Entregas por semana",
      rows: [
        ["Editor", "Semana", "Meta (min)", "Entregue (min)", "Excedente (min)", "R$/min", "A pagar"],
        ...s.weeklyRows.map((r) => [
          r.editorName,
          r.weekLabel,
          r.targetMin,
          r.deliveredMin,
          r.overMin,
          brl(r.rateCents),
          brl(r.payCents),
        ]),
      ],
    });
  }

  sections.push({
    title: "Demandas",
    rows: [
      ["Data", "Editor", "Card", "Título", "Modo", "Nº de vídeos", "Tempo total", "Observações"],
      ...s.filteredDemands.map((d) => {
        const childrenSec = s.filtered
          .filter((e) => e.demand_id === d.id)
          .reduce((acc, e) => acc + e.duration_seconds, 0);
        const childrenCount = s.filtered.filter((e) => e.demand_id === d.id).length;
        const totalSec = d.mode === "aggregate" ? (d.aggregate_total_seconds ?? 0) : childrenSec;
        const count = d.mode === "aggregate" ? (d.aggregate_video_count ?? 0) : childrenCount;
        return [
          formatDateBR(d.delivered_at),
          editorName(s.editors, d.editor_id),
          cardLabel(s.cards, d.card_id),
          d.title,
          d.mode === "aggregate" ? "Agregada" : "Detalhada",
          count,
          formatDurationHMS(totalSec),
          d.notes ?? "",
        ];
      }),
    ],
  });

  sections.push({
    title: "Lançamentos",
    rows: [
      ["Data", "Editor", "Card", "Título", "Duração", "Duração (segundos)", "Observações"],
      ...s.filtered.map((e) => [
        formatDateBR(e.delivered_at),
        editorName(s.editors, e.editor_id),
        cardLabel(s.cards, e.card_id),
        e.title,
        formatDurationHMS(e.duration_seconds),
        e.duration_seconds,
        e.notes ?? "",
      ]),
    ],
  });

  return sections;
}

function buildFileName(s: ReportState, ext: "csv" | "xlsx") {
  const editorSlug = s.editorLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "todos";
  const from = s.from ?? "inicio";
  const to = s.to ?? "fim";
  return `tempo-edicao_${editorSlug}_${from}_ate_${to}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number): string {
  const str = String(value ?? "");
  if (/[";\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportTempoEdicaoCsv(state: ReportState) {
  const sections = buildSections(state);
  const lines: string[] = [];
  sections.forEach((sec, idx) => {
    if (idx > 0) lines.push("");
    lines.push(escapeCsv(sec.title));
    for (const row of sec.rows) {
      lines.push(row.map(escapeCsv).join(";"));
    }
  });
  // UTF-8 BOM for Excel pt-BR compatibility
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, buildFileName(state, "csv"));
}

export function exportTempoEdicaoXlsx(state: ReportState) {
  const sections = buildSections(state);
  const wb = XLSX.utils.book_new();
  for (const sec of sections) {
    const ws = XLSX.utils.aoa_to_sheet(sec.rows);
    // Column widths: best-effort fit based on max content length
    const header = sec.rows[0] ?? [];
    const widths = header.map((_, colIdx) => {
      let max = 10;
      for (const row of sec.rows) {
        const cell = row[colIdx];
        const len = String(cell ?? "").length;
        if (len > max) max = len;
      }
      return { wch: Math.min(max + 2, 60) };
    });
    (ws as any)["!cols"] = widths;
    // Truncate sheet name to 31 chars (Excel limit) and strip invalid chars
    const safeName = sec.title.replace(/[\\/?*[\]:]/g, "").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, buildFileName(state, "xlsx"));
}
