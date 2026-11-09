import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ChevronRight, Plus, FileText, MoreHorizontal,
  Trash2, Copy, PanelLeftClose, PanelLeftOpen, Search,
  ChevronsDownUp, ChevronsUpDown, Sparkles,
} from "lucide-react";
import { AskAIPanel } from "@/components/documents/AskAIPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Doc = {
  id: string; parent_id: string | null; title: string; icon: string | null; position: number;
};

type DropMode = "before" | "after" | "inside";
type DropTarget =
  | { id: string; mode: DropMode }
  | { id: "__root__"; mode: "end" }
  | null;

const STORAGE_KEY = "nexus.docs.sidebar.expanded";
const COLLAPSED_KEY = "nexus.docs.sidebar.collapsed";
const DND_MIME = "application/x-nexus-doc-id";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}
function saveExpanded(s: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

export function DocumentsSidebar() {
  const { canEditTab, user } = useAuth();
  const canEdit = canEditTab("documents" as never);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const currentDocId = currentPath.startsWith("/documents/") ? currentPath.split("/")[2] : null;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; }
  });
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded());
  const [search, setSearch] = useState("");
  const [askOpen, setAskOpen] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  useEffect(() => { try { localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); } catch {/* ignore */} }, [collapsed]);
  useEffect(() => { saveExpanded(expanded); }, [expanded]);

  const { data: docs = [] } = useQuery({
    queryKey: ["sidebar-docs"],
    queryFn: async () => {
      const { data } = await supabase.from("documents")
        .select("id,parent_id,title,icon,position").order("position");
      return (data ?? []) as Doc[];
    },
    staleTime: 5 * 60_000,
  });

  // Auto-expand ancestors of the current doc
  useEffect(() => {
    if (!currentDocId || docs.length === 0) return;
    const byId = new Map(docs.map((d) => [d.id, d]));
    const toOpen = new Set(expanded);
    let cursor = byId.get(currentDocId)?.parent_id ?? null;
    let changed = false;
    while (cursor) {
      if (!toOpen.has(cursor)) { toOpen.add(cursor); changed = true; }
      cursor = byId.get(cursor)?.parent_id ?? null;
    }
    if (changed) setExpanded(toOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocId, docs]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const withChildren = new Set<string>();
    docs.forEach((d) => { if (d.parent_id) withChildren.add(d.parent_id); });
    setExpanded(withChildren);
  };
  const collapseAll = () => setExpanded(new Set());

  const rootDocs = useMemo(
    () => docs.filter((d) => !d.parent_id).sort((a, b) => a.position - b.position),
    [docs],
  );

  // Filtered tree based on search (matches descendants too)
  const visibleIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const matched = new Set<string>();
    docs.forEach((d) => {
      if ((d.title || "").toLowerCase().includes(q)) {
        matched.add(d.id);
        const byId = new Map(docs.map((x) => [x.id, x]));
        let cur = d.parent_id;
        while (cur) { matched.add(cur); cur = byId.get(cur)?.parent_id ?? null; }
      }
    });
    return matched;
  }, [search, docs]);

  // Descendants of the currently dragged node (drop forbidden inside any of them)
  const forbiddenIds = useMemo(() => {
    if (!draggingId) return new Set<string>();
    const result = new Set<string>([draggingId]);
    const byParent = new Map<string | null, Doc[]>();
    docs.forEach((d) => {
      const arr = byParent.get(d.parent_id) ?? [];
      arr.push(d); byParent.set(d.parent_id, arr);
    });
    const stack = [draggingId];
    while (stack.length) {
      const id = stack.pop()!;
      (byParent.get(id) ?? []).forEach((c) => { result.add(c.id); stack.push(c.id); });
    }
    return result;
  }, [draggingId, docs]);

  const reorderSiblings = async (parentId: string | null, orderedIds: string[]) => {
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from("documents").update({ position: idx } as never).eq("id", id),
      ),
    );
  };

  const performDrop = async (sourceId: string, target: DropTarget) => {
    if (!target || forbiddenIds.has(target.id === "__root__" ? "" : (target as { id: string }).id)) return;
    const src = docs.find((d) => d.id === sourceId);
    if (!src) return;

    let newParent: string | null;
    let siblings: Doc[];
    let insertIndex: number;

    if (target.id === "__root__") {
      newParent = null;
      siblings = docs.filter((d) => !d.parent_id && d.id !== sourceId).sort((a, b) => a.position - b.position);
      insertIndex = siblings.length;
    } else {
      const tgt = docs.find((d) => d.id === target.id);
      if (!tgt) return;
      if (target.mode === "inside") {
        newParent = tgt.id;
        siblings = docs.filter((d) => d.parent_id === tgt.id && d.id !== sourceId).sort((a, b) => a.position - b.position);
        insertIndex = siblings.length;
      } else {
        newParent = tgt.parent_id;
        const sib = docs.filter((d) => d.parent_id === tgt.parent_id && d.id !== sourceId).sort((a, b) => a.position - b.position);
        const tgtIdx = sib.findIndex((d) => d.id === tgt.id);
        insertIndex = target.mode === "before" ? tgtIdx : tgtIdx + 1;
        siblings = sib;
      }
    }

    const oldParent = src.parent_id;
    const newOrder = [...siblings.slice(0, insertIndex), src, ...siblings.slice(insertIndex)];

    // 1) move the node
    const { error } = await supabase.from("documents")
      .update({ parent_id: newParent, position: insertIndex } as never)
      .eq("id", sourceId);
    if (error) { toast.error(error.message); return; }

    // 2) recompact destination siblings
    await reorderSiblings(newParent, newOrder.map((d) => d.id));

    // 3) recompact old siblings if parent changed
    if (oldParent !== newParent) {
      const oldSiblings = docs
        .filter((d) => d.parent_id === oldParent && d.id !== sourceId)
        .sort((a, b) => a.position - b.position)
        .map((d) => d.id);
      await reorderSiblings(oldParent, oldSiblings);
    }

    if (target.id !== "__root__" && target.mode === "inside") {
      setExpanded((prev) => new Set(prev).add(target.id));
    }
    qc.invalidateQueries({ queryKey: ["sidebar-docs"] });
  };

  const handleDropOnTarget = async (target: DropTarget) => {
    const id = draggingId;
    setDraggingId(null);
    setDropTarget(null);
    if (!id || !canEdit) return;
    await performDrop(id, target);
  };

  const addRootDoc = async () => {
    if (!canEdit) return;
    const { data, error } = await supabase.from("documents").insert({
      title: "Sem título",
      created_by: user?.id, updated_by: user?.id,
      position: rootDocs.length,
    } as never).select("id").maybeSingle();
    if (error) { toast.error(error.message); return; }
    const created = data as { id: string } | null;
    qc.invalidateQueries({ queryKey: ["sidebar-docs"] });
    if (created?.id) navigate({ to: "/documents/$docId", params: { docId: created.id } });
  };

  if (collapsed) {
    return (
      <>
        <div className="hidden md:flex w-10 shrink-0 border-r border-border/40 bg-sidebar/30 flex-col items-center py-3 gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Expandir documentos"
            onClick={() => setCollapsed(false)}>
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <Link to="/documents" title="Documentos"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent">
            <FileText className="h-4 w-4" />
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Perguntar à IA"
            onClick={() => setAskOpen(true)}>
            <Sparkles className="h-4 w-4 text-primary" />
          </Button>
        </div>
        <AskAIPanel open={askOpen} onOpenChange={setAskOpen} />
      </>
    );
  }

  return (
    <>
    <aside className="hidden md:flex w-72 shrink-0 border-r border-border/40 bg-sidebar/40 flex-col">
      {/* Header — sticky */}
      <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-3 border-b border-border/30 bg-sidebar/80 backdrop-blur">
        <Link to="/documents" className="flex-1 min-w-0 inline-flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent/40 text-sm font-semibold tracking-wide transition-colors">
          <FileText className="h-4 w-4 text-primary" />
          <span className="truncate">Documentos</span>
        </Link>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Expandir tudo" onClick={expandAll}>
          <ChevronsUpDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Recolher tudo" onClick={collapseAll}>
          <ChevronsDownUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Perguntar à IA" onClick={() => setAskOpen(true)}>
          <Sparkles className="h-4 w-4 text-primary" />
        </Button>
        {canEdit && (
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Nova página" onClick={addRootDoc}>
            <Plus className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Recolher" onClick={() => setCollapsed(true)}>
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="h-8 pl-8 bg-background/40 border-border/40 text-xs"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Páginas
        </div>
        {rootDocs.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Nenhuma página ainda.
          </div>
        ) : (
          <div className="space-y-0.5">
            {rootDocs.map((d) => (
              <TreeNode
                key={d.id}
                doc={d}
                allDocs={docs}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                currentDocId={currentDocId}
                canEdit={canEdit}
                userId={user?.id}
                visibleIds={visibleIds}
                setExpanded={setExpanded}
                draggingId={draggingId}
                setDraggingId={setDraggingId}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                forbiddenIds={forbiddenIds}
                onDropOnTarget={handleDropOnTarget}
              />
            ))}
          </div>
        )}

        {/* Drop zone "move to root" — only while dragging a non-root node */}
        {canEdit && draggingId && docs.find((d) => d.id === draggingId)?.parent_id && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDropTarget({ id: "__root__", mode: "end" }); }}
            onDragLeave={() => setDropTarget((cur) => (cur && cur.id === "__root__" ? null : cur))}
            onDrop={(e) => { e.preventDefault(); handleDropOnTarget({ id: "__root__", mode: "end" }); }}
            className={cn(
              "mt-2 px-3 py-3 text-center text-xs rounded-md border border-dashed transition-colors",
              dropTarget?.id === "__root__"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground",
            )}
          >
            Soltar aqui para mover para a raiz
          </div>
        )}

        {canEdit && (
          <button
            onClick={addRootDoc}
            className="mt-2 w-full inline-flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar página
          </button>
        )}
      </div>
    </aside>
    <AskAIPanel open={askOpen} onOpenChange={setAskOpen} />
    </>
  );
}


function TreeNode({
  doc, allDocs, depth, expanded, onToggle, currentDocId, canEdit, userId, visibleIds, setExpanded,
  draggingId, setDraggingId, dropTarget, setDropTarget, forbiddenIds, onDropOnTarget,
}: {
  doc: Doc;
  allDocs: Doc[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  currentDocId: string | null;
  canEdit: boolean;
  userId?: string;
  visibleIds: Set<string> | null;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  draggingId: string | null;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  dropTarget: DropTarget;
  setDropTarget: React.Dispatch<React.SetStateAction<DropTarget>>;
  forbiddenIds: Set<string>;
  onDropOnTarget: (t: DropTarget) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hover, setHover] = useState(false);

  const children = useMemo(
    () => allDocs.filter((d) => d.parent_id === doc.id).sort((a, b) => a.position - b.position),
    [allDocs, doc.id],
  );
  const isOpen = expanded.has(doc.id) || (visibleIds !== null && children.some((c) => visibleIds.has(c.id)));
  const isActive = currentDocId === doc.id;
  const isVisible = visibleIds === null || visibleIds.has(doc.id);

  useEffect(() => {
    if (isActive) linkRef.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  if (!isVisible) return null;

  const addSub = async () => {
    const { data, error } = await supabase.from("documents").insert({
      parent_id: doc.id, title: "Sem título",
      created_by: userId, updated_by: userId, position: children.length,
    } as never).select("id").maybeSingle();
    if (error) { toast.error(error.message); return; }
    setExpanded((prev) => new Set(prev).add(doc.id));
    qc.invalidateQueries({ queryKey: ["sidebar-docs"] });
    const created = data as { id: string } | null;
    if (created?.id) navigate({ to: "/documents/$docId", params: { docId: created.id } });
  };

  const duplicate = async () => {
    const { data: full } = await supabase.from("documents")
      .select("title,icon,cover_color,content,parent_id,position")
      .eq("id", doc.id).maybeSingle();
    if (!full) return;
    const f = full as { title: string; icon: string | null; cover_color: string | null; content: unknown; parent_id: string | null; position: number };
    const { data, error } = await supabase.from("documents").insert({
      title: `${f.title} (cópia)`, icon: f.icon, cover_color: f.cover_color,
      content: f.content, parent_id: f.parent_id,
      created_by: userId, updated_by: userId, position: f.position + 1,
    } as never).select("id").maybeSingle();
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["sidebar-docs"] });
    const created = data as { id: string } | null;
    if (created?.id) navigate({ to: "/documents/$docId", params: { docId: created.id } });
  };

  const doDelete = async () => {
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["sidebar-docs"] });
    setConfirmDelete(false);
    if (isActive) navigate({ to: "/documents" });
  };

  const isForbidden = forbiddenIds.has(doc.id);
  const myDropMode: DropMode | null =
    dropTarget && dropTarget.id === doc.id && dropTarget.mode !== "end" ? (dropTarget.mode as DropMode) : null;

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit || !draggingId || isForbidden) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let mode: DropMode = "inside";
    if (y < 5) mode = "before";
    else if (y > h - 5) mode = "after";
    setDropTarget((cur) =>
      cur && cur.id === doc.id && cur.mode === mode ? cur : { id: doc.id, mode },
    );
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // only clear if leaving to outside this row
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDropTarget((cur) => (cur && cur.id === doc.id ? null : cur));
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit || !draggingId || isForbidden) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let mode: DropMode = "inside";
    if (y < 5) mode = "before";
    else if (y > h - 5) mode = "after";
    onDropOnTarget({ id: doc.id, mode });
  };

  return (
    <div>
      <div
        draggable={canEdit}
        onDragStart={(e) => {
          if (!canEdit) return;
          setDraggingId(doc.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(DND_MIME, doc.id);
        }}
        onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "group relative flex items-center gap-0.5 rounded-md pr-1 transition-colors duration-150",
          isActive ? "bg-primary/10 text-foreground" : "hover:bg-accent/40",
          draggingId === doc.id && "opacity-50",
          myDropMode === "inside" && "ring-2 ring-primary/40",
        )}
        style={{ paddingLeft: `${depth * 12}px` }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {myDropMode === "before" && (
          <span className="absolute left-0 right-0 -top-px h-0.5 bg-primary rounded-full" />
        )}
        {myDropMode === "after" && (
          <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
        )}
        {isActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />}
        {children.length > 0 ? (
          <button
            onClick={() => onToggle(doc.id)}
            aria-label={isOpen ? "Recolher" : "Expandir"}
            className="p-1 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")} />
          </button>
        ) : (
          <span className="w-5" />
        )}
        <Link
          ref={linkRef}
          to="/documents/$docId"
          params={{ docId: doc.id }}
          className={cn(
            "flex flex-1 items-center gap-1.5 py-1 text-[13px] min-w-0",
            isActive ? "text-foreground font-medium" : "text-foreground/75",
          )}
        >
          <span className="text-[15px] shrink-0 leading-none">{doc.icon ?? "📄"}</span>
          <span className="truncate">{doc.title || "Sem título"}</span>
        </Link>
        {canEdit && (
          <div className={cn("flex items-center gap-0.5 transition-opacity", hover ? "opacity-100" : "opacity-0")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-background/60 text-muted-foreground hover:text-foreground" title="Mais">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={duplicate}>
                  <Copy className="h-3.5 w-3.5 mr-2" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={addSub}
              className="p-1 rounded hover:bg-background/60 text-muted-foreground hover:text-foreground"
              title="Adicionar subpágina"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {isOpen && children.length > 0 && (
        <div className="mt-0.5 space-y-0.5 border-l border-border/30 ml-3">
          {children.map((c) => (
            <TreeNode
              key={c.id}
              doc={c}
              allDocs={allDocs}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              currentDocId={currentDocId}
              canEdit={canEdit}
              userId={userId}
              visibleIds={visibleIds}
              setExpanded={setExpanded}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              forbiddenIds={forbiddenIds}
              onDropOnTarget={onDropOnTarget}
            />
          ))}
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{doc.title || "Sem título"}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta página e todas as subpáginas serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive-strong text-destructive-foreground hover:bg-destructive-strong/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
