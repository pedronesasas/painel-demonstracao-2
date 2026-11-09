import { useEffect, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { ListTree } from "lucide-react";
import { cn } from "@/lib/utils";

type Heading = { pos: number; level: number; text: string };

const NO_HEADINGS: Heading[] = [];

// Índice lateral com os títulos do documento (como o "Table of contents" do ClickUp).
// É montado a partir do texto, sem salvar nada no documento.
export function DocumentOutline({ editor, className }: { editor: Editor; className?: string }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const out: Heading[] = [];
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          const text = node.textContent.trim();
          if (text) out.push({ pos, level: Number(node.attrs.level) || 1, text });
          return false;
        }
        return true;
      });
      return out;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  }) ?? NO_HEADINGS;

  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const scroller = editor.view.dom.closest("main");
    if (!scroller || headings.length === 0) return;
    const onScroll = () => {
      let current: number | null = null;
      for (const h of headings) {
        const dom = editor.view.nodeDOM(h.pos);
        if (!(dom instanceof HTMLElement)) continue;
        if (dom.getBoundingClientRect().top < 140) current = h.pos;
        else break;
      }
      setActive(current ?? headings[0].pos);
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [editor, headings]);

  if (headings.length < 2) return null;
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <nav className={cn("text-sm", className)} aria-label="Índice do documento">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <ListTree className="h-3.5 w-3.5" /> Nesta página
      </div>
      <ul className="space-y-0.5 border-l border-border">
        {headings.map((h) => (
          <li key={h.pos}>
            <button
              type="button"
              onClick={() => {
                const dom = editor.view.nodeDOM(h.pos);
                if (dom instanceof HTMLElement) dom.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "-ml-px block w-full truncate border-l py-1 pr-2 text-left transition-colors",
                active === h.pos
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
              style={{ paddingLeft: `${0.75 + (h.level - minLevel) * 0.75}rem` }}
              title={h.text}
            >
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
