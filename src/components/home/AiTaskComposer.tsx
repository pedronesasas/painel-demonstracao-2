import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles, Loader2, Send, X, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProfiles } from "@/hooks/use-profiles";
import { useQuery } from "@tanstack/react-query";

type DraftTask = {
  title: string;
  board_id: string | null;
  column_id: string | null;
  assignee_ids: string[];
  due_date: string | null;
  description: string | null;
  existing_card_id: string | null;
};

type Proposal = {
  intent: "create" | "update" | "unclear";
  tasks?: DraftTask[];
  candidate_card_ids?: string[];
  note?: string | null;
  reasoning?: string | null;
  question?: string | null;
};

type BoardLite = { id: string; name: string };
type ColumnLite = { id: string; board_id: string; name: string; position: number };
type CardLite = { id: string; short_id: string; title: string; board_id: string };

const NONE = "__none__";

/** Texto puro -> documento do editor (mesmo formato usado nas descrições). */
function plainTextToDoc(text: string) {
  const paragraphs = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return {
    type: "doc",
    content: paragraphs.length
      ? paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }))
      : [{ type: "paragraph" }],
  };
}

export function AiTaskComposer({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const { data: profiles = [] } = useProfiles();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Fluxo de atualização solta (quando o pedido inteiro é sobre um card só)
  const [pickedCardId, setPickedCardId] = useState<string>("");
  const [note, setNote] = useState("");

  const { data: boards = [] } = useQuery({
    queryKey: ["ai-boards"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("boards").select("id,name").order("position");
      return (data ?? []) as BoardLite[];
    },
  });

  const { data: columns = [] } = useQuery({
    queryKey: ["ai-columns"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("board_columns")
        .select("id,board_id,name,position").order("position");
      return (data ?? []) as ColumnLite[];
    },
  });

  const { data: candidateCards = [] } = useQuery({
    queryKey: ["ai-candidates", proposal?.candidate_card_ids?.join(",") ?? ""],
    enabled: !!proposal?.candidate_card_ids?.length,
    queryFn: async () => {
      const { data } = await supabase.from("cards")
        .select("id,short_id,title,board_id").in("id", proposal!.candidate_card_ids!);
      return (data ?? []) as CardLite[];
    },
  });

  // Cards referenciados pelas tarefas que serão atualizadas
  const updateIds = drafts.map((d) => d.existing_card_id).filter((x): x is string => !!x);
  const { data: matchedCards = [] } = useQuery({
    queryKey: ["ai-matched", updateIds.join(",")],
    enabled: updateIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("cards")
        .select("id,short_id,title,board_id").in("id", updateIds);
      return (data ?? []) as CardLite[];
    },
  });

  const patchDraft = (i: number, patch: Partial<DraftTask>) =>
    setDrafts((prev) => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d));

  const reset = () => {
    setProposal(null); setText("");
    setDrafts([]); setPickedCardId(""); setNote(""); setReviewOpen(false);
  };

  const interpret = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const res = await fetch("/api/tasks/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: q }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Falha (${res.status})`);
      const p = (await res.json()) as Proposal;
      setProposal(p);
      setDrafts(p.tasks ?? []);
      setNote(p.note ?? "");
      setPickedCardId(p.candidate_card_ids?.[0] ?? "");
      if ((p.tasks?.length ?? 0) > 2) setReviewOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyAll = async () => {
    const ready = drafts.map((d) => {
      if (d.existing_card_id) return d;
      const cols = columns.filter((c) => c.board_id === d.board_id);
      return { ...d, column_id: d.column_id ?? cols[0]?.id ?? null };
    });
    if (!ready.length) { toast.error("Nenhuma tarefa para aplicar."); return; }
    if (ready.some((d) => !d.title.trim())) { toast.error("Toda tarefa precisa de um título."); return; }

    const news = ready.filter((d) => !d.existing_card_id);
    const semEsteira = news.filter((d) => !d.board_id).length;
    if (semEsteira) { toast.error(`Escolha a esteira de ${semEsteira} tarefa(s) nova(s).`); return; }
    if (news.some((d) => !d.column_id)) { toast.error("Alguma esteira escolhida não tem colunas."); return; }

    setBusy(true);
    // Posição inicial por coluna, incrementando quando duas caem na mesma
    const nextPos = new Map<string, number>();
    for (const colId of new Set(news.map((d) => d.column_id as string))) {
      const { count } = await supabase.from("cards")
        .select("id", { count: "exact", head: true }).eq("column_id", colId);
      nextPos.set(colId, count ?? 0);
    }

    let created = 0;
    let updated = 0;
    const fails: string[] = [];

    for (const d of ready) {
      if (d.existing_card_id) {
        // Já existe: registra a atualização como comentário na timeline do card
        const body = d.description?.trim() || d.title.trim();
        const { error } = await supabase.from("card_comments").insert({
          card_id: d.existing_card_id,
          author_id: user?.id ?? null,
          body,
        } as never);
        if (error) fails.push(`${d.title}: ${error.message}`);
        else updated++;
        continue;
      }

      const colId = d.column_id as string;
      const pos = nextPos.get(colId) ?? 0;
      nextPos.set(colId, pos + 1);
      const { data: card, error } = await supabase.from("cards").insert({
        board_id: d.board_id,
        column_id: colId,
        title: d.title.trim(),
        position: pos,
        created_by: user?.id ?? null,
        assignee_id: d.assignee_ids[0] ?? null,
        due_date: d.due_date,
        description: d.description?.trim() ? plainTextToDoc(d.description.trim()) : null,
      } as never).select("id").single();

      if (error) { fails.push(`${d.title}: ${error.message}`); continue; }
      created++;

      // Co-responsáveis (o principal já entra por trigger)
      const extra = d.assignee_ids.slice(1);
      if (extra.length && card) {
        await supabase.from("card_assignees" as never).insert(
          extra.map((uid) => ({ card_id: (card as { id: string }).id, user_id: uid })) as never,
        );
      }
    }
    setBusy(false);

    const parts: string[] = [];
    if (created) parts.push(`${created} criada(s)`);
    if (updated) parts.push(`${updated} atualizada(s)`);
    if (parts.length) toast.success(parts.join(" · "));
    if (fails.length) toast.error(`Falhou em ${fails.length}: ${fails[0]}`);
    if (created || updated) { reset(); onCreated(); }
  };

  const applySingleUpdate = async () => {
    if (!pickedCardId) { toast.error("Escolha a tarefa."); return; }
    if (!note.trim()) { toast.error("Escreva o que aconteceu."); return; }
    setBusy(true);
    const { error } = await supabase.from("card_comments").insert({
      card_id: pickedCardId,
      author_id: user?.id ?? null,
      body: note.trim(),
    } as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Atualização registrada na tarefa");
    reset();
    onCreated();
  };

  const draftList = (
    <DraftList
      drafts={drafts}
      boards={boards}
      columns={columns}
      profiles={profiles}
      matchedCards={matchedCards}
      onPatch={patchDraft}
      onRemove={(i) => setDrafts((prev) => prev.filter((_, idx) => idx !== i))}
    />
  );

  const countNew = drafts.filter((d) => !d.existing_card_id).length;
  const countUpd = drafts.length - countNew;
  const actionLabel = countUpd === 0
    ? (countNew === 1 ? "Criar tarefa" : `Criar ${countNew} tarefas`)
    : countNew === 0
      ? `Atualizar ${countUpd} tarefa(s)`
      : `Criar ${countNew} · atualizar ${countUpd}`;

  return (
    <section className="rounded-md border overflow-hidden">
      <header className="flex items-center gap-2 px-3 py-2 bg-accent/30 border-b">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Criar com IA</span>
        {proposal && (
          <button onClick={reset} className="ml-auto text-muted-foreground hover:text-foreground"
            title="Começar de novo">
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="p-3 space-y-3">
        {!proposal && (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); interpret(); }
              }}
              rows={5}
              disabled={busy}
              placeholder={'Ex.: "criar tarefa de edição do criativo do Produto 1 para o Diego" — ou cole uma lista inteira de tarefas'}
              className="text-sm resize-none"
            />
            <Button onClick={interpret} disabled={busy || !text.trim()} className="w-full" size="sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Interpretar
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Aceita listas com várias tarefas, responsáveis, descrição e esteira. Se a tarefa já
              existir, a IA marca para atualizar em vez de duplicar. Você confere tudo antes de salvar.
            </p>
          </>
        )}

        {proposal?.reasoning && (
          <p className="text-[11px] text-muted-foreground italic">{proposal.reasoning}</p>
        )}

        {proposal?.intent === "unclear" && drafts.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-warning">
              {proposal.question ?? "Não consegui entender o pedido."}
            </p>
            <Button variant="outline" size="sm" onClick={reset} className="w-full">
              Escrever de novo
            </Button>
          </div>
        )}

        {drafts.length > 0 && (
          drafts.length > 2 ? (
            <div className="space-y-2">
              <p className="text-sm">
                <strong>{drafts.length}</strong> tarefas interpretadas
                {countUpd > 0 && ` (${countUpd} já existem)`}.
              </p>
              <Button onClick={() => setReviewOpen(true)} className="w-full" size="sm" variant="outline">
                Revisar e aplicar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {draftList}
              <Button onClick={applyAll} disabled={busy} className="w-full" size="sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {actionLabel}
              </Button>
            </div>
          )
        )}

        {proposal?.intent === "update" && drafts.length === 0 && (
          <div className="space-y-2.5">
            <Label className="text-xs block">Qual tarefa?</Label>
            {candidateCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Não encontrei tarefas parecidas. Tente citar o código (CARD-0001) ou o título.
              </p>
            ) : (
              <div className="space-y-1">
                {candidateCards.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setPickedCardId(c.id)}
                    className={cn(
                      "w-full text-left rounded-md border px-2 py-1.5 text-sm transition-colors",
                      pickedCardId === c.id
                        ? "border-primary bg-primary/10"
                        : "border-border/60 hover:bg-accent/40",
                    )}
                  >
                    <span className="font-mono text-[11px] text-muted-foreground mr-1.5">{c.short_id}</span>
                    {c.title}
                  </button>
                ))}
              </div>
            )}
            <div>
              <Label className="text-xs mb-1 block">Atualização</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                className="text-sm resize-none" />
            </div>
            <Button onClick={applySingleUpdate} disabled={busy || !pickedCardId} className="w-full" size="sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Registrar atualização
            </Button>
          </div>
        )}
      </div>

      {/* Revisão em tela cheia quando o pedido traz muitas tarefas */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-4xl w-[92vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Revisar {drafts.length} tarefa(s)
              {countUpd > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {countNew} nova(s) · {countUpd} atualização(ões)
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {proposal?.reasoning && (
            <p className="text-xs text-muted-foreground italic">{proposal.reasoning}</p>
          )}
          {draftList}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewOpen(false)} disabled={busy}>
              Fechar
            </Button>
            <Button onClick={applyAll} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DraftList({
  drafts, boards, columns, profiles, matchedCards, onPatch, onRemove,
}: {
  drafts: DraftTask[];
  boards: BoardLite[];
  columns: ColumnLite[];
  profiles: Array<{ id: string; full_name: string | null; email: string | null }>;
  matchedCards: CardLite[];
  onPatch: (i: number, patch: Partial<DraftTask>) => void;
  onRemove: (i: number) => void;
}) {
  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? "Desconhecido";
  };

  return (
    <div className="space-y-3">
      {drafts.map((d, i) => {
        const cols = columns.filter((c) => c.board_id === d.board_id);
        const match = d.existing_card_id
          ? matchedCards.find((c) => c.id === d.existing_card_id)
          : null;
        const free = profiles.filter((p) => !d.assignee_ids.includes(p.id));

        return (
          <div key={i} className={cn(
            "rounded-md border p-2.5 space-y-2",
            match ? "border-warning/40 bg-warning/5" : "border-border/60",
          )}>
            <div className="flex items-start gap-1.5">
              <span className="mt-2 text-[10px] font-mono text-muted-foreground shrink-0">{i + 1}</span>
              <Input
                value={d.title}
                onChange={(e) => onPatch(i, { title: e.target.value })}
                placeholder="Título da tarefa"
                className="h-8 text-sm"
              />
              <button
                onClick={() => onRemove(i)}
                className="mt-2 text-muted-foreground hover:text-destructive shrink-0"
                title="Tirar esta tarefa"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {match ? (
              <div className="flex items-center gap-2 text-[11px] flex-wrap">
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-warning/15 text-warning font-medium">
                  <RefreshCw className="h-3 w-3" /> Atualizar
                </span>
                <span className="font-mono text-muted-foreground">{match.short_id}</span>
                <span className="text-muted-foreground truncate">{match.title}</span>
                <button
                  onClick={() => onPatch(i, { existing_card_id: null })}
                  className="ml-auto text-muted-foreground hover:text-foreground underline"
                >
                  criar nova
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <Select
                  value={d.board_id ?? NONE}
                  onValueChange={(v) => onPatch(i, { board_id: v === NONE ? null : v, column_id: null })}
                >
                  <SelectTrigger className={cn("h-7 text-xs", !d.board_id && "text-muted-foreground")}>
                    <SelectValue placeholder="Esteira" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Esteira</SelectItem>
                    {boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select
                  value={d.column_id ?? NONE}
                  onValueChange={(v) => onPatch(i, { column_id: v === NONE ? null : v })}
                  disabled={!d.board_id}
                >
                  <SelectTrigger className={cn("h-7 text-xs", !d.column_id && "text-muted-foreground")}>
                    <SelectValue placeholder="1ª etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>1ª etapa</SelectItem>
                    {cols.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {d.assignee_ids.map((uid) => (
                <span key={uid}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px]">
                  {nameOf(uid)}
                  <button
                    onClick={() => onPatch(i, { assignee_ids: d.assignee_ids.filter((x) => x !== uid) })}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <Select
                value=""
                onValueChange={(v) => onPatch(i, { assignee_ids: [...d.assignee_ids, v] })}
              >
                <SelectTrigger className="h-6 w-auto gap-1 border-dashed px-2 text-[11px] text-muted-foreground">
                  <Plus className="h-3 w-3" />
                  {d.assignee_ids.length === 0 ? "Responsável" : ""}
                </SelectTrigger>
                <SelectContent>
                  {free.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={d.due_date ?? ""}
                onChange={(e) => onPatch(i, { due_date: e.target.value || null })}
                className="h-6 w-32 text-[11px] ml-auto"
              />
            </div>

            <Textarea
              value={d.description ?? ""}
              onChange={(e) => onPatch(i, { description: e.target.value })}
              rows={2}
              placeholder={match ? "Texto da atualização" : "Descrição"}
              className="text-xs resize-none"
            />
          </div>
        );
      })}
    </div>
  );
}
