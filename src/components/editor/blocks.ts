import type { Editor } from "@tiptap/react";
import {
  Pilcrow, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, ListChecks, Quote,
  Bookmark, SquareChevronRight, Code as CodeIcon, Table as TableIcon,
  Minus, ImageIcon, Paperclip, Hash, CirclePlay, type LucideIcon,
} from "lucide-react";
import type { EditorActions } from "./useEditorActions";
import { BANNER_VARIANTS } from "./Callout";
import { COLOR_LABELS, COLOR_NAMES, FILL_COLORS, TEXT_COLORS, type ColorName } from "./palette";

export type BlockSection = "Texto" | "Incorporações" | "Blocos avançados" | "Faixas" | "Cores do texto" | "Destaques" | "Selos";

// Amostra de cor mostrada no lugar do ícone (itens de cor do menu "/").
export type Swatch =
  | { kind: "text"; value: string | null }
  | { kind: "fill"; value: string | null }
  | { kind: "badge"; color: ColorName | null; strong: boolean }
  | { kind: "banner"; color: ColorName; strong: boolean };

export type BlockItem = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  section: BlockSection;
  // true = muda o bloco atual ("Transformar em"); false = insere algo novo.
  transform: boolean;
  // Só aparece quando a pessoa digita algo depois da "/" (evita uma lista enorme).
  searchOnly?: boolean;
  swatch?: Swatch;
  run: (editor: Editor, actions: EditorActions) => void;
  isActive?: (editor: Editor) => boolean;
};

export const BLOCK_ITEMS: BlockItem[] = [
  {
    id: "text", label: "Texto", description: "Parágrafo comum", icon: Pilcrow, keywords: ["paragrafo", "texto", "normal"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().clearNodes().run(),
    isActive: (e) => e.isActive("paragraph") && !e.isActive("bulletList") && !e.isActive("orderedList") && !e.isActive("taskList"),
  },
  {
    id: "h1", label: "Título 1", description: "Título grande de seção", icon: Heading1, keywords: ["titulo", "h1", "cabecalho"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 1 }).run(),
    isActive: (e) => e.isActive("heading", { level: 1 }),
  },
  {
    id: "h2", label: "Título 2", description: "Título médio", icon: Heading2, keywords: ["titulo", "h2", "subtitulo", "cabecalho"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 2 }).run(),
    isActive: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    id: "h3", label: "Título 3", description: "Título pequeno", icon: Heading3, keywords: ["titulo", "h3", "cabecalho"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 3 }).run(),
    isActive: (e) => e.isActive("heading", { level: 3 }),
  },
  {
    id: "h4", label: "Título 4", description: "Título bem pequeno", icon: Heading4, keywords: ["titulo", "h4", "cabecalho"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 4 }).run(),
    isActive: (e) => e.isActive("heading", { level: 4 }),
  },
  {
    id: "task", label: "Checklist", description: "Lista de tarefas com caixinha", icon: ListChecks, keywords: ["checklist", "tarefa", "todo", "caixa"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().toggleTaskList().run(),
    isActive: (e) => e.isActive("taskList"),
  },
  {
    id: "bullet", label: "Lista", description: "Lista com marcadores", icon: List, keywords: ["lista", "marcador", "bullet", "topicos"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().toggleBulletList().run(),
    isActive: (e) => e.isActive("bulletList"),
  },
  {
    id: "ordered", label: "Lista numerada", description: "Lista 1, 2, 3", icon: ListOrdered, keywords: ["lista", "numerada", "numero"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    isActive: (e) => e.isActive("orderedList"),
  },
  {
    id: "details", label: "Seção recolhível", description: "Conteúdo que abre ao clicar", icon: SquareChevronRight,
    keywords: ["recolhivel", "toggle", "alternar", "sanfona", "detalhes", "expandir"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().setDetails().run(),
    isActive: (e) => e.isActive("details"),
  },
  {
    id: "callout", label: "Faixa", description: "Bloco com fundo colorido", icon: Bookmark,
    keywords: ["faixa", "destaque", "aviso", "callout", "banner", "dica", "atencao"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().toggleCallout("blue").run(),
    isActive: (e) => e.isActive("callout"),
  },
  {
    id: "code", label: "Bloco de código", description: "Texto em fonte de código", icon: CodeIcon, keywords: ["codigo", "code"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
    isActive: (e) => e.isActive("codeBlock"),
  },
  {
    id: "quote", label: "Citação", description: "Trecho destacado com barra", icon: Quote, keywords: ["citacao", "quote"],
    section: "Texto", transform: true,
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    isActive: (e) => e.isActive("blockquote"),
  },
  {
    id: "image", label: "Imagem", description: "Enviar uma imagem", icon: ImageIcon, keywords: ["imagem", "foto", "print"],
    section: "Incorporações", transform: false,
    run: (_e, a) => a.pickImage(),
  },
  {
    id: "attach", label: "Anexo", description: "Enviar um arquivo", icon: Paperclip, keywords: ["anexo", "arquivo", "pdf"],
    section: "Incorporações", transform: false,
    run: (_e, a) => a.attachFile(),
  },
  {
    id: "embed", label: "Vídeo", description: "YouTube ou Loom", icon: CirclePlay, keywords: ["video", "youtube", "loom", "embed"],
    section: "Incorporações", transform: false,
    run: (_e, a) => a.insertEmbed(),
  },
  {
    id: "card", label: "Card do NEXUS", description: "Mostrar uma tarefa com status", icon: Hash, keywords: ["card", "tarefa", "demanda", "mencionar"],
    section: "Incorporações", transform: false,
    run: (_e, a) => a.insertCard(),
  },
  {
    id: "table", label: "Tabela", description: "Tabela 3 × 3 com cabeçalho", icon: TableIcon, keywords: ["tabela", "planilha", "grade"],
    section: "Blocos avançados", transform: false,
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "divider", label: "Divisor", description: "Linha separando seções", icon: Minus, keywords: ["divisor", "linha", "separador"],
    section: "Blocos avançados", transform: false,
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
];

const BANNER_ITEMS: BlockItem[] = BANNER_VARIANTS.map((v) => ({
  id: `banner-${v.value}`,
  label: v.label,
  description: "Bloco com fundo colorido",
  icon: Bookmark,
  keywords: ["faixa", "banner", "destaque", normalize(COLOR_LABELS[v.color])],
  section: "Faixas",
  transform: false,
  searchOnly: true,
  swatch: { kind: "banner", color: v.color, strong: v.strong },
  run: (e) => e.chain().focus().toggleCallout(v.value).run(),
}));

// Cores aplicadas pelo menu "/": valem para o texto que a pessoa digitar em seguida.
const COLOR_ITEMS: BlockItem[] = [
  {
    id: "color-default", label: "Padrão", description: "Cor normal do texto", icon: Pilcrow, keywords: ["cor", "padrao"],
    section: "Cores do texto", transform: false, swatch: { kind: "text", value: null },
    run: (e) => e.chain().focus().unsetColor().run(),
  },
  ...TEXT_COLORS.map((c): BlockItem => ({
    id: `color-${c.value}`, label: c.name, description: `Texto ${c.name.toLowerCase()}`, icon: Pilcrow,
    keywords: ["cor", normalize(c.name)], section: "Cores do texto", transform: false,
    swatch: { kind: "text", value: c.value },
    run: (e) => e.chain().focus().setColor(c.value).run(),
  })),
  {
    id: "fill-none", label: "Remover destaque", description: "Tirar o marca-texto", icon: Pilcrow, keywords: ["destaque", "realce", "marca"],
    section: "Destaques", transform: false, swatch: { kind: "fill", value: null },
    run: (e) => e.chain().focus().unsetHighlight().run(),
  },
  ...FILL_COLORS.map((c): BlockItem => ({
    id: `fill-${c.value}`, label: `Realce ${c.name.toLowerCase()}`, description: "Marca-texto", icon: Pilcrow,
    keywords: ["destaque", "realce", "marca", normalize(c.name)], section: "Destaques", transform: false,
    swatch: { kind: "fill", value: c.value },
    run: (e) => e.chain().focus().setHighlight({ color: c.value }).run(),
  })),
  {
    id: "badge-none", label: "Remover selo", description: "Tirar o selo", icon: Pilcrow, keywords: ["selo", "etiqueta", "tag"],
    section: "Selos", transform: false, swatch: { kind: "badge", color: null, strong: false },
    run: (e) => e.chain().focus().unsetBadge().run(),
  },
  ...COLOR_NAMES.flatMap((c) => [true, false].map((strong): BlockItem => ({
    id: `badge-${c}-${strong ? "strong" : "soft"}`,
    label: `Selo ${COLOR_LABELS[c].toLowerCase()}${strong ? " forte" : ""}`,
    description: "Texto dentro de uma etiqueta colorida", icon: Pilcrow,
    keywords: ["selo", "etiqueta", "tag", normalize(COLOR_LABELS[c])], section: "Selos", transform: false,
    swatch: { kind: "badge", color: c, strong },
    run: (e) => e.chain().focus().setBadge({ color: c, strong }).run(),
  }))),
];

export const SLASH_ITEMS: BlockItem[] = [...BLOCK_ITEMS, ...BANNER_ITEMS, ...COLOR_ITEMS];

export const TRANSFORM_ITEMS = BLOCK_ITEMS.filter((b) => b.transform);

export function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function filterBlocks(query: string): BlockItem[] {
  const q = normalize(query.trim());
  if (!q) return SLASH_ITEMS.filter((b) => !b.searchOnly);
  return SLASH_ITEMS.filter((b) => normalize(b.label).includes(q) || b.keywords.some((k) => k.includes(q)));
}
