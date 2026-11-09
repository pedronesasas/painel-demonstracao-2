import { useEffect, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ArrowDown, ArrowUp, Ban, Bookmark, Copy, GripVertical, Palette, Plus, Repeat2, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TRANSFORM_ITEMS } from "./blocks";
import { BANNER_VARIANTS } from "./Callout";
import { SwatchIcon } from "./SlashCommand";
import { COLOR_LABELS, COLOR_NAMES, TEXT_COLORS } from "./palette";
import type { EditorActions } from "./useEditorActions";

type Target = { pos: number; top: number };

const ITEM_TYPES = new Set(["listItem", "taskItem"]);

// Acha o bloco sob o mouse: o item de lista mais interno ou, fora de listas,
// o bloco de primeiro nível (parágrafo, título, tabela, caixa de destaque...).
function findBlock(view: EditorView, x: number, y: number): number | null {
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  const doc = view.state.doc;
  if (hit.inside >= 0) {
    const $inside = doc.resolve(hit.inside);
    if ($inside.depth === 0) return hit.inside;
  }
  const $pos = doc.resolve(hit.pos);
  if ($pos.depth === 0) return hit.inside >= 0 ? hit.inside : null;
  for (let d = $pos.depth; d > 0; d--) {
    if (ITEM_TYPES.has($pos.node(d).type.name)) return $pos.before(d);
  }
  return $pos.before(1);
}

export function BlockHandle({
  editor, actions, containerRef,
}: {
  editor: Editor;
  actions: EditorActions;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const targetRef = useRef<Target | null>(null);
  targetRef.current = target;
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMove = (e: MouseEvent) => {
      if (!editor.isEditable || menuOpenRef.current) return;
      if ((e.target as HTMLElement).closest("[data-block-handle]")) return;
      const view = editor.view;
      const box = view.dom.getBoundingClientRect();
      if (e.clientY < box.top || e.clientY > box.bottom) return;
      const x = Math.min(Math.max(e.clientX, box.left + 4), box.right - 4);
      const pos = findBlock(view, x, e.clientY);
      if (pos == null) return;
      const dom = view.nodeDOM(pos) as HTMLElement | null;
      if (!dom || !(dom instanceof HTMLElement)) return;
      const rect = dom.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(dom).lineHeight) || 26;
      const firstLine = Math.min(rect.height, lineHeight);
      const top = rect.top - cRect.top + Math.max(0, (firstLine - 24) / 2);
      if (targetRef.current?.pos !== pos || targetRef.current?.top !== top) setTarget({ pos, top });
    };
    const onLeave = () => { if (!menuOpenRef.current) setTarget(null); };

    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", onLeave);
    };
  }, [editor, containerRef]);

  // O conteúdo mudou (digitação, outra pessoa salvou): a posição guardada pode ter ficado velha.
  useEffect(() => {
    const reset = () => { if (!menuOpenRef.current) setTarget(null); };
    editor.on("update", reset);
    return () => { editor.off("update", reset); };
  }, [editor]);

  if (!target || !editor.isEditable) return null;

  const nodeAtTarget = () => {
    const t = targetRef.current;
    if (!t) return null;
    const node = editor.state.doc.nodeAt(t.pos);
    return node ? { node, pos: t.pos } : null;
  };

  const onDragStart = (e: React.DragEvent) => {
    const found = nodeAtTarget();
    if (!found) return;
    const view = editor.view;
    const sel = NodeSelection.create(view.state.doc, found.pos);
    view.dispatch(view.state.tr.setSelection(sel));
    const slice = sel.content();
    e.dataTransfer.effectAllowed = "copyMove";
    try {
      const ser = (view as unknown as { serializeForClipboard: (s: typeof slice) => { dom: HTMLElement; text: string } })
        .serializeForClipboard(slice);
      e.dataTransfer.setData("text/html", ser.dom.innerHTML);
      e.dataTransfer.setData("text/plain", ser.text);
    } catch {
      e.dataTransfer.setData("text/plain", " ");
    }
    const dom = view.nodeDOM(found.pos);
    if (dom instanceof HTMLElement) e.dataTransfer.setDragImage(dom, 0, 0);
    // O ProseMirror usa "dragging" para mover (e não copiar) o bloco ao soltar.
    (view as unknown as { dragging: unknown }).dragging = { slice, move: true, node: sel };
  };

  const selectInside = (pos: number) => {
    editor.chain().focus().command(({ tr }) => {
      tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
      return true;
    }).run();
  };

  const insertBelow = () => {
    const found = nodeAtTarget();
    if (!found) return;
    const doc = editor.state.doc;
    const $p = doc.resolve(found.pos);
    const topPos = $p.depth === 0 ? found.pos : $p.before(1);
    const top = doc.nodeAt(topPos);
    if (!top) return;
    const at = topPos + top.nodeSize;
    editor.chain()
      .insertContentAt(at, { type: "paragraph", content: [{ type: "text", text: "/" }] })
      .setTextSelection(at + 2)
      .focus()
      .run();
  };

  const move = (dir: -1 | 1) => {
    const found = nodeAtTarget();
    if (!found) return;
    const { node, pos } = found;
    const $pos = editor.state.doc.resolve(pos);
    const index = $pos.index();
    const parent = $pos.parent;
    if (dir === -1 && index === 0) return;
    if (dir === 1 && index >= parent.childCount - 1) return;
    editor.chain().focus().command(({ tr }) => {
      if (dir === -1) {
        const prev = parent.child(index - 1);
        tr.delete(pos, pos + node.nodeSize).insert(pos - prev.nodeSize, node);
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos - prev.nodeSize + 1)));
      } else {
        const next = parent.child(index + 1);
        tr.delete(pos, pos + node.nodeSize).insert(pos + next.nodeSize, node);
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + next.nodeSize + 1)));
      }
      return true;
    }).run();
    setTarget(null);
  };

  const duplicate = () => {
    const found = nodeAtTarget();
    if (!found) return;
    editor.chain().focus().command(({ tr }) => {
      tr.insert(found.pos + found.node.nodeSize, found.node.copy(found.node.content));
      return true;
    }).run();
  };

  const remove = () => {
    const found = nodeAtTarget();
    if (!found) return;
    editor.chain().focus().command(({ tr }) => {
      tr.delete(found.pos, found.pos + found.node.nodeSize);
      return true;
    }).run();
    setTarget(null);
  };

  const current = nodeAtTarget();
  const isCallout = current?.node.type.name === "callout";
  const canColorBlock = !!current && ["paragraph", "heading"].includes(current.node.type.name);

  // Cor do texto do bloco inteiro.
  const setBlockTextColor = (color: string | null) => {
    if (!current) return;
    const from = current.pos;
    const to = current.pos + current.node.nodeSize;
    const c = editor.chain().focus().setTextSelection({ from, to });
    (color ? c.setColor(color) : c.unsetColor())
      .command(({ tr }) => { tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1))); return true; })
      .run();
  };

  // Fundo colorido do parágrafo ou título.
  const setBlockBg = (color: string | null) => {
    if (!current) return;
    editor.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(current.pos, undefined, { ...current.node.attrs, blockColor: color });
      return true;
    }).run();
  };

  return (
    <div
      data-block-handle
      className="absolute -left-12 z-20 hidden items-center gap-0.5 md:flex"
      style={{ top: target.top }}
    >
      <button
        type="button"
        title="Inserir bloco abaixo"
        aria-label="Inserir bloco abaixo"
        onClick={insertBelow}
        className="flex h-6 w-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>

      <DropdownMenu open={menuOpen} onOpenChange={(o) => { setMenuOpen(o); if (!o) setTarget(null); }} modal={false}>
        <DropdownMenuTrigger asChild>
          <span className="pointer-events-none absolute left-6 top-0 h-6 w-5" aria-hidden />
        </DropdownMenuTrigger>
        <button
          type="button"
          draggable
          title="Arraste para mover · clique para opções"
          aria-label="Opções do bloco"
          onDragStart={onDragStart}
          onClick={() => setMenuOpen(true)}
          className="flex h-6 w-5 cursor-grab items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <DropdownMenuContent align="start" side="left" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Repeat2 className="mr-2 h-4 w-4" /> Transformar em</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {TRANSFORM_ITEMS.map((b) => {
                const Icon = b.icon;
                return (
                  <DropdownMenuItem
                    key={b.id}
                    onSelect={() => {
                      if (current) selectInside(current.pos);
                      b.run(editor, actions);
                    }}
                  >
                    <Icon className="mr-2 h-4 w-4" /> {b.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Palette className="mr-2 h-4 w-4" /> Cor do bloco</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Cores do texto</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setBlockTextColor(null)}>
                <span className="mr-2 w-4 text-center font-semibold">A</span> Padrão
              </DropdownMenuItem>
              {TEXT_COLORS.map((c) => (
                <DropdownMenuItem key={c.value} onSelect={() => setBlockTextColor(c.value)}>
                  <span className="mr-2 w-4 text-center font-semibold" style={{ color: c.value }}>A</span> {c.name}
                </DropdownMenuItem>
              ))}
              {canColorBlock && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Cores do bloco</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setBlockBg(null)}>
                    <Ban className="mr-2 h-4 w-4" /> Remover plano de fundo
                  </DropdownMenuItem>
                  {COLOR_NAMES.map((c) => (
                    <DropdownMenuItem key={c} onSelect={() => setBlockBg(c)}>
                      <span className="doc-banner-sample mr-2 h-4 w-4 rounded" data-color={c} /> Fundo {COLOR_LABELS[c].toLowerCase()}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {isCallout && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Bookmark className="mr-2 h-4 w-4" /> Cor da faixa</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
                {BANNER_VARIANTS.map((v) => (
                  <DropdownMenuItem
                    key={v.value}
                    onSelect={() => {
                      if (!current) return;
                      editor.chain().focus().command(({ tr }) => {
                        tr.setNodeMarkup(current.pos, undefined, { ...current.node.attrs, variant: v.value });
                        return true;
                      }).run();
                    }}
                  >
                    <span className="mr-2 flex"><SwatchIcon swatch={{ kind: "banner", color: v.color, strong: v.strong }} /></span> {v.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => move(-1)}><ArrowUp className="mr-2 h-4 w-4" /> Mover para cima</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => move(1)}><ArrowDown className="mr-2 h-4 w-4" /> Mover para baixo</DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicate}><Copy className="mr-2 h-4 w-4" /> Duplicar</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={remove}>
            <Trash2 className="mr-2 h-4 w-4" /> Excluir bloco
          </DropdownMenuItem>
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            Dica: arraste a alça para mudar o bloco de lugar.
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
