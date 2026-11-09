import { Link } from "@tanstack/react-router";
import { CalendarClock, Megaphone } from "lucide-react";
import { cn, formatDateBR } from "@/lib/utils";
import type { CampaignLite } from "./home-types";

// "2026-10-05" -> "05/10"
function dayMonthBR(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return d && m ? `${d}/${m}` : "";
}

// "S41 - PRODUTO 3 [pt-BR]" -> "S41" (o nome do produto já vem ao lado)
function weekCode(code: string): string {
  return code.match(/^S\d+/i)?.[0] ?? code;
}

function periodTitle(c: CampaignLite): string | undefined {
  return c.start_date && c.end_date
    ? `${formatDateBR(c.start_date)} – ${formatDateBR(c.end_date)}`
    : undefined;
}

// Faixa de campanhas no topo de "Minhas tarefas": a da semana e a próxima.
// Sem nenhuma das duas, avisa (só para quem vê a aba Campanhas) em vez de sumir sem explicação.
export function HomeCampaignStrip({
  current,
  next,
  showEmptyHint,
}: {
  current: CampaignLite[];
  next: CampaignLite[];
  showEmptyHint: boolean;
}) {
  if (current.length === 0 && next.length === 0) {
    if (!showEmptyHint) return null;
    return (
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Megaphone className="h-3.5 w-3.5 shrink-0" />
        <span>
          Nenhuma campanha da semana cadastrada em{" "}
          <Link to="/campaigns" className="font-medium text-foreground/80 underline-offset-2 hover:underline">
            Campanhas
          </Link>
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-1.5 overflow-x-auto",
        current.length > 0 ? "bg-accent/20" : "border-dashed",
      )}
    >
      {current.length > 0 && (
        <>
          <Megaphone className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            Em campanha
          </span>
          <div className="flex items-center gap-2 min-w-0">
            {current.map((c) => (
              <Link
                key={c.id}
                to="/campaigns/$campaignId"
                params={{ campaignId: c.id }}
                className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-accent/50 transition-colors shrink-0"
                title={periodTitle(c)}
              >
                <span className="font-mono text-[11px] font-bold text-primary">{c.code}</span>
                <span className="text-xs truncate max-w-[220px]">{c.product_name}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {next.length > 0 && (
        // A próxima fica mais apagada: é aviso, não a campanha em andamento
        <div className={cn("flex items-center gap-2 shrink-0 opacity-75", current.length > 0 && "ml-2 border-l pl-3")}>
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            Próxima
          </span>
          {next.map((c) => (
            <Link
              key={c.id}
              to="/campaigns/$campaignId"
              params={{ campaignId: c.id }}
              className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors shrink-0"
              title={[c.code, periodTitle(c)].filter(Boolean).join(" · ")}
            >
              <span className="font-mono text-[11px] font-bold">{weekCode(c.code)}</span>
              <span className="text-xs">·</span>
              <span className="text-xs truncate max-w-[220px]">{c.product_name}</span>
              {c.start_date && (
                <span className="text-xs shrink-0">· começa {dayMonthBR(c.start_date)}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
