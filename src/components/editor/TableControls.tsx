import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import {
  BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart, Bold, Italic,
  UnderlineIcon, Strikethrough, Code as CodeIcon, AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, TableCellsMerge, TableCellsSplit, Trash2, MoreHorizontal,
  Eraser, Plus, GripHorizontal, GripVertical, Rows3, Columns3, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ColorPanel } from "./ColorPanel";
import { BarSep, Btn, DropBtn, InlineMenu, MenuItem, MenuLabel, MenuSep } from "./menu-bits";
import { FILL_COLORS } from "./palette";

const CELL_ROLES = new Set(["cell", "header_cell"]);

// Posição (no documento) da célula ou da tabela que contém um elemento da tela.
function posOf(view: EditorView, el: HTMLElement, roles: Set<string>): number | null {
  try {
    const $p = view.state.doc.resolve(view.posAtDOM(el, 0));
    for (let d = $p.depth; d > 0; d--) {
      if (roles.has($p.node(d).type.spec.tableRole as string)) return $p.before(d);
    }
  } catch { /* elemento fora do editor */ }
  return null;
}

// Onde fica a seleção atual dentro de uma tabela (célula com o cursor ou várias
// células selecionadas): a borda esquerda dela e o retângulo da tabela inteira.
function selectionBox(view: EditorView): { left: number; table: DOMRect } | null {
  const sel = view.state.selection;
  const cells: HTMLElement[] = [];
  if (sel instanceof CellSelection) {
    sel.forEachCell((_node, pos) => {
      const dom = view.nodeDOM(pos);
      if (dom instanceof HTMLElement) cells.push(dom);
    });
  } else {
    const $from = sel.$from;
    for (let d = $from.depth; d > 0; d--) {
      if (CELL_ROLES.has($from.node(d).type.spec.tableRole as string)) {
        const dom = view.nodeDOM($from.before(d));
        if (dom instanceof HTMLElement) cells.push(dom);
        break;
      }
    }
  }
  const table = cells[0]?.closest("table");
  if (!table) return null;
  return { left: Math.min(...cells.map((c) => c.getBoundingClientRect().left)), table: table.getBoundingClientRect() };
}

type Hover = { table: HTMLTableElement; cell: HTMLElement };

// Controles de tabela no estilo do ClickUp: alças para selecionar linha e coluna,
// botões "+" nas bordas e uma barra própria em cima das células selecionadas.
export function TableControls({
  editor, containerRef, compact = false,
}: {
  editor: Editor;
  containerRef: RefObject<HTMLDivElement | null>;
  compact?: boolean;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const keep = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };
    const onMove = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-table-ui]")) { keep(); return; }
      const cell = t.closest<HTMLElement>("td, th");
      const table = cell?.closest("table");
      if (cell && table && editor.view.dom.contains(table)) {
        keep();
        setHover((h) => (h?.cell === cell ? h : { table, cell }));
      } else if (!hideTimer.current) {
        hideTimer.current = setTimeout(() => { setHover(null); hideTimer.current = null; }, 350);
      }
    };
    const onLeave = () => {
      if (!hideTimer.current) hideTimer.current = setTimeout(() => { setHover(null); hideTimer.current = null; }, 350);
    };
    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", onLeave);
      keep();
    };
  }, [editor, containerRef]);

  // Redesenha quando o texto, a seleção ou a rolagem mudam.
  useEffect(() => {
    editor.on("transaction", redraw);
    window.addEventListener("scroll", redraw, true);
    window.addEventListener("resize", redraw);
    return () => {
      editor.off("transaction", redraw);
      window.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw);
    };
  }, [editor]);

  const container = containerRef.current;
  if (!container || !editor.isEditable) return null;
  const view = editor.view;
  const c = container.getBoundingClientRect();
  const chain = () => editor.chain().focus();

  // ---------- Alças e botões "+" da tabela sob o mouse ----------
  let handles: React.ReactNode = null;
  if (hover && hover.table.isConnected && hover.cell.isConnected) {
    const t = hover.table.getBoundingClientRect();
    const wrap = hover.table.closest(".tableWrapper")?.getBoundingClientRect() ?? t;
    const right = Math.min(t.right, wrap.right);
    const r = hover.cell.getBoundingClientRect();
    const row = hover.cell.closest("tr")?.getBoundingClientRect() ?? r;

    const cellPos = () => posOf(view, hover.cell, CELL_ROLES);
    const selectCol = () => {
      const pos = cellPos();
      if (pos == null) return;
      chain().command(({ tr }) => { tr.setSelection(CellSelection.colSelection(tr.doc.resolve(pos))); return true; }).run();
    };
    const selectRow = () => {
      const pos = cellPos();
      if (pos == null) return;
      chain().command(({ tr }) => { tr.setSelection(CellSelection.rowSelection(tr.doc.resolve(pos))); return true; }).run();
    };
    // Põe o cursor na última coluna (ou linha) e adiciona depois dela.
    const addAtEnd = (what: "col" | "row") => {
      const tablePos = posOf(view, hover.cell, new Set(["table"]));
      if (tablePos == null) return;
      const table = editor.state.doc.nodeAt(tablePos);
      if (!table) return;
      const map = TableMap.get(table);
      const rel = what === "col" ? map.map[map.width - 1] : map.map[(map.height - 1) * map.width];
      const at = tablePos + 1 + rel;
      const c2 = chain().command(({ tr }) => { tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))); return true; });
      (what === "col" ? c2.addColumnAfter() : c2.addRowAfter()).run();
    };

    const handleCls = "absolute z-20 flex items-center justify-center rounded border border-border bg-popover text-muted-foreground shadow-sm transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground";
    const plusCls = "absolute z-10 flex items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground";

    handles = (
      <>
        <button
          type="button" data-table-ui title="Selecionar coluna" aria-label="Selecionar coluna"
          onMouseDown={(e) => e.preventDefault()} onClick={selectCol}
          className={cn(handleCls, "h-3 w-5")}
          style={{ left: r.left - c.left + r.width / 2 - 10, top: t.top - c.top - 6 }}
        >
          <GripHorizontal className="h-3 w-3" />
        </button>
        <button
          type="button" data-table-ui title="Selecionar linha" aria-label="Selecionar linha"
          onMouseDown={(e) => e.preventDefault()} onClick={selectRow}
          className={cn(handleCls, "h-5 w-3")}
          style={{ left: t.left - c.left - (compact ? -1 : 6), top: row.top - c.top + row.height / 2 - 10 }}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        {!compact && (
          <button
            type="button" data-table-ui title="Adicionar coluna" aria-label="Adicionar coluna"
            onMouseDown={(e) => e.preventDefault()} onClick={() => addAtEnd("col")}
            className={cn(plusCls, "w-4")}
            style={{ left: right - c.left + 2, top: t.top - c.top, height: t.height }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button" data-table-ui title="Adicionar linha" aria-label="Adicionar linha"
          onMouseDown={(e) => e.preventDefault()} onClick={() => addAtEnd("row")}
          className={cn(plusCls, "h-4")}
          style={{ left: t.left - c.left, top: t.bottom - c.top + 2, width: right - t.left }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  // ---------- Barra da tabela (aparece com o cursor numa célula) ----------
  let bar: React.ReactNode = null;
  const sel = editor.state.selection;
  const isCells = sel instanceof CellSelection;
  const inTable = editor.isActive("table");
  const textSelected = !isCells && !sel.empty;
  const box = inTable && !textSelected ? selectionBox(view) : null;
  if (box) {
    const colSel = isCells && (sel as CellSelection).isColSelection();
    const rowSel = isCells && (sel as CellSelection).isRowSelection();
    // Fica logo acima da tabela (sem cobrir o texto), alinhada com a célula.
    const above = box.table.top - c.top - 44;
    const top = above < -8 && compact ? box.table.bottom - c.top + 22 : above;
    const left = Math.max(compact ? 0 : -8, Math.min(box.left - c.left, c.width - 120));
    const can = editor.can();
    const alignCenter = editor.isActive({ textAlign: "center" });
    const alignRight = editor.isActive({ textAlign: "right" });
    const AlignIcon = alignCenter ? AlignCenter : alignRight ? AlignRight : AlignLeft;

    bar = (
      <div
        data-table-ui
        className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-1 shadow-xl"
        style={{ top, left }}
      >
        {colSel && !rowSel && (
          <>
            <Btn title="Inserir coluna à esquerda" onClick={() => chain().addColumnBefore().run()}><BetweenVerticalStart className="h-4 w-4" /></Btn>
            <Btn title="Inserir coluna à direita" onClick={() => chain().addColumnAfter().run()}><BetweenVerticalEnd className="h-4 w-4" /></Btn>
            <BarSep />
          </>
        )}
        {rowSel && !colSel && (
          <>
            <Btn title="Inserir linha acima" onClick={() => chain().addRowBefore().run()}><BetweenHorizontalStart className="h-4 w-4" /></Btn>
            <Btn title="Inserir linha abaixo" onClick={() => chain().addRowAfter().run()}><BetweenHorizontalEnd className="h-4 w-4" /></Btn>
            <BarSep />
          </>
        )}
        {isCells ? (
          <InlineMenu trigger={(toggle, open) => (
            <DropBtn title="Mesclar" open={open} onClick={toggle}><TableCellsMerge className="h-4 w-4" /></DropBtn>
          )}>
            {(close) => (
              <>
                <MenuItem disabled={!can.mergeCells()} onClick={() => { chain().mergeCells().run(); close(); }}>
                  <TableCellsMerge className="h-4 w-4" /> Mesclar células
                </MenuItem>
                <MenuItem disabled={!can.splitCell()} onClick={() => { chain().splitCell().run(); close(); }}>
                  <TableCellsSplit className="h-4 w-4" /> Desfazer mesclagem
                </MenuItem>
              </>
            )}
          </InlineMenu>
        ) : can.splitCell() && (
          <Btn title="Desfazer mesclagem" onClick={() => chain().splitCell().run()}><TableCellsSplit className="h-4 w-4" /></Btn>
        )}

        <InlineMenu trigger={(toggle, open) => (
          <DropBtn title="Cor da célula" open={open} onClick={toggle}>
            <span className="h-4 w-4 rounded-full border border-border bg-[conic-gradient(var(--color-destructive),var(--color-warning),var(--color-success),var(--color-primary),var(--color-destructive))]" />
          </DropBtn>
        )}>
          {(close) => (
            <div className="flex items-center gap-1">
              <button
                type="button" title="Sem cor" aria-label="Sem cor" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { chain().setCellAttribute("backgroundColor", null).run(); close(); }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent"
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
              {FILL_COLORS.map((f) => (
                <button
                  key={f.value} type="button" title={f.name} aria-label={`Célula ${f.name}`} onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { chain().setCellAttribute("backgroundColor", f.value).run(); close(); }}
                  className="h-6 w-6 rounded-full border border-border transition hover:scale-110"
                  style={{ backgroundColor: f.value }}
                />
              ))}
            </div>
          )}
        </InlineMenu>

        <InlineMenu width="15rem" trigger={(toggle, open) => (
          <DropBtn title="Alinhamento" open={open} onClick={toggle}><AlignIcon className="h-4 w-4" /></DropBtn>
        )}>
          {(close) => (
            <>
              <MenuItem checked={!alignCenter && !alignRight} hint="Ctrl+Shift+L" onClick={() => { chain().setTextAlign("left").run(); close(); }}>
                <AlignLeft className="h-4 w-4" /> Alinhar à esquerda
              </MenuItem>
              <MenuItem checked={alignCenter} hint="Ctrl+Shift+E" onClick={() => { chain().setTextAlign("center").run(); close(); }}>
                <AlignCenter className="h-4 w-4" /> Alinhar no centro
              </MenuItem>
              <MenuItem checked={alignRight} hint="Ctrl+Shift+R" onClick={() => { chain().setTextAlign("right").run(); close(); }}>
                <AlignRight className="h-4 w-4" /> Alinhar à direita
              </MenuItem>
              <MenuSep />
              <MenuItem onClick={() => { chain().setCellAttribute("verticalAlign", null).run(); close(); }}>
                <AlignVerticalJustifyStart className="h-4 w-4" /> Alinhar em cima
              </MenuItem>
              <MenuItem onClick={() => { chain().setCellAttribute("verticalAlign", "middle").run(); close(); }}>
                <AlignVerticalJustifyCenter className="h-4 w-4" /> Centralizar na altura
              </MenuItem>
              <MenuItem onClick={() => { chain().setCellAttribute("verticalAlign", "bottom").run(); close(); }}>
                <AlignVerticalJustifyEnd className="h-4 w-4" /> Alinhar embaixo
              </MenuItem>
            </>
          )}
        </InlineMenu>

        {isCells && (
          <>
            <BarSep />
            <Btn title="Negrito" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
            <Btn title="Itálico" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
            <Btn title="Sublinhado" active={editor.isActive("underline")} onClick={() => chain().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></Btn>
            <Btn title="Tachado" active={editor.isActive("strike")} onClick={() => chain().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Btn>
            <Btn title="Código no texto" active={editor.isActive("code")} onClick={() => chain().toggleCode().run()}><CodeIcon className="h-4 w-4" /></Btn>
            <InlineMenu trigger={(toggle) => (
              <Btn title="Cores do texto" onClick={toggle}>
                <span className="flex h-5 w-5 items-center justify-center rounded border border-border text-xs font-bold">A</span>
              </Btn>
            )}>
              {(close) => <ColorPanel editor={editor} onDone={close} />}
            </InlineMenu>
            <Btn title="Limpar formato" onClick={() => chain().unsetAllMarks().run()}><Eraser className="h-4 w-4" /></Btn>
          </>
        )}

        {(colSel || rowSel) && (
          <Btn
            danger
            title={colSel && rowSel ? "Excluir tabela" : colSel ? "Excluir coluna" : "Excluir linha"}
            onClick={() => (colSel && rowSel ? chain().deleteTable().run() : colSel ? chain().deleteColumn().run() : chain().deleteRow().run())}
          >
            <Trash2 className="h-4 w-4" />
          </Btn>
        )}

        <InlineMenu align="right" width="15rem" trigger={(toggle) => (
          <Btn title="Mais opções da tabela" onClick={toggle}><MoreHorizontal className="h-4 w-4" /></Btn>
        )}>
          {(close) => (
            <>
              <MenuLabel>Linhas e colunas</MenuLabel>
              <MenuItem onClick={() => { chain().addRowBefore().run(); close(); }}><BetweenHorizontalStart className="h-4 w-4" /> Inserir linha acima</MenuItem>
              <MenuItem onClick={() => { chain().addRowAfter().run(); close(); }}><BetweenHorizontalEnd className="h-4 w-4" /> Inserir linha abaixo</MenuItem>
              <MenuItem onClick={() => { chain().addColumnBefore().run(); close(); }}><BetweenVerticalStart className="h-4 w-4" /> Inserir coluna à esquerda</MenuItem>
              <MenuItem onClick={() => { chain().addColumnAfter().run(); close(); }}><BetweenVerticalEnd className="h-4 w-4" /> Inserir coluna à direita</MenuItem>
              <MenuSep />
              <MenuItem onClick={() => { chain().toggleHeaderRow().run(); close(); }}><Rows3 className="h-4 w-4" /> Primeira linha como cabeçalho</MenuItem>
              <MenuItem onClick={() => { chain().toggleHeaderColumn().run(); close(); }}><Columns3 className="h-4 w-4" /> Primeira coluna como cabeçalho</MenuItem>
              <MenuSep />
              <MenuItem danger onClick={() => { chain().deleteRow().run(); close(); }}><Trash2 className="h-4 w-4" /> Excluir linha</MenuItem>
              <MenuItem danger onClick={() => { chain().deleteColumn().run(); close(); }}><Trash2 className="h-4 w-4" /> Excluir coluna</MenuItem>
              <MenuItem danger onClick={() => { chain().deleteTable().run(); close(); }}><Trash2 className="h-4 w-4" /> Excluir tabela</MenuItem>
            </>
          )}
        </InlineMenu>
      </div>
    );
  }

  return (
    <>
      {handles}
      {bar}
    </>
  );
}
