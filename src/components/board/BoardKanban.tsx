import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Plus, ArrowLeft, MoreVertical, Settings2, ChevronDown, Search, X, SlidersHorizontal,
  CircleCheck, CirclePause, CircleDashed, Contrast, Eye, ChartPie, CircleDot, Check, Flag, ListChecks, Calendar,
  Repeat, SquareKanban, Copy, Link2, ArrowRightLeft, Trash2, type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors,
  closestCorners, useDroppable, CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useProfiles, firstName as firstNameUtil } from "@/hooks/use-profiles";
import { CardDetailSheet } from "./CardDetailSheet";
import { useCompleteGuard } from "./useCompleteGuard";
import { AssigneeStack } from "./AssigneeStack";
import { ColumnsSettingsDialog } from "./ColumnsSettingsDialog";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, formatDateBR, relativeDueBR, todayLocalISO } from "@/lib/utils";
import { recurrenceLabel, type Recurrence } from "@/lib/recurrence";
import { PRIORITY_META, showsFlagOnCard } from "@/lib/priority";
import { copyCardLink, deleteCard, duplicateCard } from "@/lib/card-actions";

type CustomField = { id: string; name: string; type: "text" | "link" | "select"; options: { values?: string[] } | null; board_id: string | null; position: number };
type CardFieldValue = { card_id: string; field_id: string; value: string | null };

export type Column = { id: string; board_id: string; name: string; position: number; color: string; is_done_column: boolean; is_paused_column: boolean; wip_limit: number | null; kind_id: string | null };
export type Card = {
  id: string; board_id: string; column_id: string; short_id: string; title: string;
  description?: unknown; assignee_id: string | null;
  squad_id: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  start_date: string | null; end_date: string | null; due_date: string | null;
  completed_at: string | null; position: number; created_by: string | null;
  created_at: string; updated_at: string;
  recurrence: Recurrence | null;
};
export type SquadLite = { id: string; name: string; color: string };
type BoardLite = { id: string; name: string; color: string };

// Ações do menu "⋮" do card, já filtradas pela permissão de quem está vendo
type CardActions = {
  otherBoards: BoardLite[];
  canDuplicate: boolean;
  canMove: boolean;
  canDelete: boolean;
  onDuplicate: (cardId: string) => void;
  onCopyLink: (cardId: string) => void;
  onMoveToBoard: (cardId: string, targetBoardId: string) => void;
  onDelete: (card: Card) => void;
};

// Classe base dos chips do card (responsáveis, prazo, prioridade, subtarefas, recorrência)
const CHIP = "inline-flex h-6 items-center gap-1 rounded-sm border border-border px-1.5 text-[11px] font-medium leading-none text-muted-foreground";

// Ícone do cabeçalho pelo TIPO da coluna, nunca pela posição
const KIND_ICONS: Record<string, LucideIcon> = {
  "Pendente": CircleDashed,
  "Em progresso": Contrast,
  "Revisão": Eye,
  "Análise de métricas": ChartPie,
};
function columnIcon(col: Column, kindLabel?: string): LucideIcon {
  if (col.is_done_column) return CircleCheck;
  if (col.is_paused_column || /paus/i.test(kindLabel ?? "")) return CirclePause;
  return KIND_ICONS[kindLabel ?? ""] ?? CircleDot;
}

// Soltar vale pela coluna sob o ponteiro (eixo x), mesmo abaixo do fim dela: com items-start as
// colunas têm alturas diferentes e o closestCorners sozinho podia escolher um card da coluna vizinha.
// Dentro da coluna, o closestCorners decide a posição como antes.
const columnFirstCollision: CollisionDetection = (args) => {
  const x = args.pointerCoordinates?.x;
  const lane = x == null ? undefined : args.droppableContainers
    .filter((d) => String(d.id).startsWith("col-"))
    .map((d) => args.droppableRects.get(d.id))
    .find((r) => r && x >= r.left && x <= r.right);
  if (!lane) return closestCorners(args);
  const inLane = args.droppableContainers.filter((d) => {
    const r = args.droppableRects.get(d.id);
    return r && r.left + r.width / 2 >= lane.left && r.left + r.width / 2 <= lane.right;
  });
  return closestCorners({ ...args, droppableContainers: inLane });
};

type Filter = "all" | "mine" | "due_today" | "overdue" | "no_assignee" | "created_by_me";

export function BoardKanban({ boardId }: { boardId: string }) {
  const { isAdmin, user, canEditTab, hasCapability } = useAuth();
  // Mesmas regras do resto da esteira: editar a aba cria cards, mover pede "move_cards"
  // e excluir segue o card aberto (só admin)
  const canEditBoards = !!canEditTab("boards");
  const canMoveCards = canEditBoards && hasCapability("move_cards");
  const { data: sharedProfiles = [] } = useProfiles();
  const qc = useQueryClient();
  const { confirmComplete, completeGuardDialog } = useCompleteGuard();
  const [board, setBoard] = useState<{ name: string; description: string | null; color: string } | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const cardsRef = useRef<Card[]>([]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);
  const [subitems, setSubitems] = useState<Record<string, { id: string; title: string; done: boolean; position: number }[]>>({});
  const [cardAssignees, setCardAssignees] = useState<Record<string, string[]>>({});
  const [otherBoards, setOtherBoards] = useState<BoardLite[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  // Card a excluir pelo menu (o alvo fica guardado enquanto o diálogo fecha)
  const [deleteTarget, setDeleteTarget] = useState<Card | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const search = useSearch({ strict: false }) as { card?: string };
  const navigate = useNavigate();
  const [openCardId, setOpenCardId] = useState<string | null>(search.card ?? null);
  useEffect(() => { if (search.card) setOpenCardId(search.card); }, [search.card]);
  const [filter, setFilter] = useState<Filter>("all");
  const [columnsSettingsOpen, setColumnsSettingsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim().toLowerCase()), 150);
    return () => clearTimeout(t);
  }, [searchInput]);
  // Filtros ativos: responsável ou campo personalizado (select multi / contains)
  type ActiveFilter =
    | { kind: "assignee"; values: string[] }
    | { kind: "field_select"; fieldId: string; values: string[] }
    | { kind: "field_text"; fieldId: string; contains: string };
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  // Etapa "escolher valor": "assignee" | fieldId | null
  const [selectingFilter, setSelectingFilter] = useState<string | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");

  const { data: customFields = [] } = useQuery<CustomField[]>({
    queryKey: ["board_custom_fields", boardId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_fields")
        .select("id,name,type,options,board_id,position")
        .or(`board_id.eq.${boardId},board_id.is.null`)
        .order("position");
      if (error) throw error;
      return (data ?? []) as CustomField[];
    },
  });

  const cardIdsKey = useMemo(() => cards.map((c) => c.id).sort().join(","), [cards]);
  const { data: fieldValues = [] } = useQuery<CardFieldValue[]>({
    queryKey: ["card_field_values", boardId, cardIdsKey],
    enabled: cards.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const ids = cards.map((c) => c.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("card_field_values")
        .select("card_id,field_id,value")
        .in("card_id", ids);
      if (error) throw error;
      return (data ?? []) as CardFieldValue[];
    },
  });

  const valuesByCard = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const v of fieldValues) {
      if (!v.value) continue;
      (m[v.card_id] ??= {})[v.field_id] = v.value;
    }
    return m;
  }, [fieldValues]);

  const activeFiltersCount = activeFilters.length + (filter !== "all" ? 1 : 0);

  const customFieldsById = useMemo(() => {
    const m: Record<string, CustomField> = {};
    for (const f of customFields) m[f.id] = f;
    return m;
  }, [customFields]);

  // Tipos de coluna (Pendente, Em progresso...) para o ícone do cabeçalho
  const { data: kinds = [] } = useQuery({
    queryKey: ["board_column_kinds"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => (await supabase.from("board_column_kinds").select("id,label")).data ?? [],
  });
  const kindLabel = useMemo(() => Object.fromEntries(kinds.map((k) => [k.id, k.label])) as Record<string, string>, [kinds]);



  const profilesMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of sharedProfiles) m[p.id] = (p.full_name ?? p.email ?? "").trim();
    return m;
  }, [sharedProfiles]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    const [b, c, k, ob] = await Promise.all([
      supabase.from("boards").select("name,description,color").eq("id", boardId).maybeSingle(),
      supabase.from("board_columns").select("*").eq("board_id", boardId).order("position"),
      supabase.from("cards")
        .select("id,board_id,column_id,short_id,title,assignee_id,squad_id,priority,start_date,end_date,due_date,completed_at,position,created_by,created_at,updated_at,recurrence")
        .eq("board_id", boardId).order("position").range(0, 1999),
      supabase.from("boards").select("id,name,color").neq("id", boardId).order("position"),
    ]);
    const loadError = b.error ?? c.error ?? k.error ?? ob.error;
    if (loadError) {
      // Mantém o que já está na tela em vez de esvaziar o quadro
      toast.error("Erro ao carregar o quadro. Verifique a conexão e tente novamente.");
      return;
    }
    setBoard((b.data as never) ?? null);
    setColumns((c.data ?? []) as Column[]);
    const cardList = (k.data ?? []) as Card[];
    setCards(cardList);
    setOtherBoards((ob.data ?? []) as BoardLite[]);
    const ids = cardList.map((x) => x.id);
    if (ids.length) {
      const [siRes, caRes] = await Promise.all([
        supabase.from("card_subitems")
          .select("id,card_id,title,done,position").in("card_id", ids).order("position").range(0, 4999),
        supabase.from("card_assignees" as never)
          .select("card_id,user_id").in("card_id", ids),
      ]);
      if (!siRes.error) {
        const map: Record<string, { id: string; title: string; done: boolean; position: number }[]> = {};
        ((siRes.data ?? []) as { id: string; card_id: string; title: string; done: boolean; position: number }[]).forEach((s) => {
          (map[s.card_id] ??= []).push({ id: s.id, title: s.title, done: s.done, position: s.position });
        });
        setSubitems(map);
      }
      if (!caRes.error) {
        const am: Record<string, string[]> = {};
        ((caRes.data ?? []) as Array<{ card_id: string; user_id: string }>).forEach((r) => {
          (am[r.card_id] ??= []).push(r.user_id);
        });
        setCardAssignees(am);
      }
    } else {
      setSubitems({});
      setCardAssignees({});
    }
  }, [boardId]);

  useEffect(() => { load(); }, [load]);

  // Realtime granular — apply incremental changes instead of full reload
  useEffect(() => {
    type RT<T> = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: T; old: T };
    const ch = supabase.channel(`board:${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards", filter: `board_id=eq.${boardId}` }, (p) => {
        const ev = p as unknown as RT<Card>;
        if (ev.eventType === "INSERT") {
          setCards((prev) => prev.some((c) => c.id === ev.new.id) ? prev : [...prev, ev.new].sort((a, b) => a.position - b.position));
        } else if (ev.eventType === "UPDATE") {
          setCards((prev) => prev.map((c) => c.id === ev.new.id ? { ...c, ...ev.new } : c));
        } else if (ev.eventType === "DELETE") {
          setCards((prev) => prev.filter((c) => c.id !== ev.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "board_columns", filter: `board_id=eq.${boardId}` }, (p) => {
        const ev = p as unknown as RT<Column>;
        if (ev.eventType === "INSERT") {
          setColumns((prev) => prev.some((c) => c.id === ev.new.id) ? prev : [...prev, ev.new].sort((a, b) => a.position - b.position));
        } else if (ev.eventType === "UPDATE") {
          setColumns((prev) => prev.map((c) => c.id === ev.new.id ? { ...c, ...ev.new } : c));
        } else if (ev.eventType === "DELETE") {
          setColumns((prev) => prev.filter((c) => c.id !== ev.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "card_subitems" }, (p) => {
        const ev = p as unknown as { eventType: "INSERT" | "UPDATE" | "DELETE"; new: { card_id?: string }; old: { card_id?: string } };
        const cardId = ev.new?.card_id ?? ev.old?.card_id;
        if (!cardId || !cardsRef.current.some((c) => c.id === cardId)) return;
        void supabase.from("card_subitems").select("id,card_id,title,done,position").eq("card_id", cardId).order("position")
          .then(({ data }) => {
            setSubitems((prev) => ({
              ...prev,
              [cardId]: ((data ?? []) as { id: string; title: string; done: boolean; position: number }[])
                .map((s) => ({ id: s.id, title: s.title, done: s.done, position: s.position })),
            }));
          });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "card_field_values" }, (p) => {
        const ev = p as unknown as { new: { card_id?: string }; old: { card_id?: string } };
        const cardId = ev.new?.card_id ?? ev.old?.card_id;
        if (!cardId || !cardsRef.current.some((c) => c.id === cardId)) return;
        qc.invalidateQueries({ queryKey: ["card_field_values", boardId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "card_assignees" }, (p) => {
        const ev = p as unknown as { new: { card_id?: string }; old: { card_id?: string } };
        const cardId = ev.new?.card_id ?? ev.old?.card_id;
        if (!cardId || !cardsRef.current.some((c) => c.id === cardId)) return;
        void supabase.from("card_assignees" as never).select("user_id").eq("card_id", cardId)
          .then(({ data }) => {
            setCardAssignees((prev) => ({
              ...prev,
              [cardId]: ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
            }));
          });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [boardId, qc]);

  const today = todayLocalISO();
  const filteredCards = useMemo(() => cards.filter((c) => {
    const cAssignees = cardAssignees[c.id] ?? [];
    const isMine = c.assignee_id === user?.id || (user?.id ? cAssignees.includes(user.id) : false);
    if (filter === "mine" && !isMine) return false;
    if (filter === "due_today" && c.due_date !== today) return false;
    if (filter === "overdue" && !(c.due_date && c.due_date < today && !c.completed_at)) return false;
    if (filter === "no_assignee" && (c.assignee_id || cAssignees.length > 0)) return false;
    if (filter === "created_by_me" && c.created_by !== user?.id) return false;
    if (searchTerm) {
      const hay = `${c.title} ${c.short_id ?? ""}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }
    for (const af of activeFilters) {
      if (af.kind === "assignee") {
        if (af.values.length === 0) continue;
        const all = new Set<string>(cAssignees);
        if (c.assignee_id) all.add(c.assignee_id);
        if (all.size === 0) {
          if (!af.values.includes("")) return false;
        } else {
          const hit = af.values.some((v) => v === "" ? all.size === 0 : all.has(v));
          if (!hit) return false;
        }
      } else if (af.kind === "field_select") {
        if (af.values.length === 0) continue;
        const v = valuesByCard[c.id]?.[af.fieldId];
        if (!v || !af.values.includes(v)) return false;
      } else {
        const term = af.contains.trim().toLowerCase();
        if (!term) continue;
        const v = valuesByCard[c.id]?.[af.fieldId];
        if (!v || !v.toLowerCase().includes(term)) return false;
      }
    }
    return true;
  }), [cards, filter, user?.id, today, searchTerm, activeFilters, valuesByCard, cardAssignees]);


  const cardsByColumn = useMemo(() => {
    const map: Record<string, Card[]> = {};
    columns.forEach((c) => (map[c.id] = []));
    filteredCards.forEach((c) => { (map[c.column_id] ??= []).push(c); });
    // Ordem pela posição: arrastar e duplicar só mudam a posição, não a ordem da lista
    for (const list of Object.values(map)) list.sort((a, b) => a.position - b.position);
    return map;
  }, [columns, filteredCards]);

  const closeCardSheet = useCallback(() => {
    setOpenCardId(null);
    if (search.card) navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, card: undefined }) });
  }, [search.card, navigate]);

  const openAddCard = async (columnId: string) => {
    const col = columns.find((c) => c.id === columnId);
    const count = cardsByColumn[columnId]?.length ?? 0;
    if (col?.wip_limit != null && count >= col.wip_limit) {
      if (!isAdmin) { toast.error(`Limite WIP atingido em "${col.name}"`); return; }
      if (!window.confirm(`Coluna "${col.name}" está no limite (${col.wip_limit}). Adicionar mesmo assim?`)) return;
    }
    // Entra no fim da coluna: conta TODOS os cards dela, não só os que o filtro mostra
    const positions = cardsRef.current.filter((c) => c.column_id === columnId).map((c) => c.position);
    const position = positions.length ? Math.max(...positions) + 1 : 0;
    const { data, error } = await supabase
      .from("cards")
      .insert({
        board_id: boardId, column_id: columnId, title: "Nova tarefa", position, created_by: user?.id,
      } as never)
      .select("*")
      .single();
    if (error) { toast.error(error.message); return; }
    const newCard = data as Card | null;
    if (newCard) {
      // Insere localmente na hora — o INSERT do realtime chega depois e é deduplicado
      setCards((prev) => prev.some((c) => c.id === newCard.id) ? prev : [...prev, newCard]);
      setOpenCardId(newCard.id);
    }
  };

  const moveCardToBoard = async (cardId: string, targetBoardId: string) => {
    const { data: cols } = await supabase
      .from("board_columns")
      .select("id")
      .eq("board_id", targetBoardId)
      .order("position")
      .limit(1);
    const firstCol = (cols as { id: string }[] | null)?.[0];
    if (!firstCol) { toast.error("Esteira destino sem colunas"); return; }
    const { error } = await supabase
      .from("cards")
      .update({ board_id: targetBoardId, column_id: firstCol.id, position: 0 } as never)
      .eq("id", cardId);
    if (error) { toast.error(error.message); return; }
    toast.success("Card movido para outra esteira");
    load();
  };

  // Duplica logo depois do original, na mesma coluna. Original concluído: a cópia vai para
  // o fim da primeira coluna em aberto (na de concluídos o banco já a criaria concluída)
  const duplicateCardHere = async (cardId: string) => {
    const orig = cardsRef.current.find((c) => c.id === cardId);
    if (!orig) return;
    const origCol = columns.find((c) => c.id === orig.column_id);
    const col = origCol?.is_done_column ? (columns.find((c) => !c.is_done_column) ?? origCol) : origCol;
    const targetColId = col?.id ?? orig.column_id;
    const sameColumn = targetColId === orig.column_id;
    const colCards = cardsRef.current
      .filter((c) => c.column_id === targetColId)
      .sort((a, b) => a.position - b.position);
    // Mesma regra do "Adicionar tarefa" para o limite WIP
    if (col?.wip_limit != null && colCards.length >= col.wip_limit) {
      if (!isAdmin) { toast.error(`Limite WIP atingido em "${col.name}"`); return; }
      if (!window.confirm(`Coluna "${col.name}" está no limite (${col.wip_limit}). Duplicar mesmo assim?`)) return;
    }
    let position = colCards.length ? colCards[colCards.length - 1].position + 1 : 0;
    let shifts: { id: string; position: number; old: number }[] = [];
    if (sameColumn) {
      const idx = colCards.findIndex((c) => c.id === orig.id);
      position = idx + 1;
      // Abre a vaga logo depois do original: renumera a coluna em ordem, como o arrastar faz.
      // Aplica na tela antes de criar, para o INSERT do realtime já cair no lugar certo
      shifts = colCards
        .map((c, i) => ({ id: c.id, position: i <= idx ? i : i + 1, old: c.position }))
        .filter((u) => u.position !== u.old);
    }
    const applyShifts = (back: boolean) => setCards((prev) => prev.map((c) => {
      const u = shifts.find((s) => s.id === c.id);
      return u ? { ...c, position: back ? u.old : u.position } : c;
    }));
    applyShifts(false);
    // São várias gravações (card, etiquetas, subtarefas...): o aviso troca de estado no fim
    const toastId = toast.loading("Duplicando card...");
    const res = await duplicateCard(orig.id, { position, columnId: targetColId, userId: user?.id });
    if ("error" in res) { applyShifts(true); toast.error(res.error, { id: toastId }); return; }
    const { card, subitems: copySubs, assigneeIds, failed } = res.data;
    const copy = card as unknown as Card;
    // Insere localmente na hora — o INSERT do realtime chega depois e é deduplicado
    setCards((prev) => prev.some((c) => c.id === copy.id) ? prev : [...prev, copy]);
    if (copySubs.length) setSubitems((prev) => ({ ...prev, [copy.id]: copySubs }));
    if (assigneeIds.length) setCardAssignees((prev) => ({ ...prev, [copy.id]: assigneeIds }));
    const openCopy = { label: "Abrir cópia", onClick: () => setOpenCardId(copy.id) };
    const where = sameColumn ? "" : `O original já estava concluído, então a cópia foi para "${col?.name ?? "a primeira coluna"}".`;
    if (failed.length) {
      toast.warning("Card duplicado, mas parte não foi copiada", { id: toastId, description: `${where} Faltou: ${failed.join(", ")}.`.trim(), action: openCopy });
    } else {
      toast.success("Card duplicado", { id: toastId, description: where || undefined, action: openCopy });
    }
    if (shifts.length) {
      const results = await Promise.all(shifts.map((u) =>
        supabase.from("cards").update({ position: u.position } as never).eq("id", u.id)
      ));
      const errored = results.find((r) => r.error);
      if (errored?.error) { toast.error(errored.error.message); load(); }
    }
  };

  const requestDeleteCard = (card: Card) => {
    setDeleteTarget(card);
    setDeleteOpen(true);
  };

  const confirmDeleteCard = async () => {
    const target = deleteTarget;
    if (!target) return;
    const error = await deleteCard(target.id);
    if (error) { toast.error(error); return; }
    setCards((prev) => prev.filter((c) => c.id !== target.id));
    if (openCardId === target.id) closeCardSheet();
    toast.success(`${target.short_id} excluído`);
  };

  const cardActions: CardActions = {
    otherBoards,
    canDuplicate: canEditBoards,
    canMove: canMoveCards,
    canDelete: isAdmin,
    onDuplicate: duplicateCardHere,
    onCopyLink: (cardId) => copyCardLink(boardId, cardId),
    onMoveToBoard: moveCardToBoard,
    onDelete: requestDeleteCard,
  };

  const toggleSubitem = async (cardId: string, subId: string, done: boolean) => {
    setSubitems((prev) => {
      const list = prev[cardId] ?? [];
      return { ...prev, [cardId]: list.map((s) => s.id === subId ? { ...s, done } : s) };
    });
    const { error } = await supabase.from("card_subitems").update({ done } as never).eq("id", subId);
    if (error) { toast.error(error.message); load(); }
  };

  // Subtarefas que o aviso de conclusão acabou de marcar
  const markSubsDoneLocally = (cardId: string) =>
    setSubitems((prev) => ({ ...prev, [cardId]: (prev[cardId] ?? []).map((s) => ({ ...s, done: true })) }));

  const toggleCardDone = async (cardId: string, done: boolean) => {
    if (done) {
      if (!(await confirmComplete(cardId))) return;
      markSubsDoneLocally(cardId);
    }
    const completed_at = done ? new Date().toISOString() : null;
    // O banco leva o card para a primeira coluna de concluídos (ou de volta para a primeira em
    // aberto, ao reabrir um card que está em concluídos); aqui só antecipa na tela
    const card = cardsRef.current.find((c) => c.id === cardId);
    const curCol = columns.find((c) => c.id === card?.column_id);
    const destCol = done
      ? (curCol?.is_done_column ? null : columns.find((c) => c.is_done_column))
      : (curCol?.is_done_column ? columns.find((c) => !c.is_done_column) : null);
    const destPositions = destCol ? cardsRef.current.filter((c) => c.column_id === destCol.id).map((c) => c.position) : [];
    const topPos = destCol ? (destPositions.length ? Math.min(...destPositions) : 0) - 1 : null;
    setCards((prev) => prev.map((c) => c.id === cardId
      ? { ...c, completed_at, ...(destCol && topPos != null ? { column_id: destCol.id, position: topPos } : {}) }
      : c));
    const { error } = await supabase.from("cards").update({ completed_at } as never).eq("id", cardId);
    if (error) { toast.error(error.message); load(); }
  };

  const onDragStart = (e: DragStartEvent) => {
    const c = cards.find((x) => x.id === e.active.id);
    setActiveCard(c ?? null);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = e;
    if (!over) return;
    const card = cards.find((c) => c.id === active.id);
    if (!card) return;
    let targetCol: string | undefined;
    let overCardId: string | null = null;
    const overId = String(over.id);
    if (overId.startsWith("col-")) {
      targetCol = overId.slice(4);
    } else {
      const overCard = cards.find((c) => c.id === over.id);
      if (overCard) { targetCol = overCard.column_id; overCardId = overCard.id; }
      else if (columns.find((c) => c.id === overId)) targetCol = overId;
    }
    if (!targetCol) return;

    const switchingColumn = targetCol !== card.column_id;

    if (switchingColumn) {
      const tcol = columns.find((c) => c.id === targetCol);
      const tcount = cardsByColumn[targetCol]?.length ?? 0;
      if (tcol?.wip_limit != null && tcount >= tcol.wip_limit) {
        if (!isAdmin) { toast.error(`Limite WIP atingido em "${tcol.name}"`); return; }
        if (!window.confirm(`Coluna "${tcol.name}" está no limite (${tcol.wip_limit}). Mover mesmo assim?`)) return;
      }
      // Arrastar para concluídos também conclui: mesmo aviso das subtarefas em aberto
      const scol = columns.find((c) => c.id === card.column_id);
      if (tcol?.is_done_column && !scol?.is_done_column) {
        if (!(await confirmComplete(card.id))) return;
        markSubsDoneLocally(card.id);
      }
    }

    const sourceColId = card.column_id;
    const sourceList = (cardsByColumn[sourceColId] ?? []).filter((c) => c.id !== card.id);
    const targetBaseList = switchingColumn ? (cardsByColumn[targetCol] ?? []) : sourceList;
    const targetList = targetBaseList.filter((c) => c.id !== card.id);
    let insertIdx = targetList.length;
    if (overCardId && overCardId !== card.id) {
      const idx = targetList.findIndex((c) => c.id === overCardId);
      if (idx >= 0) insertIdx = idx;
    }
    targetList.splice(insertIdx, 0, { ...card, column_id: targetCol });

    const updates: { id: string; position: number; column_id: string }[] = [];
    targetList.forEach((c, i) => {
      const orig = cards.find((x) => x.id === c.id);
      if (!orig) return;
      if (orig.position !== i || orig.column_id !== targetCol) {
        updates.push({ id: c.id, position: i, column_id: targetCol! });
      }
    });
    if (switchingColumn) {
      sourceList.forEach((c, i) => {
        if (c.position !== i) updates.push({ id: c.id, position: i, column_id: sourceColId });
      });
    }
    if (updates.length === 0) return;

    setCards((prev) => prev.map((c) => {
      const u = updates.find((x) => x.id === c.id);
      return u ? { ...c, position: u.position, column_id: u.column_id } : c;
    }));

    const results = await Promise.all(updates.map((u) =>
      supabase.from("cards").update({ position: u.position, column_id: u.column_id } as never).eq("id", u.id)
    ));
    const errored = results.find((r) => r.error);
    if (errored?.error) { toast.error(errored.error.message); load(); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link to="/boards" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Esteiras</Link>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            {/* Ícone na cor da esteira (mesma receita .tint das colunas) */}
            <span
              className="tint grid h-6 w-6 shrink-0 place-items-center rounded-md bg-(--tint-pill) text-(--tint-ink)"
              style={{ "--tint": board?.color } as React.CSSProperties}
            >
              <SquareKanban className="h-3.5 w-3.5" />
            </span>
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{board?.name ?? "Esteira"}</h1>
          </div>
          {board?.description && <p className="text-sm text-muted-foreground line-clamp-2">{board.description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar card..."
              className="h-8 pl-7 pr-7 w-[200px] sm:w-[220px] text-sm"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-accent"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Popover open={filterPopoverOpen} onOpenChange={(o) => { setFilterPopoverOpen(o); if (!o) { setSelectingFilter(null); setAssigneeSearch(""); } }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="h-4 w-4" /> Filtros
                {activeFiltersCount > 0 && (
                  <span className="ml-1 text-[10px] rounded-full bg-primary/20 text-primary px-1.5 py-0.5">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-2 space-y-2">
              {(() => {
                if (selectingFilter === "assignee") {
                  const current = (activeFilters.find((f) => f.kind === "assignee") as Extract<ActiveFilter, { kind: "assignee" }> | undefined)?.values ?? [];
                  const term = assigneeSearch.trim().toLowerCase();
                  const list = sharedProfiles.filter((p) => {
                    if (!term) return true;
                    return ((p.full_name ?? "") + " " + (p.email ?? "")).toLowerCase().includes(term);
                  });
                  const toggle = (id: string, on: boolean) => {
                    setActiveFilters((prev) => {
                      const others = prev.filter((f) => f.kind !== "assignee");
                      const next = on ? [...current, id] : current.filter((x) => x !== id);
                      return next.length ? [...others, { kind: "assignee", values: next }] : others;
                    });
                  };
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setSelectingFilter(null); setAssigneeSearch(""); }}>
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </Button>
                        <div className="text-sm font-medium">Responsável</div>
                      </div>
                      <Input value={assigneeSearch} onChange={(e) => setAssigneeSearch(e.target.value)} placeholder="Buscar pessoa..." className="h-8 text-sm" />
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        <label className="flex items-center gap-2 text-sm cursor-pointer px-1 py-1 rounded-sm hover:bg-accent">
                          <Checkbox checked={current.includes("")} onCheckedChange={(v) => toggle("", !!v)} />
                          <span className="text-muted-foreground italic">Sem responsável</span>
                        </label>
                        {list.map((p) => {
                          const name = (p.full_name ?? p.email ?? "—").trim();
                          return (
                            <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-1 rounded-sm hover:bg-accent">
                              <Checkbox checked={current.includes(p.id)} onCheckedChange={(v) => toggle(p.id, !!v)} />
                              <span className="truncate">{name}</span>
                            </label>
                          );
                        })}
                        {list.length === 0 && <div className="text-xs text-muted-foreground italic px-1">Nenhuma pessoa encontrada</div>}
                      </div>
                    </div>
                  );
                }
                const field = selectingFilter ? customFieldsById[selectingFilter] : null;
                if (field) {
                  if (field.type === "select") {
                    const current = (activeFilters.find((f) => f.kind === "field_select" && f.fieldId === field.id) as Extract<ActiveFilter, { kind: "field_select" }> | undefined)?.values ?? [];
                    const toggle = (opt: string, on: boolean) => {
                      setActiveFilters((prev) => {
                        const others = prev.filter((f) => !(f.kind === "field_select" && f.fieldId === field.id));
                        const next = on ? [...current, opt] : current.filter((x) => x !== opt);
                        return next.length ? [...others, { kind: "field_select", fieldId: field.id, values: next }] : others;
                      });
                    };
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectingFilter(null)}>
                            <ArrowLeft className="h-3.5 w-3.5" />
                          </Button>
                          <div className="text-sm font-medium truncate">{field.name}</div>
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {(field.options?.values ?? []).map((opt) => (
                            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-1 rounded-sm hover:bg-accent">
                              <Checkbox checked={current.includes(opt)} onCheckedChange={(v) => toggle(opt, !!v)} />
                              <span className="truncate">{opt}</span>
                            </label>
                          ))}
                          {(field.options?.values ?? []).length === 0 && (
                            <div className="text-xs text-muted-foreground italic px-1">Sem opções configuradas</div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  const current = (activeFilters.find((f) => f.kind === "field_text" && f.fieldId === field.id) as Extract<ActiveFilter, { kind: "field_text" }> | undefined)?.contains ?? "";
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectingFilter(null)}>
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </Button>
                        <div className="text-sm font-medium truncate">{field.name}</div>
                      </div>
                      <Input
                        autoFocus
                        value={current}
                        onChange={(e) => {
                          const v = e.target.value;
                          setActiveFilters((prev) => {
                            const others = prev.filter((f) => !(f.kind === "field_text" && f.fieldId === field.id));
                            return v ? [...others, { kind: "field_text", fieldId: field.id, contains: v }] : others;
                          });
                        }}
                        placeholder="Contém..."
                        className="h-8 text-sm"
                      />
                    </div>
                  );
                }
                // Lista inicial: filtros ativos + adicionar
                const renderChip = (af: ActiveFilter, idx: number) => {
                  let label = "";
                  let key: string;
                  if (af.kind === "assignee") {
                    key = "assignee";
                    const names = af.values.map((v) => v === "" ? "Sem responsável" : firstNameUtil(profilesMap[v] ?? "—")).join(", ");
                    label = `Responsável: ${names || "—"}`;
                  } else if (af.kind === "field_select") {
                    key = af.fieldId;
                    const name = customFieldsById[af.fieldId]?.name ?? "Campo";
                    label = `${name}: ${af.values.join(", ")}`;
                  } else {
                    key = af.fieldId;
                    const name = customFieldsById[af.fieldId]?.name ?? "Campo";
                    label = `${name} contém "${af.contains}"`;
                  }
                  return (
                    <div key={idx} className="flex items-center gap-1 text-xs bg-accent/50 rounded-md pl-2 pr-1 py-1">
                      <button className="flex-1 text-left truncate hover:underline" onClick={() => setSelectingFilter(key)}>{label}</button>
                      <button
                        className="p-0.5 rounded-sm hover:bg-accent"
                        onClick={() => setActiveFilters((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remover filtro"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                };
                const usedKeys = new Set<string>(activeFilters.map((f) => f.kind === "assignee" ? "assignee" : f.fieldId));
                const availableFields = customFields.filter((f) => !usedKeys.has(f.id));
                const assigneeAvailable = !usedKeys.has("assignee");
                return (
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1.5">Atalhos</div>
                      <div className="flex flex-wrap gap-1">
                        {(["all","mine","due_today","overdue","no_assignee","created_by_me"] as Filter[]).map((f) => (
                          <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                              "text-xs px-2 py-1 rounded-md border transition-colors",
                              filter === f
                                ? "bg-primary-strong text-primary-foreground border-primary-strong"
                                : "border-border hover:bg-accent text-foreground/80",
                            )}
                          >
                            {filterLabel(f)}
                          </button>
                        ))}
                      </div>
                    </div>
                    {activeFilters.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1.5">Filtros</div>
                        <div className="space-y-1">{activeFilters.map((af, i) => renderChip(af, i))}</div>
                      </div>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                          <Plus className="h-3.5 w-3.5" /> Adicionar filtro
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        {assigneeAvailable && (
                          <DropdownMenuItem onClick={() => setSelectingFilter("assignee")}>Responsável</DropdownMenuItem>
                        )}
                        {availableFields.map((f) => (
                          <DropdownMenuItem key={f.id} onClick={() => setSelectingFilter(f.id)}>{f.name}</DropdownMenuItem>
                        ))}
                        {!assigneeAvailable && availableFields.length === 0 && (
                          <DropdownMenuItem disabled>Todos os filtros já adicionados</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {activeFiltersCount > 0 && (
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => { setActiveFilters([]); setFilter("all"); }}>
                        <X className="h-3.5 w-3.5" /> Limpar tudo
                      </Button>
                    )}
                  </div>
                );
              })()}
            </PopoverContent>
          </Popover>

          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setColumnsSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" /> Configurar colunas
            </Button>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={columnFirstCollision} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {/* items-start: cada coluna tem a altura do próprio conteúdo */}
        <div className="flex flex-1 min-h-0 items-start gap-3 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none -mx-4 px-4 md:-mx-6 md:px-6">
          {columns.map((col) => (
            <ColumnView
              key={col.id} column={col} cards={cardsByColumn[col.id] ?? []}
              kindLabel={col.kind_id ? kindLabel[col.kind_id] : undefined}
              onAdd={() => openAddCard(col.id)}
              onOpenCard={setOpenCardId}
              actions={cardActions}
              profilesMap={profilesMap}
              cardAssignees={cardAssignees}
              subitems={subitems}
              onToggleSubitem={toggleSubitem}
              onToggleCardDone={toggleCardDone}
            />
          ))}
          {columns.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
              Nenhuma coluna. {isAdmin ? "Use \"Configurar colunas\" para começar." : "Peça a um admin para configurar."}
            </div>
          )}
        </div>
        <DragOverlay>
          {activeCard && (
            // Desenhado fora da coluna: repete o --tint da coluna de origem para o anel
            <div className="tint" style={{ "--tint": columns.find((c) => c.id === activeCard.column_id)?.color } as React.CSSProperties}>
              <CardChip
                card={activeCard}
                dragging
                assignees={(cardAssignees[activeCard.id] ?? (activeCard.assignee_id ? [activeCard.assignee_id] : [])).map((id) => ({ id, name: profilesMap[id] ?? "?" }))}
                subitems={subitems[activeCard.id]}
                // Mesmo espaço do menu, para o card não mudar de tamanho ao ser pego
                menu={<span className="block h-6 w-6" aria-hidden />}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ColumnsSettingsDialog
        open={columnsSettingsOpen}
        boardId={boardId}
        onOpenChange={setColumnsSettingsOpen}
        onSaved={load}
      />

      {openCardId && <CardDetailSheet cardId={openCardId} onClose={closeCardSheet} onChanged={load} />}
      {completeGuardDialog}

      {/* Confirmação do "Excluir" do menu do card */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.short_id ?? "card"}?</AlertDialogTitle>
            <AlertDialogDescription className="wrap-anywhere">
              Isso não pode ser desfeito. O card{deleteTarget ? ` "${deleteTarget.title}"` : ""} e todos os comentários, subtarefas e dependências dele serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive-strong text-destructive-foreground hover:bg-destructive-strong/90"
              onClick={confirmDeleteCard}
            >Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function filterLabel(f: Filter) {
  return ({ all: "Todas", mine: "Atribuídas a mim", due_today: "Vencendo hoje", overdue: "Atrasadas", no_assignee: "Sem responsável", created_by_me: "Criadas por mim" } as const)[f];
}

function ColumnView({
  column, kindLabel, cards, onAdd, onOpenCard, actions, profilesMap, cardAssignees, subitems, onToggleSubitem, onToggleCardDone,
}: {
  column: Column; kindLabel?: string; cards: Card[]; onAdd: () => void;
  onOpenCard: (id: string) => void;
  actions: CardActions;
  profilesMap: Record<string, string>;
  cardAssignees: Record<string, string[]>;
  subitems: Record<string, { id: string; title: string; done: boolean; position: number }[]>;
  onToggleSubitem: (cardId: string, subId: string, done: boolean) => void;
  onToggleCardDone: (cardId: string, done: boolean) => void;
}) {
  const overLimit = column.wip_limit != null && cards.length > column.wip_limit;
  const Icon = columnIcon(column, kindLabel);
  return (
    // Coluna tingida pela cor que vem do banco (receita .tint em styles.css)
    <div
      className={cn(
        "tint group/col flex max-h-full w-[85vw] sm:w-[280px] shrink-0 flex-col rounded-xl border bg-(--tint-lane) p-1.5 snap-center md:snap-align-none",
        overLimit ? "border-destructive/60" : "border-(--tint-edge)",
      )}
      style={{ "--tint": column.color } as React.CSSProperties}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 px-1 pb-1.5">
        <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-sm bg-(--tint-pill) px-2 text-[11px] font-semibold uppercase tracking-wide text-(--tint-ink)">
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          <span className="truncate">{column.name}</span>
        </span>
        <span className={cn("text-xs font-semibold tabular-nums", overLimit ? "rounded-sm bg-destructive/15 px-1.5 text-destructive" : "text-(--tint-ink) opacity-80")}>
          {cards.length}{column.wip_limit ? `/${column.wip_limit}` : ""}
        </span>
        <button
          type="button"
          onClick={onAdd}
          aria-label="Adicionar tarefa"
          // Em tela de toque não há hover: o botão fica sempre visível
          className="ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-sm text-(--tint-ink) opacity-0 transition hover:bg-(--tint-soft) group-hover/col:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ColumnDropArea columnId={column.id}>
          {cards.length === 0 && (
            <div className="grid h-16 place-items-center rounded-lg border border-dashed border-(--tint-edge) text-[11px] text-muted-foreground">
              Solte tarefas aqui
            </div>
          )}
          {cards.map((c) => {
            const ids = cardAssignees[c.id] ?? (c.assignee_id ? [c.assignee_id] : []);
            const assignees = ids.map((id) => ({ id, name: profilesMap[id] ?? "?" }));
            return (
              <SortableCard
                key={c.id}
                card={c}
                onClick={() => onOpenCard(c.id)}
                actions={actions}
                assignees={assignees}
                subitems={subitems[c.id] ?? []}
                onToggleSubitem={(subId, done) => onToggleSubitem(c.id, subId, done)}
                onToggleDone={(done) => onToggleCardDone(c.id, done)}
              />
            );
          })}
        </ColumnDropArea>
      </SortableContext>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 flex h-8 w-full shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-(--tint-ink) opacity-80 transition hover:bg-(--tint-soft) hover:opacity-100"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar tarefa
      </button>
    </div>
  );
}

function ColumnDropArea({ columnId, children }: { columnId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${columnId}`, data: { columnId } });
  return (
    <div
      ref={setNodeRef}
      className={cn("flex-1 min-h-12 space-y-2 overflow-y-auto rounded-lg p-0.5 transition-colors", isOver && "bg-(--tint-soft) ring-1 ring-inset ring-(--tint-line)")}
    >
      {children}
    </div>
  );
}

function SortableCard({
  card, onClick, actions, assignees, subitems, onToggleSubitem, onToggleDone,
}: {
  card: Card; onClick: () => void;
  actions: CardActions;
  assignees: { id: string; name: string }[];
  subitems: { id: string; title: string; done: boolean; position: number }[];
  onToggleSubitem: (subId: string, done: boolean) => void;
  onToggleDone: (done: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const downPosRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        downPosRef.current = { x: e.clientX, y: e.clientY };
        listeners?.onPointerDown?.(e);
      }}
      onClick={(e) => {
        const start = downPosRef.current;
        if (start) {
          const dx = Math.abs(e.clientX - start.x);
          const dy = Math.abs(e.clientY - start.y);
          if (dx < 5 && dy < 5) onClick();
        } else {
          onClick();
        }
      }}
      className={cn(
        "relative group rounded-lg outline-none cursor-grab active:cursor-grabbing touch-none focus-visible:ring-2 focus-visible:ring-ring/60",
        // Origem do arraste: vaga tracejada na cor da coluna (no ::after, para não mudar a altura)
        isDragging && "[&>*]:invisible after:absolute after:inset-0 after:rounded-lg after:border-2 after:border-dashed after:border-(--tint-line) after:bg-(--tint-soft)",
      )}
    >
      <CardChip
        card={card}
        assignees={assignees}
        subitems={subitems}
        onToggleSubitem={onToggleSubitem}
        onToggleDone={onToggleDone}
        menu={<CardMenu card={card} actions={actions} />}
      />
    </div>
  );
}

// Menu "⋮" do card: duplicar, copiar link, mover de esteira e excluir.
// Copiar link vale para todos, então o botão sempre aparece.
function CardMenu({ card, actions }: { card: Card; actions: CardActions }) {
  const moveTargets = actions.canMove ? actions.otherBoards : [];
  return (
    <div
      // Some sem hover, mas fica visível em tela de toque, no foco pelo teclado e com o menu aberto
      className="opacity-0 transition-opacity group-hover:opacity-100 has-focus-visible:opacity-100 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:opacity-100"
      // O menu abre num portal, mas os eventos sobem pela árvore do React: sem isto, clicar
      // num item iniciaria o arraste ou abriria o card
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-6 w-6 rounded-md border border-border bg-card-hover" aria-label="Ações do card">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {actions.canDuplicate && (
            <DropdownMenuItem onClick={() => actions.onDuplicate(card.id)}>
              <Copy /> Duplicar tarefa
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => actions.onCopyLink(card.id)}>
            <Link2 /> Copiar link do card
          </DropdownMenuItem>
          {moveTargets.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft /> Mover para outra esteira
              </DropdownMenuSubTrigger>
              {/* Portal: o menu principal rola (overflow) e cortaria o submenu */}
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-56 max-h-72 overflow-y-auto">
                  {moveTargets.map((b) => (
                    <DropdownMenuItem key={b.id} onClick={() => actions.onMoveToBoard(card.id, b.id)}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                      <span className="truncate">{b.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
          {actions.canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onClick={() => actions.onDelete(card)}
              >
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const firstName = firstNameUtil;

function CardChip({
  card, dragging, assignees, subitems, onToggleSubitem, onToggleDone, menu,
}: {
  card: Card;
  dragging?: boolean;
  assignees?: { id: string; name: string }[];
  subitems?: { id: string; title: string; done: boolean; position: number }[];
  onToggleSubitem?: (subId: string, done: boolean) => void;
  onToggleDone?: (done: boolean) => void;
  /** Menu de ações do card, na linha dos chips (no canto de cima cobria o título) */
  menu?: React.ReactNode;
}) {
  // "Hoje" local: com toISOString o prazo virava às 21h de Brasília
  const today = todayLocalISO();
  const done = !!card.completed_at;
  const subs = subitems ?? [];
  const doneCount = subs.filter((s) => s.done).length;
  const [openSubs, setOpenSubs] = useState(false);
  const pf = showsFlagOnCard(card.priority) ? PRIORITY_META[card.priority] : null;
  const recLabel = recurrenceLabel(card.recurrence);
  // Prazo só ganha cor quando atrasado (vermelho) ou vence hoje (âmbar), e nunca em card concluído
  const dueTone = !card.due_date || done ? ""
    : card.due_date < today ? "border-destructive/30 bg-destructive/10 text-destructive"
    : card.due_date === today ? "border-warning/30 bg-warning/10 text-warning"
    : "";
  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  return (
    <div
      className={cn(
        "relative rounded-lg border border-border p-3 transition-colors",
        // Arrastando: inclinado, mais claro e com anel na cor da coluna de origem
        dragging
          ? "cursor-grabbing rotate-[1.5deg] bg-card-hover shadow-lg ring-1 ring-(--tint-line)"
          : "cursor-pointer bg-card shadow-card hover:border-(--tint-line) hover:bg-card-hover",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onPointerDown={stop}
          onClick={(e) => { stop(e); onToggleDone?.(!done); }}
          className="mt-0.5 shrink-0 rounded-full"
          aria-label={done ? "Marcar como não concluída" : "Marcar como concluída"}
        >
          {done ? (
            <span className="grid h-4 w-4 place-items-center rounded-full bg-success text-success-foreground">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          ) : (
            <span className="block h-4 w-4 rounded-full border-2 border-muted-foreground/35 transition-colors hover:border-success hover:bg-success/10" />
          )}
        </button>
        <p
          title={card.title}
          className={cn(
            "min-w-0 flex-1 text-[13px] font-medium leading-5 text-foreground/95 line-clamp-2 break-words hyphens-auto",
            done && "text-muted-foreground line-through decoration-muted-foreground/40",
          )}
        >
          {card.title}
        </p>
      </div>

      {/* Chips: responsáveis, prazo, prioridade, subtarefas, recorrência; menu e ID discreto no fim */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {assignees && assignees.length > 0 && (
          <AssigneeStack assignees={assignees} primaryId={card.assignee_id} size="sm" max={3} ringClassName="ring-card" />
        )}
        {card.due_date && (
          <span className={cn(CHIP, "tabular-nums", dueTone)} title={formatDateBR(card.due_date)}>
            <Calendar className="h-3 w-3" />
            {relativeDueBR(card.due_date, today)}
          </span>
        )}
        {pf && (
          <span className={cn(CHIP, pf.chip)}>
            <Flag className="h-3 w-3 fill-current" />
            {pf.label}
          </span>
        )}
        {subs.length > 0 && (
          <button
            type="button"
            onPointerDown={stop}
            onClick={(e) => { stop(e); setOpenSubs((v) => !v); }}
            aria-expanded={openSubs}
            aria-label={`Subtarefas: ${doneCount} de ${subs.length} concluídas`}
            className={cn(CHIP, "hover:text-foreground", doneCount === subs.length && "border-success/30 text-success")}
          >
            <ListChecks className="h-3 w-3" />
            {doneCount}/{subs.length}
            <ChevronDown className={cn("h-3 w-3 transition-transform", !openSubs && "-rotate-90")} />
          </button>
        )}
        {recLabel && (
          <span className={CHIP} title="Tarefa recorrente">
            <Repeat className="h-3 w-3" />
            {recLabel}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {menu}
          <span className="font-mono text-[10px] text-muted-foreground/50">{card.short_id}</span>
        </span>
      </div>

      {subs.length > 0 && openSubs && (
        <div className="mt-2 border-t border-border pt-2 pl-6">
          <ul className="space-y-1">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[12px]">
                <span onPointerDown={stop} onClick={stop} className="inline-flex">
                  <Checkbox
                    checked={s.done}
                    onCheckedChange={(v) => onToggleSubitem?.(s.id, !!v)}
                    className="h-3.5 w-3.5"
                  />
                </span>
                <span className={cn("truncate", s.done && "line-through text-muted-foreground")}>{s.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


