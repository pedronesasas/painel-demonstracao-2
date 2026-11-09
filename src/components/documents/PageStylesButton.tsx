import type { ReactNode } from "react";
import { CaseSensitive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type FontStyle = "sans" | "serif" | "mono";
type TextSize = "sm" | "md" | "lg";
type PageWidth = "normal" | "wide" | "full";
type ToolbarMode = "floating" | "top";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2 text-xs transition-colors",
        active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// Painel "Estilos de página" (o "Aa" do ClickUp). As escolhas valem para a pessoa
// que está lendo, em todas as páginas, e ficam salvas no navegador dela.
export function PageStylesButton({
  fontStyle, onFontStyle, textSize, onTextSize, pageWidth, onPageWidth,
  toolbarMode, onToolbarMode, showOutline, onShowOutline, canEdit,
}: {
  fontStyle: FontStyle; onFontStyle: (v: FontStyle) => void;
  textSize: TextSize; onTextSize: (v: TextSize) => void;
  pageWidth: PageWidth; onPageWidth: (v: PageWidth) => void;
  toolbarMode: ToolbarMode; onToolbarMode: (v: ToolbarMode) => void;
  showOutline: boolean; onShowOutline: (v: boolean) => void;
  canEdit: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Estilos de página" title="Estilos de página">
          <CaseSensitive className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-3">
        <div className="text-sm font-semibold">Estilos de página</div>

        <Group title="Estilo da fonte">
          <div className="flex gap-1.5">
            <Choice active={fontStyle === "sans"} onClick={() => onFontStyle("sans")}>
              <span className="text-base">Aa</span> Sistema
            </Choice>
            <Choice active={fontStyle === "serif"} onClick={() => onFontStyle("serif")}>
              <span className="font-serif text-base">Ss</span> Serifa
            </Choice>
            <Choice active={fontStyle === "mono"} onClick={() => onFontStyle("mono")}>
              <span className="font-mono text-base">00</span> Mono
            </Choice>
          </div>
        </Group>

        <Group title="Tamanho da fonte">
          <div className="flex gap-1.5">
            <Choice active={textSize === "sm"} onClick={() => onTextSize("sm")}><span className="text-xs">Aa</span> Pequeno</Choice>
            <Choice active={textSize === "md"} onClick={() => onTextSize("md")}><span className="text-sm">Aa</span> Padrão</Choice>
            <Choice active={textSize === "lg"} onClick={() => onTextSize("lg")}><span className="text-base">Aa</span> Grande</Choice>
          </div>
        </Group>

        <Group title="Largura da página">
          <div className="flex gap-1.5">
            <Choice active={pageWidth === "normal"} onClick={() => onPageWidth("normal")}>Padrão</Choice>
            <Choice active={pageWidth === "wide"} onClick={() => onPageWidth("wide")}>Larga</Choice>
            <Choice active={pageWidth === "full"} onClick={() => onPageWidth("full")}>Largura total</Choice>
          </div>
        </Group>

        {canEdit && (
          <Group title="Barra de ferramentas">
            <div className="flex gap-1.5">
              <Choice active={toolbarMode === "floating"} onClick={() => onToolbarMode("floating")}>Flutuando</Choice>
              <Choice active={toolbarMode === "top"} onClick={() => onToolbarMode("top")}>Fixa no topo</Choice>
            </div>
          </Group>
        )}

        <label className="flex items-center justify-between gap-2 text-sm">
          <span>Índice da página</span>
          <Switch checked={showOutline} onCheckedChange={onShowOutline} />
        </label>
      </PopoverContent>
    </Popover>
  );
}
