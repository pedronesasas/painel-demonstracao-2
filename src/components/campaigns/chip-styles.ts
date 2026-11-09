import { cn } from "@/lib/utils";

// Visual dos chips de língua (seletor da campanha e cartões da lista agrupada). Só tokens do tema.
export function languageChipClass(active: boolean, className?: string): string {
  return cn(
    "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "border-primary/50 bg-primary/15 text-foreground"
      : "border-border bg-card/60 text-muted-foreground hover:border-border-strong hover:bg-card-hover hover:text-foreground",
    className,
  );
}
