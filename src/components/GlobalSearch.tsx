import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  ListChecks, Package, Calendar as CalendarIcon, Trophy, Sparkles, FileText, Loader2, type LucideIcon,
} from "lucide-react";

type Kind = "card" | "board" | "doc" | "event" | "campaign" | "product";
// key = tipo + id: é o value do item no cmdk, então dois itens com o mesmo texto não colidem
type Hit = { key: string; kind: Kind; id: string; boardId?: string; label: string; sub?: string; emoji?: string };
type SearchResult = { term: string; hits: Hit[]; failed: boolean };

// Ordem dos grupos na lista (o primeiro item do primeiro grupo é o que o Enter abre)
const GROUPS: { kind: Kind; label: string; icon: LucideIcon }[] = [
  { kind: "card", label: "Cards", icon: ListChecks },
  { kind: "board", label: "Esteiras", icon: Sparkles },
  { kind: "doc", label: "Documentos", icon: FileText },
  { kind: "event", label: "Agenda", icon: CalendarIcon },
  { kind: "campaign", label: "Campanhas", icon: Trophy },
  { kind: "product", label: "Produtos", icon: Package },
];
const NO_HITS: Hit[] = [];

// Padrão do ilike: escapa % e _ (curingas) e a barra invertida, para buscar o texto literal
function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Valor dentro do .or() do PostgREST: entre aspas, escapando aspas e barra invertida
// (sem isso, vírgula, parênteses ou ponto no texto quebram o filtro)
function orValue(value: string) {
  return `"${value.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

// O termo novo continua (ou apaga letras do) anterior: dá para manter os resultados na tela
function sameTrail(a: string, b: string) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.startsWith(y) || y.startsWith(x);
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  // Item escolhido com setas/mouse, preso à lista em que foi escolhido
  const [pick, setPick] = useState<{ key: string; hits: Hit[] } | null>(null);
  // Último termo cuja lista chegou do servidor nesta abertura (a lista de uma abertura anterior não volta)
  const [freshTerm, setFreshTerm] = useState<string | null>(null);
  // Enter apertado antes de chegar a lista do termo digitado: abre o primeiro resultado quando ela chegar
  const [pendingEnter, setPendingEnter] = useState<string | null>(null);
  // Atalho mostrado: "⌘K" no Mac, "Ctrl K" no resto (detecta só no cliente, por causa do SSR)
  const [isMac, setIsMac] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
  }, []);

  // Abre sempre limpo. Limpar na abertura (e não no fechamento) evita a janela
  // mudar de tamanho durante a animação de fechar
  const changeOpen = useCallback((next: boolean) => {
    if (next) { setQ(""); setDebounced(""); setPick(null); setFreshTerm(null); }
    // Fechou antes de a lista chegar: o Enter guardado não abre nada depois
    setPendingEnter(null);
    setOpen(next);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); changeOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, changeOpen]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching, isError, isPlaceholderData } = useQuery<SearchResult>({
    queryKey: ["global-search", debounced],
    enabled: open && debounced.length > 0,
    // Busca que falhou não fica no cache: tentar de novo consulta outra vez
    staleTime: (query) => (query.state.data?.failed ? 0 : 30_000),
    placeholderData: keepPreviousData,
    retry: 1,
    queryFn: async () => {
      const term = debounced;
      const like = likePattern(term);
      const orLike = orValue(like);
      const [cardsR, boardsR, docsR, evR, campR, prodR] = await Promise.all([
        supabase.from("cards").select("id,short_id,title,board_id,boards(name)")
          .or(`title.ilike.${orLike},short_id.ilike.${orLike}`)
          .order("updated_at", { ascending: false }).limit(8),
        supabase.from("boards").select("id,name").ilike("name", like).limit(5),
        supabase.from("documents").select("id,title,icon").ilike("title", like).limit(5),
        supabase.from("calendar_events").select("id,title,start_at").ilike("title", like).limit(5),
        supabase.from("campaigns").select("id,code,product_name").or(`code.ilike.${orLike},product_name.ilike.${orLike}`).limit(5),
        supabase.from("products").select("id,name").ilike("name", like).limit(5),
      ]);
      const errors = [cardsR, boardsR, docsR, evR, campR, prodR].filter((r) => r.error).map((r) => r.error);
      if (errors.length > 0) console.error("Busca global: falha em parte das consultas", errors);

      const hits: Hit[] = [];
      for (const c of cardsR.data ?? []) {
        const sub = [c.short_id, c.boards?.name].filter(Boolean).join(" · ");
        hits.push({ key: `card:${c.id}`, kind: "card", id: c.id, boardId: c.board_id, label: c.title, sub: sub || undefined });
      }
      for (const b of boardsR.data ?? []) {
        hits.push({ key: `board:${b.id}`, kind: "board", id: b.id, label: b.name });
      }
      for (const d of docsR.data ?? []) {
        hits.push({ key: `doc:${d.id}`, kind: "doc", id: d.id, label: d.title, emoji: d.icon ?? undefined });
      }
      for (const e of evR.data ?? []) {
        hits.push({ key: `event:${e.id}`, kind: "event", id: e.id, label: e.title, sub: new Date(e.start_at).toLocaleDateString("pt-BR") });
      }
      for (const c of campR.data ?? []) {
        hits.push({ key: `campaign:${c.id}`, kind: "campaign", id: c.id, label: c.product_name, sub: c.code });
      }
      for (const p of prodR.data ?? []) {
        hits.push({ key: `product:${p.id}`, kind: "product", id: p.id, label: p.name });
      }
      return { term, hits, failed: errors.length > 0 };
    },
  });

  // Guarda o termo de cada lista que chega de verdade (não placeholder) nesta abertura
  useEffect(() => {
    if (open && data && !isPlaceholderData) setFreshTerm(data.term);
  }, [open, data, isPlaceholderData]);

  const term = q.trim();
  // Ainda esperando o debounce ou a resposta do servidor
  const searching = term !== debounced || isFetching;
  // Lista que pode ir para a tela: a do termo buscado agora ou a última que chegou nesta
  // abertura (o placeholder do React Query pode trazer a lista de uma abertura anterior)
  const list = data && (!isPlaceholderData || data.term === freshTerm) ? data : undefined;
  // Mostra os resultados do termo atual. Enquanto busca, mantém os do termo anterior
  // se o novo só continua o que foi digitado (evita a lista piscar a cada letra)
  const hits = term && list && (list.term === term || (searching && sameTrail(list.term, term)))
    ? list.hits
    : NO_HITS;
  const sections = GROUPS
    .map((g) => ({ ...g, items: hits.filter((h) => h.kind === g.kind) }))
    .filter((s) => s.items.length > 0);
  const firstHit = sections[0]?.items[0];
  const firstKey = firstHit?.key ?? "";
  // Lista nova começa com o primeiro resultado selecionado (o Enter abre ele)
  const selected = pick && pick.hits === hits ? pick.key : firstKey;
  const failed = isError || (list?.term === term && list.failed);
  // A lista na tela é a do termo digitado (e não a de um termo anterior, ainda sendo trocada)
  const listIsCurrent = !!term && list?.term === term;

  const openHit = useCallback((h: Hit) => {
    setOpen(false);
    switch (h.kind) {
      case "card":
        // Abre o card direto, como o sino de notificações
        if (h.boardId) navigate({ to: "/boards/$boardId", params: { boardId: h.boardId }, search: { card: h.id } });
        break;
      case "board":
        navigate({ to: "/boards/$boardId", params: { boardId: h.id } });
        break;
      case "doc":
        navigate({ to: "/documents/$docId", params: { docId: h.id } });
        break;
      case "event":
        navigate({ to: "/calendar" });
        break;
      case "campaign":
        navigate({ to: "/campaigns/$campaignId", params: { campaignId: h.id } });
        break;
      case "product":
        navigate({ to: "/products" });
        break;
    }
  }, [navigate]);

  // Enter guardado: quando chega a lista do termo digitado, abre o primeiro resultado
  useEffect(() => {
    if (pendingEnter === null) return;
    // Mudou o texto (ou fechou) depois do Enter: esquece
    if (!open || pendingEnter !== term) setPendingEnter(null);
    else if (listIsCurrent) {
      setPendingEnter(null);
      if (firstHit) openHit(firstHit);
    }
    // A busca terminou sem lista para o termo (erro): esquece
    else if (!searching) setPendingEnter(null);
  }, [pendingEnter, open, term, listIsCurrent, firstHit, searching, openHit]);

  // Mensagem no lugar da lista quando não há resultado para mostrar
  let status: ReactNode = null;
  if (!term) status = "Digite para buscar cards, esteiras, documentos...";
  else if (hits.length > 0) status = null;
  else if (searching) status = <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Buscando...</span>;
  else if (failed) status = "Não foi possível buscar agora. Tente de novo em instantes.";
  else status = `Nada encontrado para “${term}”`;

  return (
    <>
      <button
        onClick={() => changeOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/70"
      >
        <span className="flex-1 text-left">Buscar...</span>
        <kbd className="rounded bg-sidebar-border px-1.5 py-0.5 text-[10px]">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={changeOpen}
        // O filtro é feito no servidor: o filtro do cmdk escondia os resultados que chegavam depois
        commandProps={{
          shouldFilter: false,
          value: selected,
          onValueChange: (key) => setPick({ key, hits }),
          // O cmdk roda este onKeyDown antes do dele e pula o próprio Enter se ele for barrado.
          // Lista ainda de outro termo: barra o Enter (senão abriria um resultado velho)
          // e guarda para abrir o primeiro da lista certa. Clique num item velho continua valendo
          onKeyDown: (e) => {
            if (e.key !== "Enter") { setPendingEnter(null); return; }
            if (e.nativeEvent.isComposing || listIsCurrent) return;
            e.preventDefault();
            if (term) setPendingEnter(term);
          },
        }}
      >
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <DialogDescription className="sr-only">Busque cards, esteiras, documentos, eventos, campanhas e produtos.</DialogDescription>
        <CommandInput placeholder="Buscar cards, esteiras, documentos..." value={q} onValueChange={setQ} />
        <CommandList>
          {status && (
            <div role="status" className="break-words px-4 py-6 text-center text-sm text-muted-foreground">{status}</div>
          )}
          {sections.map((s) => (
            <CommandGroup key={s.kind} heading={s.label}>
              {s.items.map((h) => (
                <CommandItem key={h.key} value={h.key} onSelect={() => openHit(h)}>
                  {h.emoji
                    ? <span className="mr-2 w-5 shrink-0 text-center">{h.emoji}</span>
                    : <s.icon className="mr-2 h-4 w-4" />}
                  <span className="min-w-0 flex-1 truncate">{h.label}</span>
                  {h.sub && <span className="shrink-0 text-xs text-muted-foreground">{h.sub}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <div className="hidden items-center justify-between gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground sm:flex">
          <span>{term && searching && hits.length > 0 ? "Atualizando..." : ""}</span>
          <span>↑ ↓ para escolher · Enter para abrir · Esc para fechar</span>
        </div>
      </CommandDialog>
    </>
  );
}
