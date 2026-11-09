import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, PageOrientation,
} from "docx";
import { supabase } from "@/integrations/supabase/client";

type Row = Record<string, unknown>;

function plainText(content: unknown): string[] {
  if (!content || typeof content !== "object") return [];
  const lines: string[] = [];
  const walkBlock = (node: Row) => {
    const type = node.type as string | undefined;
    const kids = (node.content as Row[] | undefined) ?? [];
    if (type === "paragraph" || type === "heading" || type === "listItem" || type === "taskItem" || type === "codeBlock") {
      const inline: string[] = [];
      const walkInline = (n: Row) => {
        if (n.type === "text" && typeof n.text === "string") inline.push(n.text);
        else if (n.type === "hardBreak") inline.push(" ");
        else if (Array.isArray(n.content)) (n.content as Row[]).forEach(walkInline);
      };
      kids.forEach(walkInline);
      const text = inline.join("").trim();
      if (text) lines.push(type === "listItem" || type === "taskItem" ? `• ${text}` : text);
      if (type === "listItem" || type === "taskItem") {
        kids.filter((k) => k.type === "bulletList" || k.type === "orderedList" || k.type === "taskList").forEach(walkBlock);
      }
      return;
    }
    kids.forEach(walkBlock);
  };
  walkBlock(content as Row);
  return lines;
}

const PRIORITY_LABEL: Record<string, string> = {
  low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente",
};

function fmtDate(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const d = v.slice(0, 10).split("-");
  if (d.length !== 3) return null;
  return `${d[2]}/${d[1]}/${d[0]}`;
}

function meta(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20 }),
      new TextRun({ text: value, size: 20 }),
    ],
  });
}

export async function exportActiveTasksAsDocx() {
  const [boardsRes, colsRes, cardsRes, profilesRes, squadsRes, tagsRes, cardTagsRes, subRes, fieldsRes, valuesRes, coRes] =
    await Promise.all([
      supabase.from("boards").select("id,name,position").order("position"),
      supabase.from("board_columns").select("id,board_id,name,position,is_done_column,is_paused_column").order("position"),
      supabase.from("cards").select("id,board_id,column_id,short_id,title,description,priority,start_date,end_date,due_date,assignee_id,squad_id,created_at").order("position"),
      supabase.from("profiles").select("id,full_name,email"),
      supabase.from("squads").select("id,name"),
      supabase.from("tags").select("id,name"),
      supabase.from("card_tags").select("card_id,tag_id"),
      supabase.from("card_subitems").select("card_id,title,done,due_date,assignee_id,position").order("position"),
      supabase.from("custom_fields").select("id,name"),
      supabase.from("card_field_values").select("card_id,field_id,value"),
      supabase.from("card_assignees").select("card_id,user_id"),
    ]);

  const boards = (boardsRes.data ?? []) as Row[];
  const cols = (colsRes.data ?? []) as Row[];
  const cards = (cardsRes.data ?? []) as Row[];
  const nameById = new Map<string, string>();
  ((profilesRes.data ?? []) as Row[]).forEach((p) => nameById.set(String(p.id), String(p.full_name || p.email || "—")));
  const squadById = new Map<string, string>();
  ((squadsRes.data ?? []) as Row[]).forEach((s) => squadById.set(String(s.id), String(s.name)));
  const tagById = new Map<string, string>();
  ((tagsRes.data ?? []) as Row[]).forEach((t) => tagById.set(String(t.id), String(t.name)));
  const fieldById = new Map<string, string>();
  ((fieldsRes.data ?? []) as Row[]).forEach((f) => fieldById.set(String(f.id), String(f.name)));

  const tagsByCard = new Map<string, string[]>();
  ((cardTagsRes.data ?? []) as Row[]).forEach((r) => {
    const n = tagById.get(String(r.tag_id));
    if (!n) return;
    const arr = tagsByCard.get(String(r.card_id)) ?? [];
    arr.push(n); tagsByCard.set(String(r.card_id), arr);
  });
  const coByCard = new Map<string, string[]>();
  ((coRes.data ?? []) as Row[]).forEach((r) => {
    const n = nameById.get(String(r.user_id));
    if (!n) return;
    const arr = coByCard.get(String(r.card_id)) ?? [];
    arr.push(n); coByCard.set(String(r.card_id), arr);
  });
  const subByCard = new Map<string, Row[]>();
  ((subRes.data ?? []) as Row[]).forEach((r) => {
    const arr = subByCard.get(String(r.card_id)) ?? [];
    arr.push(r); subByCard.set(String(r.card_id), arr);
  });
  const valsByCard = new Map<string, Row[]>();
  ((valuesRes.data ?? []) as Row[]).forEach((r) => {
    if (!r.value) return;
    const arr = valsByCard.get(String(r.card_id)) ?? [];
    arr.push(r); valsByCard.set(String(r.card_id), arr);
  });

  const colById = new Map(cols.map((c) => [String(c.id), c]));
  const activeCards = cards.filter((c) => {
    const col = colById.get(String(c.column_id));
    return col && col.is_done_column !== true;
  });

  const children: Paragraph[] = [];
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.LEFT, children: [new TextRun({ text: "Tarefas ativas — NEXUS", bold: true })] }));
  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({
      text: `Gerado em ${new Date().toLocaleString("pt-BR")} · ${activeCards.length} tarefas ativas`,
      italics: true, color: "888888", size: 20,
    })],
  }));

  let firstBoard = true;
  for (const b of boards) {
    const boardCards = activeCards.filter((c) => String(c.board_id) === String(b.id));
    if (boardCards.length === 0) continue;
    if (!firstBoard) children.push(new Paragraph({ children: [new PageBreak()] }));
    firstBoard = false;

    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: String(b.name), bold: true })] }));
    children.push(new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: `${boardCards.length} ${boardCards.length === 1 ? "tarefa ativa" : "tarefas ativas"}`, color: "888888", size: 20 })],
    }));

    const boardCols = cols
      .filter((c) => String(c.board_id) === String(b.id) && c.is_done_column !== true)
      .sort((x, y) => Number(x.position) - Number(y.position));

    for (const col of boardCols) {
      const colCards = boardCards.filter((c) => String(c.column_id) === String(col.id));
      if (colCards.length === 0) continue;
      const paused = col.is_paused_column === true;
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `${col.name}${paused ? " (em pausa)" : ""} — ${colCards.length}`, bold: true })],
      }));

      for (const c of colCards) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: `${c.short_id ? c.short_id + " — " : ""}${String(c.title)}`, bold: true })],
        }));

        const assignee = c.squad_id
          ? `Squad: ${squadById.get(String(c.squad_id)) ?? "—"}`
          : c.assignee_id ? nameById.get(String(c.assignee_id)) ?? "—" : "Sem responsável";
        children.push(meta("Responsável", assignee));

        const co = (coByCard.get(String(c.id)) ?? []).filter((n) => n !== nameById.get(String(c.assignee_id)));
        if (co.length > 0) children.push(meta("Co-responsáveis", co.join(", ")));

        children.push(meta("Prioridade", PRIORITY_LABEL[String(c.priority)] ?? String(c.priority)));

        const start = fmtDate(c.start_date); const end = fmtDate(c.end_date); const due = fmtDate(c.due_date);
        if (start || end) children.push(meta("Período", `${start ?? "—"} a ${end ?? "—"}`));
        if (due) children.push(meta("Vencimento", due));
        const created = fmtDate(c.created_at);
        if (created) children.push(meta("Criada em", created));

        const tg = tagsByCard.get(String(c.id));
        if (tg && tg.length > 0) children.push(meta("Etiquetas", tg.join(", ")));

        for (const v of valsByCard.get(String(c.id)) ?? []) {
          const label = fieldById.get(String(v.field_id));
          if (label) children.push(meta(label, String(v.value)));
        }

        const desc = plainText(c.description);
        if (desc.length > 0) {
          children.push(new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "Descrição", bold: true, size: 20 })] }));
          desc.forEach((line) => children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20 })] })));
        }

        const subs = subByCard.get(String(c.id)) ?? [];
        if (subs.length > 0) {
          const done = subs.filter((s) => s.done === true).length;
          children.push(new Paragraph({
            spacing: { before: 80 },
            children: [new TextRun({ text: `Subtarefas (${done}/${subs.length})`, bold: true, size: 20 })],
          }));
          for (const s of subs) {
            const bits: string[] = [];
            const who = s.assignee_id ? nameById.get(String(s.assignee_id)) : null;
            if (who) bits.push(who);
            const d = fmtDate(s.due_date);
            if (d) bits.push(`vence ${d}`);
            children.push(new Paragraph({
              children: [new TextRun({
                text: `${s.done ? "☑" : "☐"} ${String(s.title)}${bits.length ? ` — ${bits.join(" · ")}` : ""}`,
                size: 20,
              })],
            }));
          }
        }

        children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      }
    }
  }

  if (firstBoard) {
    children.push(new Paragraph({ children: [new TextRun({ text: "Nenhuma tarefa ativa encontrada.", italics: true })] }));
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 36, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 24, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `tarefas-ativas-${stamp}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return activeCards.length;
}
