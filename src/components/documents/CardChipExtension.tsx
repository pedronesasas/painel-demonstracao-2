import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { Link } from "@tanstack/react-router";
import { Hash, ListChecks } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type ChipAttrs = {
  cardId: string;
  boardId: string;
  shortId: string;
  title: string;
};

type Subitem = { id: string; title: string; done: boolean; position: number };

function CardChipView(props: { node: { attrs: ChipAttrs } }) {
  const { cardId, boardId, shortId: initialShort, title: initialTitle } = props.node.attrs;
  const [shortId, setShortId] = useState(initialShort);
  const [title, setTitle] = useState(initialTitle);
  const [completed, setCompleted] = useState(false);
  const [subitems, setSubitems] = useState<Subitem[]>([]);
  const uid = useMemo(() => Math.random().toString(36).slice(2), []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [{ data: card }, { data: subs }] = await Promise.all([
        supabase.from("cards").select("short_id,title,completed_at,board_id").eq("id", cardId).maybeSingle(),
        supabase.from("card_subitems").select("id,title,done,position").eq("card_id", cardId).order("position"),
      ]);
      if (cancel) return;
      if (card) {
        const d = card as { short_id: string; title: string; completed_at: string | null };
        setShortId(d.short_id);
        setTitle(d.title);
        setCompleted(!!d.completed_at);
      }
      if (subs) setSubitems(subs as Subitem[]);
    })();

    const ch = supabase
      .channel(`chip-card-${cardId}-${uid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cards", filter: `id=eq.${cardId}` },
        (p) => {
          const n = (p as unknown as { new: { short_id: string; title: string; completed_at: string | null } }).new;
          setShortId(n.short_id);
          setTitle(n.title);
          setCompleted(!!n.completed_at);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "card_subitems", filter: `card_id=eq.${cardId}` },
        async () => {
          const { data } = await supabase
            .from("card_subitems")
            .select("id,title,done,position")
            .eq("card_id", cardId)
            .order("position");
          if (data) setSubitems(data as Subitem[]);
        },
      )
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, [cardId, uid]);

  const toggleSubitem = async (s: Subitem) => {
    setSubitems((prev) => prev.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)));
    await supabase.from("card_subitems").update({ done: !s.done }).eq("id", s.id);
  };

  const total = subitems.length;
  const doneCount = subitems.filter((s) => s.done).length;
  const allDone = total > 0 && doneCount === total;

  return (
    <NodeViewWrapper as="span" className="inline-block align-baseline">
      <span
        className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-md border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-[0.85em] align-baseline"
        contentEditable={false}
      >
        <Link
          to="/boards/$boardId"
          params={{ boardId }}
          search={{ card: cardId }}
          className="inline-flex items-center gap-1 text-primary no-underline"
          title={`${shortId} — ${title}`}
        >
          <Hash className="h-3 w-3 opacity-70" />
          <span className="font-mono text-[0.85em] opacity-80">{shortId}</span>
          <span className={completed ? "line-through opacity-70" : ""}>{title}</span>
        </Link>

        {total > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                className={cn(
                  "ml-0.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[0.78em] font-medium border border-primary/30 hover:bg-primary/25 transition-colors",
                  allDone && "bg-primary/25",
                )}
                title="Subtarefas"
              >
                <ListChecks className="h-3 w-3" />
                <span>{doneCount}/{total}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-72 p-2"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="px-2 pb-2 text-xs font-medium text-muted-foreground">
                Subtarefas — {doneCount}/{total}
              </div>
              <ul className="space-y-0.5 max-h-72 overflow-auto">
                {subitems.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 cursor-pointer text-sm">
                      <Checkbox
                        checked={s.done}
                        onCheckedChange={() => toggleSubitem(s)}
                        className="mt-0.5"
                      />
                      <span className={cn("flex-1 leading-snug", s.done && "line-through text-muted-foreground")}>
                        {s.title}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </span>
    </NodeViewWrapper>
  );
}

export const CardChip = Node.create({
  name: "cardChip",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      cardId: { default: "" },
      boardId: { default: "" },
      shortId: { default: "" },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-card-chip]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-card-chip": "true",
        class: "doc-card-chip",
      }),
      `${HTMLAttributes.shortId ?? ""} ${HTMLAttributes.title ?? ""}`.trim(),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CardChipView as never);
  },

  addCommands() {
    return {
      insertCardChip:
        (attrs: ChipAttrs) =>
        ({ chain }: { chain: () => { insertContent: (c: unknown) => { run: () => boolean } } }) => {
          return chain()
            .insertContent([
              { type: this.name, attrs },
              { type: "text", text: " " },
            ])
            .run();
        },
    } as never;
  },
});
