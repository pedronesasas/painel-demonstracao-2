import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { CellSelection } from "@tiptap/pm/tables";
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Code as CodeIcon, Link as LinkIcon, List, ListOrdered,
  ListChecks, AlignLeft, AlignCenter, AlignRight, MoreHorizontal, Undo2, Redo2, RemoveFormatting, PanelTop, Square,
} from "lucide-react";
import { TRANSFORM_ITEMS } from "./blocks";
import { ColorPanel } from "./ColorPanel";
import { BarSep, Btn, DropBtn, InlineMenu, MenuItem, MenuLabel, MenuSep } from "./menu-bits";
import type { EditorActions } from "./useEditorActions";

const LIST_TYPES = ["bullet", "ordered", "task"];
const BLOCK_TYPES = TRANSFORM_ITEMS.filter((b) => !LIST_TYPES.includes(b.id));
const LIST_ITEMS = TRANSFORM_ITEMS.filter((b) => LIST_TYPES.includes(b.id));

export type ToolbarMode = "floating" | "top";

// Barra que aparece ao selecionar texto (a "barra flutuante" do ClickUp).
export function TextBubbleMenu({
  editor, actions, toolbarMode, onToolbarModeChange,
}: {
  editor: Editor;
  actions: EditorActions;
  toolbarMode?: ToolbarMode;
  // Só nos Documentos: permite fixar a barra no topo da página.
  onToolbarModeChange?: (mode: ToolbarMode) => void;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      color: (e.getAttributes("textStyle").color as string | undefined) ?? null,
      alignCenter: e.isActive({ textAlign: "center" }),
      alignRight: e.isActive({ textAlign: "right" }),
      blockLabel: BLOCK_TYPES.find((b) => b.isActive?.(e) && b.id !== "text")?.label ?? "Texto",
      listId: LIST_ITEMS.find((b) => b.isActive?.(e))?.id ?? null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const ListIcon = s?.listId === "ordered" ? ListOrdered : s?.listId === "task" ? ListChecks : List;
  const AlignIcon = s?.alignCenter ? AlignCenter : s?.alignRight ? AlignRight : AlignLeft;

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, from, to, state }) =>
        e.isEditable && from !== to && !(state.selection instanceof CellSelection) && !e.isActive("codeBlock") && !e.isActive("image")
      }
      options={{ placement: "top-start", offset: 8 }}
      className="z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-1 shadow-xl"
    >
      <InlineMenu trigger={(toggle, open) => (
        <DropBtn title="Lista" open={open} active={!!s?.listId} onClick={toggle}><ListIcon className="h-4 w-4" /></DropBtn>
      )}>
        {(close) => LIST_ITEMS.map((b) => {
          const Icon = b.icon;
          return (
            <MenuItem key={b.id} checked={s?.listId === b.id} onClick={() => { b.run(editor, actions); close(); }}>
              <Icon className="h-4 w-4" /> {b.label}
            </MenuItem>
          );
        })}
      </InlineMenu>

      <InlineMenu width="13rem" trigger={(toggle, open) => (
        <DropBtn title="Transformar em" open={open} onClick={toggle}><span className="max-w-24 truncate">{s?.blockLabel}</span></DropBtn>
      )}>
        {(close) => (
          <>
            <MenuLabel>Transformar em</MenuLabel>
            {BLOCK_TYPES.map((b) => {
              const Icon = b.icon;
              return (
                <MenuItem key={b.id} checked={b.label === s?.blockLabel} onClick={() => { b.run(editor, actions); close(); }}>
                  <Icon className="h-4 w-4" /> {b.label}
                </MenuItem>
              );
            })}
          </>
        )}
      </InlineMenu>
      <BarSep />

      <InlineMenu trigger={(toggle) => (
        <Btn title="Cores" onClick={toggle}>
          <span className="flex h-5 w-5 items-center justify-center rounded border border-border text-xs font-bold" style={{ color: s?.color ?? undefined }}>A</span>
        </Btn>
      )}>
        {(close) => <ColorPanel editor={editor} onDone={close} />}
      </InlineMenu>
      <Btn title="Negrito (Ctrl+B)" active={s?.bold} onClick={() => chain().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
      <Btn title="Itálico (Ctrl+I)" active={s?.italic} onClick={() => chain().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
      <Btn title="Sublinhado (Ctrl+U)" active={s?.underline} onClick={() => chain().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></Btn>
      <Btn title="Tachado" active={s?.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Btn>
      <Btn title="Código no texto" active={s?.code} onClick={() => chain().toggleCode().run()}><CodeIcon className="h-4 w-4" /></Btn>

      <InlineMenu trigger={(toggle, open) => (
        <DropBtn title="Alinhamento" open={open} onClick={toggle}><AlignIcon className="h-4 w-4" /></DropBtn>
      )}>
        {(close) => (
          <>
            <MenuItem checked={!s?.alignCenter && !s?.alignRight} hint="Ctrl+Shift+L" onClick={() => { chain().setTextAlign("left").run(); close(); }}>
              <AlignLeft className="h-4 w-4" /> Alinhar à esquerda
            </MenuItem>
            <MenuItem checked={s?.alignCenter} hint="Ctrl+Shift+E" onClick={() => { chain().setTextAlign("center").run(); close(); }}>
              <AlignCenter className="h-4 w-4" /> Centralizar
            </MenuItem>
            <MenuItem checked={s?.alignRight} hint="Ctrl+Shift+R" onClick={() => { chain().setTextAlign("right").run(); close(); }}>
              <AlignRight className="h-4 w-4" /> Alinhar à direita
            </MenuItem>
          </>
        )}
      </InlineMenu>
      <BarSep />
      <Btn title="Link (Ctrl+K)" active={s?.link} onClick={actions.editLink}><LinkIcon className="h-4 w-4" /></Btn>

      <InlineMenu align="right" width="14rem" trigger={(toggle) => (
        <Btn title="Mais opções" onClick={toggle}><MoreHorizontal className="h-4 w-4" /></Btn>
      )}>
        {(close) => (
          <>
            <MenuItem disabled={!s?.canUndo} hint="Ctrl+Z" onClick={() => { chain().undo().run(); close(); }}>
              <Undo2 className="h-4 w-4" /> Desfazer
            </MenuItem>
            <MenuItem disabled={!s?.canRedo} hint="Ctrl+Shift+Z" onClick={() => { chain().redo().run(); close(); }}>
              <Redo2 className="h-4 w-4" /> Refazer
            </MenuItem>
            <MenuSep />
            <MenuItem onClick={() => { chain().unsetAllMarks().run(); close(); }}>
              <RemoveFormatting className="h-4 w-4" /> Limpar formato
            </MenuItem>
            {onToolbarModeChange && (
              <>
                <MenuSep />
                <MenuLabel>Posição da barra de ferramentas</MenuLabel>
                <MenuItem checked={toolbarMode !== "top"} onClick={() => { onToolbarModeChange("floating"); close(); }}>
                  <Square className="h-4 w-4" /> Flutuando
                </MenuItem>
                <MenuItem checked={toolbarMode === "top"} onClick={() => { onToolbarModeChange("top"); close(); }}>
                  <PanelTop className="h-4 w-4" /> Fixa no topo
                </MenuItem>
              </>
            )}
          </>
        )}
      </InlineMenu>
    </BubbleMenu>
  );
}
