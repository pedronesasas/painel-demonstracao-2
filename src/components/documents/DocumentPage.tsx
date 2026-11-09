import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronRight, Plus, Trash2, Smile, FileQuestion, Loader2, Link2, MoreHorizontal, Download, ImagePlus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Editor } from "@tiptap/react";
import { DocumentOutline } from "@/components/editor/DocumentOutline";
import { cn } from "@/lib/utils";
import { exportDocumentAsDocx } from "@/lib/exportDocuments";
import { DocumentEditor } from "./DocumentEditor";
import { PageStylesButton } from "./PageStylesButton";
import { useLocalPref } from "@/lib/use-local-pref";
import type { ToolbarMode } from "@/components/editor/TextBubbleMenu";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Doc = {
  id: string; parent_id: string | null; title: string; icon: string | null;
  cover_color: string | null; content: unknown; position: number; updated_at: string;
  created_at: string; created_by: string | null; updated_by: string | null;
};
type ProfileLite = { id: string; full_name: string | null };

const EMOJIS = ["📄","📝","📚","💡","🚀","🎯","✅","⭐","🔥","📊","🗂️","🧩","🎨","💼","📌","🔖","📅","🗒️","📁","📓"];
const COLORS = ["#a78bfa","#60a5fa","#34d399","#facc15","#fb923c","#f87171","#f472b6","#22d3ee"];

type PageWidth = "normal" | "wide" | "full";
type TextSize = "sm" | "md" | "lg";
const WIDTH_CLASS: Record<PageWidth, string> = { normal: "max-w-[860px]", wide: "max-w-[1180px]", full: "max-w-none" };
type FontStyle = "sans" | "serif" | "mono";
const FONT_CLASS: Record<FontStyle, string> = { sans: "", serif: "font-serif", mono: "font-mono" };
const WIDTH_KEY = "nexus.docs.pageWidth";
const SIZE_KEY = "nexus.docs.textSize";
const FONT_KEY = "nexus.docs.fontStyle";
const TOOLBAR_KEY = "nexus.docs.toolbar";
const OUTLINE_KEY = "nexus.docs.outline";

export function DocumentPage({ docId }: { docId: string }) {
  const { canEditTab, user } = useAuth();
  const canEdit = canEditTab("documents" as never);
  const navigate = useNavigate();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [ancestors, setAncestors] = useState<Doc[]>([]);
  const [children, setChildren] = useState<Doc[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [exporting, setExporting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const [editorInst, setEditorInst] = useState<Editor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSubpages, setShowSubpages] = useState(true);
  const [pageWidth, setPageWidth] = useLocalPref<PageWidth>(WIDTH_KEY, "normal", ["normal", "wide", "full"]);
  const [textSize, setTextSize] = useLocalPref<TextSize>(SIZE_KEY, "md", ["sm", "md", "lg"]);
  const [fontStyle, setFontStyle] = useLocalPref<FontStyle>(FONT_KEY, "sans", ["sans", "serif", "mono"]);
  const [toolbarMode, setToolbarMode] = useLocalPref<ToolbarMode>(TOOLBAR_KEY, "floating", ["floating", "top"]);
  const [showOutline, setShowOutline] = useLocalPref<"on" | "off">(OUTLINE_KEY, "on", ["on", "off"]);
  const lastSavedByMe = useRef<number>(0);

  const load = useCallback(async () => {
    const { data } = await supabase.from("documents")
      .select("*").eq("id", docId).maybeSingle();
    if (!data) { setNotFound(true); setLoading(false); return; }
    const d = data as Doc;
    setDoc(d);
    setTitle(d.title);
    setContent(d.content);
    setNotFound(false);
    setLoading(false);

    const chain: Doc[] = [];
    let parentId = d.parent_id;
    while (parentId) {
      const { data: p } = await supabase.from("documents")
        .select("id,parent_id,title,icon,cover_color,updated_at,position")
        .eq("id", parentId).maybeSingle();
      if (!p) break;
      chain.unshift(p as Doc);
      parentId = (p as Doc).parent_id;
    }
    setAncestors(chain);

    const { data: ch } = await supabase.from("documents")
      .select("id,parent_id,title,icon,cover_color,updated_at,position")
      .eq("parent_id", docId)
      .order("position")
      .range(0, 499);
    setChildren((ch ?? []) as Doc[]);

    const ids = Array.from(new Set([d.created_by, d.updated_by].filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles")
        .select("id,full_name").in("id", ids);
      const map: Record<string, string> = {};
      ((profs ?? []) as ProfileLite[]).forEach((p) => { map[p.id] = p.full_name ?? "Usuário"; });
      setProfiles(map);
    }
  }, [docId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const manySubpages = children.length > 6;
  useEffect(() => { setShowSubpages(!manySubpages); }, [docId, manySubpages]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title, loading]);

  useEffect(() => {
    const ch = supabase.channel(`doc-${docId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `id=eq.${docId}` },
        () => {
          if (Date.now() - lastSavedByMe.current < 2000) return;
          load();
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `parent_id=eq.${docId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [docId, load]);

  const persist = useCallback(async (patch: Partial<Doc>) => {
    if (!doc) return;
    setSaving(true);
    lastSavedByMe.current = Date.now();
    const { error } = await supabase.from("documents")
      .update({ ...patch, updated_by: user?.id } as never)
      .eq("id", doc.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setSavedAt(new Date());
  }, [doc, user?.id]);

  const onContentChange = (val: unknown) => {
    setContent(val);
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { persist({ content: val }); }, 800);
  };

  const onTitleBlur = () => {
    if (doc && title !== doc.title) persist({ title: title || "Sem título" });
  };

  const addSubpage = async () => {
    if (!canEdit || !doc) return;
    const { data, error } = await supabase.from("documents").insert({
      parent_id: doc.id,
      title: "Sem título",
      created_by: user?.id,
      updated_by: user?.id,
      position: children.length,
    } as never).select("id").maybeSingle();
    if (error) { toast.error(error.message); return; }
    const created = data as { id: string } | null;
    if (created?.id) navigate({ to: "/documents/$docId", params: { docId: created.id } });
  };

  const deleteDoc = async () => {
    if (!doc) return;
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Página excluída");
    navigate({ to: doc.parent_id ? "/documents/$docId" : "/documents", params: doc.parent_id ? { docId: doc.parent_id } : undefined });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 md:px-12 py-10 space-y-6">
        <div className="h-3 w-1/3 rounded-full bg-muted/50 animate-pulse" />
        <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />
        <div className="h-12 w-2/3 rounded-md bg-muted/50 animate-pulse" />
        <div className="h-64 rounded-md bg-muted/20 animate-pulse mt-8" />
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="mx-auto max-w-md text-center py-24 px-6 space-y-4">
        <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-semibold">Página não encontrada</h2>
        <p className="text-sm text-muted-foreground">Esta página foi excluída ou nunca existiu.</p>
        <Link to="/documents"><Button variant="outline">Voltar para Documentos</Button></Link>
      </div>
    );
  }

  const cover = doc.cover_color;

  const formatRelative = (iso: string) => {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h`;
    const days = Math.floor(h / 24);
    if (days === 1) return "ontem";
    if (days < 7) return `há ${days} dias`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const initial = (name?: string | null) => (name ?? "U").trim().charAt(0).toUpperCase();

  const setIcon = (icon: string | null) => { persist({ icon }); setDoc({ ...doc, icon }); };
  const setCover = (color: string | null) => { persist({ cover_color: color }); setDoc({ ...doc, cover_color: color }); };

  const emojiGrid = (
    <div className="grid max-w-[260px] grid-cols-10 gap-1">
      {EMOJIS.map((e) => (
        <button key={e} type="button" aria-label={`Ícone ${e}`} className="rounded p-1 text-xl hover:bg-accent" onClick={() => setIcon(e)}>
          {e}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative">
      {/* Barra do topo: caminho + status + opções */}
      <div className="sticky top-0 z-30 flex h-10 items-center justify-between gap-3 border-b border-border/40 bg-background/90 px-6 text-xs backdrop-blur md:px-10">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-muted-foreground">
          <Link to="/documents" className="transition-colors hover:text-foreground">Documentos</Link>
          {ancestors.map((a) => (
            <span key={a.id} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
              <Link to="/documents/$docId" params={{ docId: a.id }} className="max-w-[160px] truncate transition-colors hover:text-foreground">
                {a.icon} {a.title}
              </Link>
            </span>
          ))}
          <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
          <span className="max-w-[280px] truncate text-foreground/90">{doc.icon} {title || "Sem título"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
          {saving ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
            </span>
          ) : savedAt && (
            <span>Salvo {savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={async () => {
              const url = `${window.location.origin}/documents/${docId}`;
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link copiado");
              } catch {
                toast.error("Não foi possível copiar", { description: url });
              }
            }}
          >
            <Link2 className="mr-1 h-3.5 w-3.5" /> Copiar link
          </Button>
          <PageStylesButton
            fontStyle={fontStyle} onFontStyle={setFontStyle}
            textSize={textSize} onTextSize={setTextSize}
            pageWidth={pageWidth} onPageWidth={setPageWidth}
            toolbarMode={toolbarMode} onToolbarMode={setToolbarMode}
            showOutline={showOutline === "on"} onShowOutline={(v) => setShowOutline(v ? "on" : "off")}
            canEdit={canEdit}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Mais opções">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                disabled={exporting}
                onSelect={async (e) => {
                  e.preventDefault();
                  if (!doc) return;
                  setExporting(true);
                  try {
                    await exportDocumentAsDocx(doc.id, doc.title || "documento");
                    toast.success("Documento exportado");
                  } catch (err) {
                    toast.error("Falha ao exportar", { description: (err as Error).message });
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Exportar como .docx
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(e) => { e.preventDefault(); setConfirmDelete(true); }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir página
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Capa: só aparece quando o documento tem uma */}
      {cover && (
        <div className="group/cover relative">
          <div
            className="h-24 w-full md:h-28"
            style={{ background: `linear-gradient(135deg, ${cover}, color-mix(in oklab, ${cover} 45%, transparent))` }}
          />
          {canEdit && (
            <div className="absolute bottom-2 right-6 flex gap-1 opacity-0 transition group-hover/cover:opacity-100 md:right-10">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" className="h-7 text-xs">Trocar cor</Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="end">
                  <div className="flex gap-1">
                    {COLORS.map((c) => (
                      <button key={c} type="button" aria-label={`Cor ${c}`}
                        className="h-5 w-5 rounded-full ring-1 ring-border transition hover:scale-110"
                        style={{ backgroundColor: c }}
                        onClick={() => setCover(c)} />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => setCover(null)}>Remover capa</Button>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center gap-10 px-6 md:px-16">
        <div className={cn("w-full min-w-0", WIDTH_CLASS[pageWidth], FONT_CLASS[fontStyle], `doc-size-${textSize}`)}>
          {/* Ícone e botões de ícone, capa e subpágina */}
          <div className={cn("group/head flex items-end gap-2", cover ? "-mt-8" : "mt-8")}>
            {doc.icon && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button" aria-label="Mudar ícone" title="Mudar ícone" disabled={!canEdit}
                    className="rounded-lg p-1 text-5xl leading-none transition hover:bg-accent/40"
                  >
                    {doc.icon}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start">
                  {emojiGrid}
                  <button type="button" className="mt-2 w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent" onClick={() => setIcon(null)}>
                    Remover ícone
                  </button>
                </PopoverContent>
              </Popover>
            )}
            {canEdit && (
              <div className="flex gap-1 pb-1 opacity-60 transition group-hover/head:opacity-100">
                {!doc.icon && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent/40 hover:text-foreground">
                        <Smile className="h-3.5 w-3.5" /> Adicionar ícone
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">{emojiGrid}</PopoverContent>
                  </Popover>
                )}
                {!cover && (
                  <button type="button" onClick={() => setCover(COLORS[0])}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent/40 hover:text-foreground">
                    <ImagePlus className="h-3.5 w-3.5" /> Adicionar capa
                  </button>
                )}
                <button type="button" onClick={addSubpage}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent/40 hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" /> Subpágina
                </button>
              </div>
            )}
          </div>

          {/* Título */}
          <textarea
            ref={titleRef}
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={onTitleBlur}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
            disabled={!canEdit}
            placeholder="Sem título"
            aria-label="Título do documento"
            className="mt-3 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-3xl font-bold leading-tight tracking-tight placeholder:text-muted-foreground/40 focus:outline-none md:text-4xl"
          />

          {/* Quem editou */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-foreground/60">
            {doc.updated_by && profiles[doc.updated_by] && (
              <>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                  {initial(profiles[doc.updated_by])}
                </span>
                <span>
                  <span className="font-medium text-foreground/90">{profiles[doc.updated_by]}</span>
                  {" editou "}{formatRelative(doc.updated_at)}
                </span>
              </>
            )}
            {doc.created_by && profiles[doc.created_by] && doc.created_by !== doc.updated_by && (
              <>
                <span className="opacity-30">·</span>
                <span>criado por <span className="text-foreground/90">{profiles[doc.created_by]}</span></span>
              </>
            )}
          </div>

          {/* Subpáginas: recolhíveis para não empurrar o texto para baixo */}
          {children.length > 0 && (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowSubpages((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showSubpages && "rotate-90")} />
                Subpáginas · {children.length}
              </button>
              {showSubpages && (
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {children.map((c) => (
                    <Link key={c.id} to="/documents/$docId" params={{ docId: c.id }}
                      className="group inline-flex items-center gap-2 rounded-md border border-border/50 bg-card/40 px-3 py-2 text-sm transition-colors hover:border-border hover:bg-accent/40">
                      <span>{c.icon ?? "📄"}</span>
                      <span className="flex-1 truncate group-hover:text-primary">{c.title || "Sem título"}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Editor */}
          <div className="relative mt-6 pb-32">
            <DocumentEditor
              key={docId} value={content} onChange={onContentChange} editable={canEdit} onEditor={setEditorInst}
              toolbarMode={toolbarMode} onToolbarModeChange={setToolbarMode}
            />
          </div>
        </div>

        {editorInst && pageWidth !== "full" && showOutline === "on" && (
          <aside className="hidden w-56 shrink-0 xl:block">
            <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto pt-24">
              <DocumentOutline editor={editorInst} />
            </div>
          </aside>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir página?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta página e todas as subpáginas serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteDoc} className="bg-destructive-strong text-destructive-foreground hover:bg-destructive-strong/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

