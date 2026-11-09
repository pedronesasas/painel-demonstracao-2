import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  LevelFormat, ExternalHyperlink, PageBreak, BorderStyle, PageOrientation,
} from "docx";
import { supabase } from "@/integrations/supabase/client";

type DocRow = {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  content: unknown;
  position: number;
};

type Node = Record<string, unknown> & {
  type?: string;
  content?: Node[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
};

async function fetchSubtree(rootId: string): Promise<DocRow[]> {
  const all: DocRow[] = [];
  const { data: root } = await supabase.from("documents")
    .select("id,parent_id,title,icon,content,position")
    .eq("id", rootId).maybeSingle();
  if (!root) return all;
  all.push(root as DocRow);

  let frontier = [rootId];
  while (frontier.length > 0) {
    const { data } = await supabase.from("documents")
      .select("id,parent_id,title,icon,content,position")
      .in("parent_id", frontier)
      .order("position");
    const rows = (data ?? []) as DocRow[];
    if (rows.length === 0) break;
    all.push(...rows);
    frontier = rows.map((r) => r.id);
  }
  return all;
}

// Pre-order traversal by parent hierarchy
function orderPreorder(rows: DocRow[], rootId: string): Array<{ row: DocRow; depth: number; path: string[] }> {
  const byParent = new Map<string | null, DocRow[]>();
  for (const r of rows) {
    const key = r.id === rootId ? "__root__" : r.parent_id;
    const arr = byParent.get(key) ?? [];
    arr.push(r);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.position - b.position);

  const result: Array<{ row: DocRow; depth: number; path: string[] }> = [];
  const root = rows.find((r) => r.id === rootId);
  if (!root) return result;

  const walk = (node: DocRow, depth: number, path: string[]) => {
    const label = `${node.icon ? node.icon + " " : ""}${node.title || "Sem título"}`;
    result.push({ row: node, depth, path });
    const kids = byParent.get(node.id) ?? [];
    for (const c of kids) walk(c, depth + 1, [...path, label]);
  };
  walk(root, 0, []);
  return result;
}

const NAMED_COLORS: Record<string, string> = {
  black: "000000", white: "FFFFFF", red: "FF0000", green: "008000",
  blue: "0000FF", gray: "808080", grey: "808080", yellow: "FFFF00",
  orange: "FFA500", purple: "800080", pink: "FFC0CB", brown: "A52A2A",
  cyan: "00FFFF", magenta: "FF00FF",
};

function toHex6(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (NAMED_COLORS[s]) return NAMED_COLORS[s];
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (/^[0-9a-f]{3}$/.test(hex)) return hex.split("").map((c) => c + c).join("").toUpperCase();
    if (/^[0-9a-f]{6}$/.test(hex)) return hex.toUpperCase();
    if (/^[0-9a-f]{8}$/.test(hex)) return hex.slice(0, 6).toUpperCase();
    return null;
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    const toH = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
    return (toH(m[1]) + toH(m[2]) + toH(m[3])).toUpperCase();
  }
  return null;
}

function textFromMarks(text: string, marks: Node["marks"]): TextRun | ExternalHyperlink {
  const opts: Record<string, unknown> = { text };
  let link: string | null = null;
  if (marks) {
    for (const m of marks) {
      if (m.type === "bold") opts.bold = true;
      else if (m.type === "italic") opts.italics = true;
      else if (m.type === "underline") opts.underline = {};
      else if (m.type === "strike") opts.strike = true;
      else if (m.type === "code") opts.font = "Courier New";
      else if (m.type === "textStyle" && m.attrs?.color) { const h = toHex6(m.attrs.color); if (h) opts.color = h; }
      else if (m.type === "highlight") opts.highlight = "yellow";
      else if (m.type === "link" && m.attrs?.href) link = String(m.attrs.href);
    }
  }
  const run = new TextRun(opts as ConstructorParameters<typeof TextRun>[0]);
  if (link) return new ExternalHyperlink({ link, children: [run] });
  return run;
}

function inlineChildren(nodes: Node[] | undefined): Array<TextRun | ExternalHyperlink> {
  const out: Array<TextRun | ExternalHyperlink> = [];
  if (!nodes) return out;
  for (const n of nodes) {
    if (n.type === "text" && typeof n.text === "string") {
      out.push(textFromMarks(n.text, n.marks));
    } else if (n.type === "hardBreak") {
      out.push(new TextRun({ text: "", break: 1 }));
    } else if (n.type === "cardChip") {
      const label = String((n.attrs?.title as string) ?? (n.attrs?.label as string) ?? "card");
      out.push(new TextRun({ text: `[${label}]`, italics: true }));
    } else if (n.type === "image") {
      out.push(new TextRun({ text: "[imagem]", italics: true, color: "888888" }));
    } else if (n.content) {
      out.push(...inlineChildren(n.content));
    }
  }
  return out;
}

function nodeToParagraphs(node: Node, ctx: { listRef?: string; listLevel?: number }): Paragraph[] {
  const t = node.type;
  if (!t) return [];

  if (t === "paragraph") {
    return [new Paragraph({
      children: inlineChildren(node.content),
      ...(ctx.listRef ? { numbering: { reference: ctx.listRef, level: ctx.listLevel ?? 0 } } : {}),
    })];
  }
  if (t === "heading") {
    const level = Number(node.attrs?.level ?? 2);
    const levelMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
      1: HeadingLevel.HEADING_2, // doc title is H1; content heading 1 becomes H2
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
    };
    return [new Paragraph({
      heading: levelMap[level] ?? HeadingLevel.HEADING_3,
      children: inlineChildren(node.content),
    })];
  }
  if (t === "bulletList") {
    const out: Paragraph[] = [];
    for (const c of node.content ?? []) {
      out.push(...nodeToParagraphs(c, { listRef: "bullets", listLevel: (ctx.listLevel ?? -1) + 1 }));
    }
    return out;
  }
  if (t === "orderedList") {
    const out: Paragraph[] = [];
    for (const c of node.content ?? []) {
      out.push(...nodeToParagraphs(c, { listRef: "numbers", listLevel: (ctx.listLevel ?? -1) + 1 }));
    }
    return out;
  }
  if (t === "listItem") {
    const out: Paragraph[] = [];
    for (const c of node.content ?? []) {
      out.push(...nodeToParagraphs(c, ctx));
    }
    return out.length > 0 ? out : [new Paragraph({
      children: [], ...(ctx.listRef ? { numbering: { reference: ctx.listRef, level: ctx.listLevel ?? 0 } } : {}),
    })];
  }
  if (t === "taskList") {
    const out: Paragraph[] = [];
    for (const c of node.content ?? []) out.push(...nodeToParagraphs(c, ctx));
    return out;
  }
  if (t === "taskItem") {
    const checked = Boolean(node.attrs?.checked);
    const prefix = new TextRun({ text: checked ? "☑ " : "☐ " });
    const children: Array<TextRun | ExternalHyperlink> = [prefix, ...inlineChildren(node.content)];
    return [new Paragraph({ children })];
  }
  if (t === "blockquote") {
    const out: Paragraph[] = [];
    for (const c of node.content ?? []) {
      const paras = nodeToParagraphs(c, ctx);
      for (const p of paras) out.push(p);
    }
    // Wrap: add left indent via a fresh paragraph set — simplest: mark italics is not straightforward here.
    return out.map((p) => p); // keep as-is; docx-js Paragraph indent set via constructor is heavier — skipping deep style.
  }
  if (t === "codeBlock") {
    const text = (node.content ?? []).map((n) => n.text ?? "").join("");
    return text.split("\n").map((line) => new Paragraph({
      children: [new TextRun({ text: line, font: "Courier New" })],
    }));
  }
  if (t === "horizontalRule") {
    return [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } },
      children: [],
    })];
  }
  if (t === "image") {
    return [new Paragraph({ children: [new TextRun({ text: "[imagem]", italics: true, color: "888888" })] })];
  }
  if (t === "embed") {
    const src = String(node.attrs?.src ?? "");
    return [new Paragraph({ children: [new TextRun({ text: src ? `[vídeo: ${src}]` : "[vídeo]", italics: true, color: "888888" })] })];
  }
  if (t === "detailsSummary") {
    return [new Paragraph({ children: inlineChildren(node.content) })];
  }
  if (t === "table") {
    // Fallback: linearize table rows
    const out: Paragraph[] = [];
    for (const row of node.content ?? []) {
      const cells: string[] = [];
      const walk = (n: Node) => {
        if (n.type === "text" && n.text) cells.push(n.text);
        else if (n.content) n.content.forEach(walk);
      };
      (row.content ?? []).forEach((cell) => {
        const before = cells.length;
        walk(cell);
        if (cells.length === before) cells.push("");
      });
      out.push(new Paragraph({ children: [new TextRun({ text: cells.join(" | ") })] }));
    }
    return out;
  }
  // Fallback: recurse
  if (node.content) {
    const out: Paragraph[] = [];
    for (const c of node.content) out.push(...nodeToParagraphs(c, ctx));
    return out;
  }
  return [];
}

function contentToParagraphs(content: unknown): Paragraph[] {
  if (!content || typeof content !== "object") return [];
  const root = content as Node;
  const nodes = root.content ?? (root.type === "doc" ? [] : [root]);
  const out: Paragraph[] = [];
  for (const n of nodes) out.push(...nodeToParagraphs(n, {}));
  return out;
}

function sanitizeFilename(name: string): string {
  return (name || "documento").replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 120);
}

export async function exportDocumentAsDocx(rootId: string, rootTitle: string) {
  const rows = await fetchSubtree(rootId);
  if (rows.length === 0) throw new Error("Documento não encontrado");
  const ordered = orderPreorder(rows, rootId);

  const children: Paragraph[] = [];
  ordered.forEach((entry, idx) => {
    const { row, depth, path } = entry;
    const titleText = `${row.icon ? row.icon + " " : ""}${row.title || "Sem título"}`;

    children.push(new Paragraph({
      heading: depth === 0 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_1,
      children: [new TextRun({ text: titleText, bold: true })],
      alignment: AlignmentType.LEFT,
    }));

    if (depth > 0 && path.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: path.join(" › "), color: "888888", italics: true, size: 20 })],
      }));
    }

    children.push(...contentToParagraphs(row.content));

    if (idx < ordered.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 24 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 40, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 32, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 280, after: 180 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 220, after: 140 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [0, 1, 2, 3].map((lvl) => ({
            level: lvl,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } },
          })),
        },
        {
          reference: "numbers",
          levels: [0, 1, 2, 3].map((lvl) => ({
            level: lvl,
            format: LevelFormat.DECIMAL,
            text: `%${lvl + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (lvl + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(rootTitle)}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
