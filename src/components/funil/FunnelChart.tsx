import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowRight, CornerDownRight, ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buttonRuleIssue, formatPrice, STEP_KIND_LABEL, stepIdLabels,
  type FunnelStep, type FunnelVsl,
} from "./funnel-data";

/** Etapa já com o que vem dos outros cadastros: VSL (pitch, player) e preço de Produtos. */
export type StepView = FunnelStep & {
  vsl: FunnelVsl | null;
  shownPrice: number | null;
  shownCurrency: string | null;
  /** true quando o preço mostrado é o do produto naquele mercado (tela de Produtos). */
  priceFromProducts: boolean;
};

type Row = { main: StepView; side?: StepView };

/**
 * Linhas do fluxograma, montadas pelas etapas cadastradas:
 * Upsell seguido de Downsell fica lado a lado (recusa → downsell);
 * entrada, etapas extras e entregável ficam sozinhos na linha.
 */
export function buildRows(steps: StepView[]): Row[] {
  const sorted = [...steps].sort((a, b) => a.position - b.position);
  const body = sorted.filter((s) => s.kind !== "entregavel");
  const end = sorted.filter((s) => s.kind === "entregavel");
  const rows: Row[] = [];
  for (let i = 0; i < body.length; i++) {
    const s = body[i];
    const next = body[i + 1];
    if (s.kind === "upsell" && next?.kind === "downsell") {
      rows.push({ main: s, side: next });
      i++;
    } else {
      rows.push({ main: s });
    }
  }
  return [...rows, ...end.map((s) => ({ main: s }))];
}

const GRID = "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1.5 sm:gap-2";

/** Desenho do funil imediato. Clicar numa etapa seleciona e mostra o detalhe. */
export function FunnelChart({
  steps, selectedId, onSelect,
}: {
  steps: StepView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const rows = buildRows(steps);
  const labelOf = (key: string | null) => steps.find((s) => s.key === key)?.label ?? key;
  const node = (s: StepView) => (
    <StepNode key={s.id} step={s} selected={selectedId === s.id} onClick={() => onSelect(s.id)} labelOf={labelOf} />
  );

  return (
    <div className="space-y-1">
      {rows.map((row, i) => (
        <div key={row.main.id}>
          {i > 0 && (
            <div className={cn(GRID, "py-1")}>
              <div className="flex items-center justify-center gap-1 text-center text-[11px] text-muted-foreground">
                <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                compra{rows[i - 1].side && <span className="hidden sm:inline">&nbsp;(ou depois do down)</span>}
              </div>
            </div>
          )}
          <div className={cn(GRID, "items-center")}>
            {node(row.main)}
            {row.side ? (
              <>
                <div className="flex flex-col items-center px-0.5 text-[10px] text-muted-foreground">
                  <ArrowRight className="h-3.5 w-3.5" />
                  recusa
                </div>
                {node(row.side)}
              </>
            ) : (
              <><div /><div /></>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepNode({
  step, selected, onClick, labelOf,
}: {
  step: StepView;
  selected: boolean;
  onClick: () => void;
  labelOf: (key: string | null) => string | null;
}) {
  const issue = buttonRuleIssue(step.vsl?.pitch_time_seconds, step.button_delay_seconds);
  const tone =
    step.kind === "entrada" ? "border-primary/40"
    : step.kind === "entregavel" ? "border-success/40"
    : step.kind === "extra" ? "border-dashed"
    : "";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/40",
        tone,
        selected && "ring-2 ring-primary border-primary",
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <span className="truncate text-sm font-medium">{step.label}</span>
        {step.kind !== "entregavel" && (
          <span className="shrink-0 text-sm tabular-nums">{formatPrice(step.shownPrice, step.shownCurrency)}</span>
        )}
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {step.kind === "entregavel"
          ? (step.page_url ? shortUrl(step.page_url) : "sem link")
          : (step.product_name || "produto não informado")}
      </div>
      {issue != null && (
        <div className="mt-1 inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
          <AlertTriangle className="h-3 w-3" /> botão fora da regra
        </div>
      )}
      {(step.next_on_buy || step.next_on_decline) && (
        <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
          {step.next_on_buy && <div className="flex items-center gap-1"><CornerDownRight className="h-3 w-3" />compra → {labelOf(step.next_on_buy)}</div>}
          {step.next_on_decline && <div className="flex items-center gap-1"><CornerDownRight className="h-3 w-3" />recusa → {labelOf(step.next_on_decline)}</div>}
        </div>
      )}
    </button>
  );
}

export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

/** Painel com tudo de uma etapa. */
export function StepDetail({
  step, platform, canEdit, onEdit,
}: {
  step: StepView;
  platform: string | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const pitch = step.vsl?.pitch_time_seconds ?? null;
  const issue = buttonRuleIssue(pitch, step.button_delay_seconds);
  const ids = stepIdLabels(platform);
  const line = (label: string, value: ReactNode) => (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-sm">{value ?? "—"}</span>
    </div>
  );
  const link = (url: string | null) =>
    url ? (
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
        {shortUrl(url)} <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    ) : null;
  const mono = (v: string | null | undefined) => (v ? <span className="font-mono text-xs">{v}</span> : null);
  const fromTag = (text: string, to: "/products" | "/vsls") => (
    <Link to={to} className="ml-1 text-[11px] text-muted-foreground hover:text-primary">({text})</Link>
  );

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{step.label}</div>
          <div className="text-xs text-muted-foreground">{STEP_KIND_LABEL[step.kind]}</div>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={onEdit} className="hidden md:inline-flex">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        )}
      </div>
      {line("Página", link(step.page_url))}
      {step.kind !== "entregavel" && (
        <>
          {line("Produto", step.product_name)}
          {line(ids.product, mono(step.product_external_id))}
          {line("Oferta", step.offer_name)}
          {line(ids.offer, mono(step.offer_external_id))}
          {line("Checkout", link(step.checkout_url))}
          {line("Preço", step.shownPrice != null ? (
            <>{formatPrice(step.shownPrice, step.shownCurrency)}{step.priceFromProducts && fromTag("de Produtos", "/products")}</>
          ) : null)}
          {line("VSL", step.vsl ? <span className="text-xs">{step.vsl.name}</span> : null)}
          {line("Player VTurb", step.vsl?.vturb_player_id ? <>{mono(step.vsl.vturb_player_id)}{fromTag("da VSL", "/vsls")}</> : null)}
          {line("Pitch", pitch != null ? <>{pitch} s{fromTag("da VSL", "/vsls")}</> : null)}
          {line(
            "Botão aparece",
            step.button_delay_seconds != null ? (
              <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                {step.button_delay_seconds} s
                {issue != null ? (
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">deveria ser {issue} s</span>
                ) : pitch != null ? (
                  <span className="rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-medium text-success">ok</span>
                ) : null}
              </span>
            ) : null,
          )}
        </>
      )}
      {step.notes && <div className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{step.notes}</div>}
    </div>
  );
}
