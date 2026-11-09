import StarterKit from "@tiptap/starter-kit";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { Placeholder } from "@tiptap/extensions";
import { Extension, type AnyExtension } from "@tiptap/core";
import { CardChip } from "@/components/documents/CardChipExtension";
import { Badge } from "./Badge";
import { Callout } from "./Callout";
import { Embed } from "./Embed";
import { SlashCommand } from "./SlashCommand";
import type { EditorActions } from "./useEditorActions";

// Cor de fundo e alinhamento vertical da célula. Lê também o "data-bg" antigo dos documentos.
const cellBackground = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || el.getAttribute("data-bg") || null,
    renderHTML: (attrs: { backgroundColor?: string | null }) =>
      attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {},
  },
  verticalAlign: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.verticalAlign || null,
    renderHTML: (attrs: { verticalAlign?: string | null }) =>
      attrs.verticalAlign ? { style: `vertical-align: ${attrs.verticalAlign}` } : {},
  },
};

// "Cor do bloco" do ClickUp: fundo colorido em um parágrafo ou título inteiro.
const BlockColor = Extension.create({
  name: "blockColor",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        blockColor: {
          default: null as string | null,
          parseHTML: (el: HTMLElement) => el.getAttribute("data-block-color"),
          renderHTML: (attrs: { blockColor?: string | null }) =>
            attrs.blockColor ? { "data-block-color": attrs.blockColor } : {},
        },
      },
    }];
  },
});

const ColoredTableCell = TableCell.extend({
  addAttributes() { return { ...this.parent?.(), ...cellBackground }; },
});
const ColoredTableHeader = TableHeader.extend({
  addAttributes() { return { ...this.parent?.(), ...cellBackground }; },
});

type Options = {
  placeholder?: string;
  getActions: () => EditorActions | null;
  // "document" = página de Documentos; "compact" = descrição de card, subtarefa, produto.
  variant: "document" | "compact";
};

// Lista única de extensões para todos os editores de texto do NEXUS. Os dois
// usam o mesmo formato de conteúdo, então um texto colado de um lado abre igual no outro.
export function createEditorExtensions({ placeholder, getActions, variant }: Options): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      dropcursor: { color: "var(--color-primary)", width: 2 },
      link: {
        openOnClick: variant === "compact",
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      },
    }),
    Highlight.configure({ multicolor: true }),
    Badge,
    BlockColor,
    TextStyleKit.configure({ fontFamily: false, lineHeight: false }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Image.configure({ HTMLAttributes: { class: "doc-image" } }),
    Table.configure({ resizable: true, allowTableNodeSelection: true, cellMinWidth: 60 }),
    TableRow,
    ColoredTableHeader,
    ColoredTableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Details.configure({ HTMLAttributes: { class: "doc-details" } }),
    DetailsSummary,
    DetailsContent,
    Callout,
    Embed,
    CardChip,
    Placeholder.configure({
      includeChildren: false,
      showOnlyCurrent: true,
      placeholder: ({ node, editor }) => {
        if (node.type.name === "heading") return `Título ${node.attrs.level}`;
        if (node.type.name === "detailsSummary") return "Título da seção";
        if (editor.isEmpty && placeholder) return placeholder;
        return "Escreva ou digite \"/\" para ver os comandos";
      },
    }),
    SlashCommand.configure({ getActions }),
    Extension.create({
      name: "nexusShortcuts",
      addKeyboardShortcuts() {
        return {
          "Mod-k": () => {
            const actions = getActions();
            if (!actions || !this.editor.isEditable) return false;
            actions.editLink();
            return true;
          },
        };
      },
    }),
  ];
}
