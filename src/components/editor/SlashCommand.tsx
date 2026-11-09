import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { filterBlocks, type BlockItem, type Swatch } from "./blocks";
import type { EditorActions } from "./useEditorActions";

type MenuHandle = { onKeyDown: (event: KeyboardEvent) => boolean };
type MenuProps = SuggestionProps<BlockItem, BlockItem>;

export function SwatchIcon({ swatch }: { swatch: Swatch }) {
  if (swatch.kind === "text") {
    return <span className="text-sm font-semibold" style={{ color: swatch.value ?? undefined }}>A</span>;
  }
  if (swatch.kind === "fill") {
    return swatch.value
      ? <span className="h-4 w-4 rounded-full" style={{ backgroundColor: swatch.value }} />
      : <span className="h-4 w-4 rounded-full border border-dashed border-muted-foreground" />;
  }
  if (swatch.kind === "badge") {
    return swatch.color
      ? <span className="doc-badge inline-block h-4 w-4 p-0" data-color={swatch.color} data-strong={swatch.strong ? "true" : undefined} />
      : <span className="h-4 w-4 rounded border border-dashed border-muted-foreground" />;
  }
  return <span className="doc-banner-sample h-4 w-4 rounded" data-color={swatch.color} data-strong={swatch.strong ? "true" : undefined} />;
}

// Para onde vai a seta: o item mais próximo na direção, olhando a posição na tela
// (o menu tem duas colunas, então "para baixo" não é sempre o próximo da lista).
function nextByGeometry(list: HTMLElement, from: number, dir: "up" | "down"): number | null {
  const items = Array.from(list.querySelectorAll<HTMLElement>("[data-index]"));
  const cur = items.find((el) => Number(el.dataset.index) === from);
  if (!cur) return null;
  const c = cur.getBoundingClientRect();
  let best: { i: number; dy: number; dx: number } | null = null;
  for (const el of items) {
    const r = el.getBoundingClientRect();
    const dy = dir === "down" ? r.top - c.top : c.top - r.top;
    if (dy < 4) continue;
    const dx = Math.abs(r.left - c.left);
    if (!best || dy < best.dy - 2 || (Math.abs(dy - best.dy) <= 2 && dx < best.dx)) {
      best = { i: Number(el.dataset.index), dy, dx };
    }
  }
  return best ? best.i : null;
}

const SlashMenu = forwardRef<MenuHandle, MenuProps>(function SlashMenu({ items, command, query }, ref) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Sem nada digitado: duas colunas por seção, como no ClickUp. Com busca: uma lista só.
  const grid = !query;

  const sections = useMemo(() => {
    const out: Array<{ title: string; items: Array<{ item: BlockItem; i: number }> }> = [];
    items.forEach((item, i) => {
      const last = out[out.length - 1];
      if (last && last.title === item.section) last.items.push({ item, i });
      else out.push({ title: item.section, items: [{ item, i }] });
    });
    return out;
  }, [items]);

  useEffect(() => setIndex(0), [items]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;
      const step = (d: number) => setIndex((i) => (i + d + items.length) % items.length);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const dir = event.key === "ArrowDown" ? "down" : "up";
        const next = grid && listRef.current ? nextByGeometry(listRef.current, index, dir) : null;
        if (next != null) setIndex(next);
        else step(dir === "down" ? 1 : -1);
        return true;
      }
      if (grid && event.key === "ArrowRight") { step(1); return true; }
      if (grid && event.key === "ArrowLeft") { step(-1); return true; }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[index];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }), [items, index, command, grid]);

  return (
    <div
      ref={listRef}
      className={cn(
        "max-h-[22rem] overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl",
        grid ? "w-[30rem] max-w-[calc(100vw-16px)]" : "w-72",
      )}
    >
      {items.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">Nada encontrado</div>
      ) : (
        sections.map((s) => (
          <div key={s.title} className="mb-1 last:mb-0">
            <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</div>
            <div className={cn(grid && "grid grid-cols-2 gap-x-1")}>
              {s.items.map(({ item, i }) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-index={i}
                    title={item.description}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => command(item)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
                      i === index ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                      {item.swatch ? <SwatchIcon swatch={item.swatch} /> : <Icon className="h-4 w-4" />}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
});

type SlashOptions = { getActions: () => EditorActions | null };

// Menu "/" (como no ClickUp e no Notion): digitar "/" no começo da linha ou depois
// de um espaço abre a lista de blocos; o texto digitado depois filtra a lista.
export const SlashCommand = Extension.create<SlashOptions>({
  name: "slashCommand",

  addOptions() {
    return { getActions: () => null };
  },

  addProseMirrorPlugins() {
    const getActions = () => this.options.getActions();
    return [
      Suggestion<BlockItem, BlockItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommand"),
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return !$from.parent.type.spec.code;
        },
        items: ({ query }) => filterBlocks(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          const actions = getActions();
          if (actions) props.run(editor, actions);
        },
        render: () => {
          let component: ReactRenderer<MenuHandle, MenuProps> | null = null;
          let host: HTMLDivElement | null = null;

          const place = (props: MenuProps) => {
            const rect = props.clientRect?.();
            if (!rect || !host) return;
            const h = host.offsetHeight || 352;
            const w = host.offsetWidth || 480;
            const below = window.innerHeight - rect.bottom;
            const top = below < h + 12 && rect.top > h + 12 ? rect.top - h - 6 : rect.bottom + 6;
            host.style.top = `${Math.max(8, top)}px`;
            host.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))}px`;
          };

          return {
            onStart: (props) => {
              host = document.createElement("div");
              host.style.position = "fixed";
              host.style.zIndex = "100";
              // Fica fora de janelas do Radix (ex.: card aberto). Sem isso, o clique
              // no menu fecharia a janela ou seria bloqueado.
              host.style.pointerEvents = "auto";
              host.addEventListener("pointerdown", (e) => e.stopPropagation());
              host.addEventListener("mousedown", (e) => e.preventDefault());
              document.body.appendChild(host);
              component = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              host.appendChild(component.element);
              place(props);
              requestAnimationFrame(() => place(props));
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              place(props);
              requestAnimationFrame(() => place(props));
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === "Escape") return true;
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              component?.destroy();
              host?.remove();
              component = null;
              host = null;
            },
          };
        },
      }),
    ];
  },
});
