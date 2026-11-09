import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Source = {
  chunk_id: string;
  document_id: string;
  title: string;
  icon: string | null;
  similarity: number;
};

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; sources: Source[]; streaming?: boolean };

export function AskAIPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const reindex = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const res = await fetch("/api/documents/index-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { processed: number };
    },
    onSuccess: (r) => toast.success(`Reindexado: ${r.processed} documento(s)`),
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const history = messages
      .filter((m): m is Extract<Message, { role: "user" | "assistant" }> => true)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [
      ...prev,
      { role: "user", content: q },
      { role: "assistant", content: "", sources: [], streaming: true },
    ]);
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const res = await fetch("/api/documents/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: q, history }),
      });
      if (!res.ok || !res.body) {
        const txt = await res.text();
        throw new Error(txt || `Falha (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let sources: Source[] = [];
      let sawSources = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (!sawSources) {
          const marker = "__SOURCES__";
          const idx = buf.indexOf(marker);
          if (idx !== -1) {
            const end = buf.indexOf("\n\n", idx);
            if (end !== -1) {
              try {
                sources = JSON.parse(buf.slice(idx + marker.length, end)) as Source[];
              } catch { sources = []; }
              buf = buf.slice(end + 2);
              sawSources = true;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") copy[copy.length - 1] = { ...last, sources };
                return copy;
              });
            } else {
              continue;
            }
          }
        }
        if (sawSources && buf) {
          const delta = buf;
          buf = "";
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = { ...last, content: last.content + delta };
            }
            return copy;
          });
        }
      }
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = { ...last, streaming: false };
        return copy;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: last.content || `⚠️ ${msg}`,
            streaming: false,
          };
        }
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Perguntar aos documentos
          </SheetTitle>
          <SheetDescription>
            A IA busca respostas nos documentos que você tem acesso e cita as fontes.
          </SheetDescription>
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setMessages([])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
              disabled={busy || messages.length === 0}
            >
              Limpar conversa
            </button>
            <button
              onClick={() => reindex.mutate()}
              disabled={reindex.isPending}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Regenerar todo o índice"
            >
              {reindex.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />}
              Reindexar tudo
            </button>
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Exemplos:</p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>"Qual é o prazo para pedir uma peça para Design?"</li>
                <li>"Quando acontece a reunião semanal?"</li>
                <li>"Como publicar uma página nova?"</li>
              </ul>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} onClose={() => onOpenChange(false)} />
          ))}
        </div>

        <div className="border-t px-4 py-3 flex items-end gap-2 bg-background">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Pergunte algo sobre os documentos..."
            rows={2}
            className="resize-none text-sm"
            disabled={busy}
          />
          <Button onClick={submit} disabled={busy || !input.trim()} size="icon" className="h-10 w-10 shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MessageBubble({ message, onClose }: { message: Message; onClose: () => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary-strong text-primary-foreground px-3.5 py-2 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="rounded-2xl rounded-bl-sm bg-muted/60 px-3.5 py-2.5 text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
        {message.content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              h1: ({ children }) => <div className="font-semibold text-sm mt-3 mb-1 first:mt-0">{children}</div>,
              h2: ({ children }) => <div className="font-semibold text-sm mt-3 mb-1 first:mt-0">{children}</div>,
              h3: ({ children }) => <div className="font-semibold text-sm mt-3 mb-1 first:mt-0">{children}</div>,
              code: ({ children }) => <code className="bg-background/70 border border-border/50 rounded px-1 py-0.5 text-[12px] font-mono">{children}</code>,
              a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-primary">{children}</a>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-2 my-2 text-muted-foreground">{children}</blockquote>,
              table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1">{children}</table></div>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        ) : (
          message.streaming ? <span className="opacity-60">Pensando…</span> : "—"
        )}
        {message.streaming && message.content && (
          <span className="ml-0.5 inline-block h-3 w-1 bg-foreground/40 animate-pulse align-middle" />
        )}
      </div>
      {message.sources.length > 0 && (
        <div className="pl-1">
          <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1.5">
            Fontes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dedupeSources(message.sources).map((s, i) => (
              <Link
                key={s.document_id}
                to="/documents/$docId"
                params={{ docId: s.document_id }}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background hover:bg-accent px-2.5 py-1 text-[11px] transition-colors"
                title={`Similaridade: ${(s.similarity * 100).toFixed(0)}%`}
              >
                <span className="text-muted-foreground">[{i + 1}]</span>
                {s.icon ? <span>{s.icon}</span> : <FileText className="h-3 w-3 text-muted-foreground" />}
                <span className="max-w-[180px] truncate">{s.title || "Sem título"}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    if (seen.has(s.document_id)) continue;
    seen.add(s.document_id);
    out.push(s);
  }
  return out;
}
