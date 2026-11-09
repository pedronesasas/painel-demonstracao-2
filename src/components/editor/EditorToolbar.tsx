import { useEditorState, type Editor } from "@tiptap/react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Code as CodeIcon,
  AlignLeft, AlignCenter, AlignRight, List, ListOrdered, ListChecks, Link as LinkIcon,
  ImageIcon, Table as TableIcon, Plus, Undo2, Redo2, ChevronDown, Eraser, Trash2,
  ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, TableCellsMerge,
  TableCellsSplit, Rows3, Columns3, PaintBucket, ALargeSmall,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BLOCK_ITEMS, TRANSFORM_ITEMS } from "./blocks";
import { ColorPanel } from "./ColorPanel";
import { FILL_COLORS, FONT_SIZES } from "./palette";
import type { EditorActions } from "./useEditorActions";

// Impede que o menu devolva o foco ao botão quando fecha: o foco tem que voltar ao texto.
const keepEditorFocus = (e: Event) => e.preventDefault();

function ToolButton({
  title, active, disabled, onClick, children, size,
}: {
  title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; size: "sm" | "md";
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md text-foreground/80 transition-colors",
        "hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-35",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        active && "bg-primary/15 text-primary",
      )}
    >
      {children}
    </button>
  );
}

const MenuTrigger = forwardRef<
  HTMLButtonElement,
  { title: string; children: ReactNode; active?: boolean; size: "sm" | "md" } & ButtonHTMLAttributes<HTMLButtonElement>
>(function MenuTrigger({ title, children, active, size, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      {...rest}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 text-foreground/80 transition-colors",
        "hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent",
        size === "sm" ? "h-7 text-xs" : "h-8 text-sm",
        active && "bg-primary/15 text-primary",
        className,
      )}
    >
      {children}
      <ChevronDown className="h-3 w-3 opacity-60" />
    </button>
  );
});

function Swatches({
  colors, onPick, onClear, clearLabel,
}: {
  colors: Array<{ name: string; value: string }>; onPick: (v: string) => void; onClear: () => void; clearLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-9 gap-1">
        {colors.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            aria-label={c.name}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c.value)}
            className="h-6 w-6 rounded-md ring-1 ring-border transition hover:scale-110"
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClear}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Eraser className="h-3.5 w-3.5" /> {clearLabel}
      </button>
    </div>
  );
}

const Sep = () => <div className="mx-1 h-5 w-px shrink-0 bg-border" />;

export function EditorToolbar({
  editor, actions, size = "md", className, right,
}: {
  editor: Editor;
  actions: EditorActions;
  size?: "sm" | "md";
  className?: string;
  right?: ReactNode;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const style = e.getAttributes("textStyle");
      return {
        editable: e.isEditable,
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        link: e.isActive("link"),
        color: (style.color as string | undefined) ?? null,
        fontSize: (style.fontSize as string | undefined) ?? null,
        alignCenter: e.isActive({ textAlign: "center" }),
        alignRight: e.isActive({ textAlign: "right" }),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        task: e.isActive("taskList"),
        inTable: e.isActive("table"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        canMerge: e.can().mergeCells(),
        canSplit: e.can().splitCell(),
        blockLabel: TRANSFORM_ITEMS.find((b) => b.id.startsWith("h") && b.isActive?.(e))?.label
          ?? (e.isActive("codeBlock") ? "Código" : "Texto"),
      };
    },
  });

  if (!s || !s.editable) return null;

  const chain = () => editor.chain().focus();
  const fontLabel = FONT_SIZES.find((f) => f.value === s.fontSize)?.label ?? "Normal";

  return (
    <div className={cn("flex flex-wrap items-center gap-0.5", className)} role="toolbar" aria-label="Formatação">
      <ToolButton size={size} title="Desfazer (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Refazer (Ctrl+Y)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolButton>
      <Sep />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <MenuTrigger size={size} title="Tipo de bloco"><span className="w-16 text-left">{s.blockLabel}</span></MenuTrigger>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={keepEditorFocus}>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Transformar em</DropdownMenuLabel>
          {TRANSFORM_ITEMS.map((b) => {
            const Icon = b.icon;
            return (
              <DropdownMenuItem key={b.id} onSelect={() => b.run(editor, actions)}>
                <Icon className="mr-2 h-4 w-4" /> {b.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <MenuTrigger size={size} title="Tamanho da letra">
            <ALargeSmall className="h-4 w-4" />
            {size === "md" && <span className="w-12 text-left">{fontLabel}</span>}
          </MenuTrigger>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40" onCloseAutoFocus={keepEditorFocus}>
          {FONT_SIZES.map((f) => (
            <DropdownMenuItem
              key={f.label}
              onSelect={() => (f.value ? chain().setFontSize(f.value).run() : chain().unsetFontSize().run())}
            >
              <span style={{ fontSize: f.value ?? undefined }}>{f.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Sep />

      <ToolButton size={size} title="Negrito (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Itálico (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Sublinhado (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <UnderlineIcon className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Tachado" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Código no texto" active={s.code} onClick={() => chain().toggleCode().run()}>
        <CodeIcon className="h-4 w-4" />
      </ToolButton>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button" title="Cores do texto, destaque e selo" aria-label="Cores" onMouseDown={(e) => e.preventDefault()}
            className={cn("inline-flex shrink-0 items-center justify-center rounded-md text-foreground/80 hover:bg-accent", size === "sm" ? "h-7 w-7" : "h-8 w-8")}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded border border-border text-xs font-bold" style={{ color: s.color ?? undefined }}>A</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2.5" align="start" onCloseAutoFocus={keepEditorFocus}>
          <ColorPanel editor={editor} />
        </PopoverContent>
      </Popover>
      <Sep />

      <ToolButton size={size} title="Alinhar à esquerda" active={!s.alignCenter && !s.alignRight} onClick={() => chain().setTextAlign("left").run()}>
        <AlignLeft className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Centralizar" active={s.alignCenter} onClick={() => chain().setTextAlign("center").run()}>
        <AlignCenter className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Alinhar à direita" active={s.alignRight} onClick={() => chain().setTextAlign("right").run()}>
        <AlignRight className="h-4 w-4" />
      </ToolButton>
      <Sep />

      <ToolButton size={size} title="Lista" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Lista numerada" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Checklist" active={s.task} onClick={() => chain().toggleTaskList().run()}>
        <ListChecks className="h-4 w-4" />
      </ToolButton>
      <Sep />

      <ToolButton size={size} title="Link (Ctrl+K)" active={s.link} onClick={actions.editLink}>
        <LinkIcon className="h-4 w-4" />
      </ToolButton>
      <ToolButton size={size} title="Imagem" onClick={actions.pickImage}>
        <ImageIcon className="h-4 w-4" />
      </ToolButton>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <MenuTrigger size={size} title="Tabela" active={s.inTable}>
            <TableIcon className="h-4 w-4" />
          </MenuTrigger>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64" onCloseAutoFocus={keepEditorFocus}>
          {!s.inTable ? (
            <>
              <DropdownMenuItem onSelect={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                <TableIcon className="mr-2 h-4 w-4" /> Inserir tabela 3 × 3
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => chain().insertTable({ rows: 5, cols: 4, withHeaderRow: true }).run()}>
                <TableIcon className="mr-2 h-4 w-4" /> Inserir tabela 5 × 4
              </DropdownMenuItem>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Clique dentro de uma tabela para ver as opções dela aqui.
              </div>
            </>
          ) : (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Linhas e colunas</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => chain().addRowBefore().run()}><ArrowUpToLine className="mr-2 h-4 w-4" /> Linha acima</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => chain().addRowAfter().run()}><ArrowDownToLine className="mr-2 h-4 w-4" /> Linha abaixo</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => chain().addColumnBefore().run()}><ArrowLeftToLine className="mr-2 h-4 w-4" /> Coluna à esquerda</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => chain().addColumnAfter().run()}><ArrowRightToLine className="mr-2 h-4 w-4" /> Coluna à direita</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => chain().toggleHeaderRow().run()}><Rows3 className="mr-2 h-4 w-4" /> Primeira linha como cabeçalho</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => chain().toggleHeaderColumn().run()}><Columns3 className="mr-2 h-4 w-4" /> Primeira coluna como cabeçalho</DropdownMenuItem>
              <DropdownMenuItem disabled={!s.canMerge} onSelect={() => chain().mergeCells().run()}><TableCellsMerge className="mr-2 h-4 w-4" /> Mesclar células</DropdownMenuItem>
              <DropdownMenuItem disabled={!s.canSplit} onSelect={() => chain().splitCell().run()}><TableCellsSplit className="mr-2 h-4 w-4" /> Dividir célula</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PaintBucket className="h-3.5 w-3.5" /> Cor das células selecionadas
              </DropdownMenuLabel>
              <div className="px-2 pb-2">
                <Swatches
                  colors={FILL_COLORS}
                  onPick={(v) => chain().setCellAttribute("backgroundColor", v).run()}
                  onClear={() => chain().setCellAttribute("backgroundColor", null).run()}
                  clearLabel="Sem cor"
                />
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  Arraste o mouse sobre várias células para colorir ou mesclar de uma vez.
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => chain().deleteRow().run()}><Trash2 className="mr-2 h-4 w-4" /> Excluir linha</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => chain().deleteColumn().run()}><Trash2 className="mr-2 h-4 w-4" /> Excluir coluna</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => chain().deleteTable().run()}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir tabela
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <MenuTrigger size={size} title="Inserir"><Plus className="h-4 w-4" />{size === "md" && "Inserir"}</MenuTrigger>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60" onCloseAutoFocus={keepEditorFocus}>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Dica: digite "/" no texto</DropdownMenuLabel>
          {BLOCK_ITEMS.filter((b) => !b.transform || ["callout", "details", "code", "quote"].includes(b.id)).map((b) => {
            const Icon = b.icon;
            return (
              <DropdownMenuItem key={b.id} onSelect={() => b.run(editor, actions)}>
                <Icon className="mr-2 h-4 w-4" /> {b.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {right && <div className="ml-auto flex items-center">{right}</div>}
    </div>
  );
}
