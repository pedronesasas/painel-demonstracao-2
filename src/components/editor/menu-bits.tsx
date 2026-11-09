import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Peças pequenas das barras flutuantes do editor (texto selecionado e tabela).

const keepFocus = (e: React.MouseEvent) => e.preventDefault();

// Menu simples posicionado por CSS. Os menus do Radix calculam a posição pela tela
// e "pulam" para o canto quando ficam dentro de um elemento flutuante.
export function InlineMenu({
  trigger, children, align = "left", width,
}: {
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger(() => setOpen((v) => !v), open)}
      {open && (
        <div
          className={cn(
            "absolute top-[calc(100%+6px)] z-[60] rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-xl",
            align === "left" ? "left-0" : "right-0",
          )}
          style={width ? { width } : undefined}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function Btn({
  title, active, disabled, onClick, children, danger,
}: {
  title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; danger?: boolean;
}) {
  return (
    <button
      type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md px-1 text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-35",
        active && "bg-primary/15 text-primary",
        danger && "text-destructive hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

export function DropBtn({
  title, open, onClick, children, active,
}: {
  title: string; open: boolean; onClick: () => void; children: ReactNode; active?: boolean;
}) {
  return (
    <button
      type="button" title={title} aria-label={title} aria-expanded={open}
      onMouseDown={keepFocus}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
        (open || active) && "bg-accent text-foreground",
      )}
    >
      {children}
      <ChevronDown className="h-3 w-3 opacity-60" />
    </button>
  );
}

export function MenuItem({
  onClick, children, checked, hint, danger, disabled,
}: {
  onClick: () => void; children: ReactNode; checked?: boolean; hint?: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button" disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
        "disabled:pointer-events-none disabled:opacity-40",
        danger && "text-destructive",
      )}
    >
      <span className="flex flex-1 items-center gap-2">{children}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      {checked && <Check className="h-3.5 w-3.5 text-primary" />}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">{children}</div>;
}

export const MenuSep = () => <div className="my-1 h-px bg-border" />;

export const BarSep = () => <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
