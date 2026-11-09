import type { Editor } from "@tiptap/react";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLOR_LABELS, COLOR_NAMES, FILL_COLORS, TEXT_COLORS, type ColorName } from "./palette";

const noFocusSteal = (e: React.MouseEvent) => e.preventDefault();

function Title({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 mt-2 text-[11px] text-muted-foreground first:mt-0">{children}</div>;
}

// Selo de exemplo: mesma aparência do selo no texto.
export function BadgeSample({ color, strong, className }: { color: ColorName; strong: boolean; className?: string }) {
  return <span className={cn("doc-badge inline-block h-4 w-4 p-0", className)} data-color={color} data-strong={strong ? "true" : undefined} />;
}

// Painel único de cores (como o "A" do ClickUp): cor do texto, marca-texto e selos.
export function ColorPanel({ editor, onDone }: { editor: Editor; onDone?: () => void }) {
  const chain = () => editor.chain().focus();
  const run = (fn: () => void) => { fn(); onDone?.(); };
  const current = editor.getAttributes("textStyle").color as string | undefined;

  return (
    <div className="w-[236px]">
      <Title>Cores do texto</Title>
      <div className="flex gap-1">
        {TEXT_COLORS.map((c) => (
          <button
            key={c.value} type="button" title={c.name} aria-label={`Texto ${c.name}`} onMouseDown={noFocusSteal}
            onClick={() => run(() => chain().setColor(c.value).run())}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md border border-border text-sm font-semibold hover:bg-accent",
              current === c.value && "ring-2 ring-primary",
            )}
            style={{ color: c.value }}
          >
            A
          </button>
        ))}
      </div>

      <Title>Destaques do texto</Title>
      <div className="flex gap-1">
        {FILL_COLORS.map((c) => (
          <button
            key={c.value} type="button" title={c.name} aria-label={`Realce ${c.name}`} onMouseDown={noFocusSteal}
            onClick={() => run(() => chain().setHighlight({ color: c.value }).run())}
            className="h-6 w-6 rounded-full border border-border transition hover:scale-110"
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>

      <Title>Selos</Title>
      {[true, false].map((strong) => (
        <div key={String(strong)} className="mb-1 flex gap-1">
          {COLOR_NAMES.map((c) => (
            <button
              key={c} type="button" title={`Selo ${COLOR_LABELS[c].toLowerCase()}${strong ? " forte" : ""}`}
              aria-label={`Selo ${COLOR_LABELS[c]}${strong ? " forte" : ""}`} onMouseDown={noFocusSteal}
              onClick={() => run(() => chain().setBadge({ color: c, strong }).run())}
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent"
            >
              <BadgeSample color={c} strong={strong} />
            </button>
          ))}
        </div>
      ))}

      <button
        type="button" onMouseDown={noFocusSteal}
        onClick={() => run(() => chain().unsetColor().unsetHighlight().unsetBadge().run())}
        className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Ban className="h-3.5 w-3.5" /> Remover cor
      </button>
    </div>
  );
}
