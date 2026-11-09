import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Trash2, Plus, X, Check, ChevronDown, ChevronRight, Send, MoreHorizontal, Lock, ExternalLink, Flag, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { cn, formatDateBR, formatDateTimeBR } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProfiles } from "@/hooks/use-profiles";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { AssigneesPicker } from "./AssigneesPicker";
import { AssigneeStack } from "./AssigneeStack";
import { MentionTextarea } from "./MentionTextarea";
import { parseMentions, extractMentionUserIds } from "@/lib/mentions";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority";
import { deleteCard } from "@/lib/card-actions";
import { useCompleteGuard } from "./useCompleteGuard";


type Recurrence = {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly" | "weekdays";
  interval: number;
  days?: number[]; // 0=Dom..6=Sáb (apenas quando frequency='weekdays')
};
type Card = {
  id: string; board_id: string; column_id: string; short_id: string; title: string;
  description: unknown; assignee_id: string | null;
  squad_id: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  start_date: string | null; end_date: string | null; due_date: string | null;
  completed_at: string | null; created_at: string;
  visible_in_calendar: boolean;
  recurrence: Recurrence | null;
  recurrence_template_id: string | null;
};
type SquadLite = { id: string; name: string; color: string };
type Profile = { id: string; full_name: string | null; email: string | null };
type Tag = { id: string; name: string; color: string };
type Sub = { id: string; title: string; done: boolean; position: number; assignee_id: string | null; due_date: string | null; description: string | null; blocks_parent: boolean; promoted_card_id: string | null; promoted_board_id: string | null };
type Comment = { id: string; body: string; author_id: string; created_at: string };
type Activity = { id: string; action: string; field: string | null; old_value: unknown; new_value: unknown; created_at: string; actor_id: string | null };
type Field = { id: string; name: string; type: "text" | "link" | "select" | "product"; options: { values?: string[] } | null; board_id: string | null };
type ProductOpt = { id: string; name: string };
type FieldValue = { field_id: string; value: string | null };
type BoardLite = { id: string; name: string; color: string };

export function CardDetailSheet({ cardId, onClose, onChanged }: { cardId: string; onClose: () => void; onChanged: () => void }) {
  const { user, isAdmin, canEditTab } = useAuth();
  const canEdit = canEditTab("boards");
  const navigate = useNavigate();
  const { data: sharedProfiles = [] } = useProfiles();
  const { confirmComplete, completeGuardDialog } = useCompleteGuard();
  const [card, setCard] = useState<Card | null>(null);
  const [boardColumns, setBoardColumns] = useState<Array<{ id: string; name: string; color: string; is_done_column: boolean }>>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [cardTagIds, setCardTagIds] = useState<Set<string>>(new Set());
  const [subs, setSubs] = useState<Sub[]>([]);
  const [newSub, setNewSub] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [activity, setActivity] = useState<Activity[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<"all" | "comments" | "events">("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [fields, setFields] = useState<Field[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [availableBoards, setAvailableBoards] = useState<BoardLite[]>([]);
  const [cardAssignees, setCardAssigneesState] = useState<string[]>([]);
  const [subAssignees, setSubAssigneesState] = useState<Record<string, string[]>>({});
  const [squads, setSquads] = useState<SquadLite[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const profiles: Profile[] = sharedProfiles;

  // onClose via ref: mantém `load` estável mesmo se o pai recriar o callback a cada
  // render — senão o efeito de load re-dispara e sobrescreve edições em andamento.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const load = useCallback(async () => {
    const { data: c, error: cardErr } = await supabase.from("cards").select("*").eq("id", cardId).maybeSingle();
    if (cardErr) {
      toast.error("Erro ao carregar o card. Verifique a conexão.");
      return;
    }
    if (!c) { onCloseRef.current(); return; }
    const cardData = c as Card;
    setCard(cardData);
    const [t, ct, s, cm, ac, f, fv, bc, ab, ca, sq, pr] = await Promise.all([
      supabase.from("tags").select("*"),
      supabase.from("card_tags").select("tag_id").eq("card_id", cardId),
      supabase.from("card_subitems").select("*").eq("card_id", cardId).order("position"),
      supabase.from("card_comments").select("*").eq("card_id", cardId).order("created_at").range(0, 199),
      supabase.from("card_activity").select("*").eq("card_id", cardId).order("created_at", { ascending: false }).limit(500),
      supabase.from("custom_fields").select("*").or(`board_id.is.null,board_id.eq.${cardData.board_id}`).order("position"),
      supabase.from("card_field_values").select("field_id,value").eq("card_id", cardId),
      supabase.from("board_columns").select("id,name,color,is_done_column").eq("board_id", cardData.board_id).order("position"),
      supabase.from("boards").select("id,name,color").neq("id", cardData.board_id).order("name"),
      supabase.from("card_assignees" as never).select("user_id").eq("card_id", cardId),
      supabase.from("squads").select("id,name,color").order("name"),
      supabase.from("products").select("id,name").order("name"),
    ]);
    setAllTags((t.data ?? []) as Tag[]);
    setCardTagIds(new Set(((ct.data ?? []) as Array<{ tag_id: string }>).map((x) => x.tag_id)));
    const subList = (s.data ?? []) as Sub[];
    setSubs(subList);
    setComments((cm.data ?? []) as Comment[]);
    setActivity((ac.data ?? []) as Activity[]);
    setFields((f.data ?? []) as Field[]);
    const fvMap: Record<string, string> = {};
    for (const r of (fv.data ?? []) as FieldValue[]) fvMap[r.field_id] = r.value ?? "";
    setFieldValues(fvMap);
    setBoardColumns((bc.data ?? []) as Array<{ id: string; name: string; color: string; is_done_column: boolean }>);
    setAvailableBoards((ab.data ?? []) as BoardLite[]);
    setCardAssigneesState(((ca.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
    setSquads((sq.data ?? []) as SquadLite[]);
    setProducts((pr.data ?? []) as ProductOpt[]);
    
    if (subList.length) {
      const subIds = subList.map((x) => x.id);
      const { data: sa } = await supabase.from("card_subitem_assignees" as never)
        .select("subitem_id,user_id").in("subitem_id", subIds);
      const map: Record<string, string[]> = {};
      for (const r of (sa ?? []) as Array<{ subitem_id: string; user_id: string }>) {
        (map[r.subitem_id] ??= []).push(r.user_id);
      }
      setSubAssigneesState(map);
    } else {
      setSubAssigneesState({});
    }
  }, [cardId]);

  useEffect(() => { load(); }, [load]);

  // Marca notificações deste card como lidas ao abrir
  useEffect(() => {
    void supabase.rpc("mark_card_notifications_read" as never, { _card_id: cardId } as never);
  }, [cardId]);

  // Realtime: comentários do card
  useEffect(() => {
    const ch = supabase
      .channel(`card-${cardId}-comments`)
      .on("postgres_changes", { event: "*", schema: "public", table: "card_comments", filter: `card_id=eq.${cardId}` }, (p) => {
        const ev = p as unknown as { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Comment; old: Comment };
        if (ev.eventType === "INSERT") {
          setComments((prev) => prev.some((c) => c.id === ev.new.id) ? prev : [...prev, ev.new]);
        } else if (ev.eventType === "UPDATE") {
          setComments((prev) => prev.map((c) => c.id === ev.new.id ? ev.new : c));
        } else if (ev.eventType === "DELETE") {
          setComments((prev) => prev.filter((c) => c.id !== ev.old.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cardId]);

  // Realtime: histórico de edições
  useEffect(() => {
    const ch = supabase
      .channel(`card-${cardId}-activity`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "card_activity", filter: `card_id=eq.${cardId}` }, (p) => {
        const ev = p as unknown as { new: Activity };
        setActivity((prev) => prev.some((a) => a.id === ev.new.id) ? prev : [ev.new, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cardId]);

  // Auto-scroll do chat ao receber mensagem
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [comments.length, activity.length]);


  const update = async (patch: Partial<Card>) => {
    if (!card) return;
    setCard({ ...card, ...patch });
    const { error } = await supabase.from("cards").update(patch as never).eq("id", card.id);
    if (error) { toast.error(error.message); load(); } else { onChanged(); }
  };

  const setCardAssigneesList = async (next: string[]) => {
    const prev = cardAssignees;
    const added = next.filter((x) => !prev.includes(x));
    const removed = prev.filter((x) => !next.includes(x));
    setCardAssigneesState(next);
    const ops: Promise<{ error: { message: string } | null }>[] = [];
    if (added.length) {
      ops.push(supabase.from("card_assignees" as never).insert(added.map((user_id) => ({ card_id: cardId, user_id })) as never) as never);
    }
    for (const uid of removed) {
      ops.push(supabase.from("card_assignees" as never).delete().eq("card_id", cardId).eq("user_id", uid) as never);
    }
    const results = await Promise.all(ops);
    const err = results.find((r) => r.error)?.error;
    if (err) { toast.error(err.message); load(); return; }
    // Trigger no banco ajusta cards.assignee_id; realtime do Kanban refletirá.
    onChanged();
  };

  const setCardPrimary = async (uid: string | null) => {
    if (!card) return;
    if (uid && !cardAssignees.includes(uid)) {
      // garante que está na lista
      await setCardAssigneesList([...cardAssignees, uid]);
    }
    await update({ assignee_id: uid });
  };

  const setSubAssigneesList = async (subId: string, next: string[]) => {
    const prev = subAssignees[subId] ?? [];
    const added = next.filter((x) => !prev.includes(x));
    const removed = prev.filter((x) => !next.includes(x));
    setSubAssigneesState((m) => ({ ...m, [subId]: next }));
    const ops: Promise<{ error: { message: string } | null }>[] = [];
    if (added.length) {
      ops.push(supabase.from("card_subitem_assignees" as never).insert(added.map((user_id) => ({ subitem_id: subId, user_id })) as never) as never);
    }
    for (const uid of removed) {
      ops.push(supabase.from("card_subitem_assignees" as never).delete().eq("subitem_id", subId).eq("user_id", uid) as never);
    }
    const results = await Promise.all(ops);
    const err = results.find((r) => r.error)?.error;
    if (err) { toast.error(err.message); load(); return; }
    const { data: s } = await supabase.from("card_subitems").select("assignee_id").eq("id", subId).maybeSingle();
    if (s) setSubs((prevSubs) => prevSubs.map((x) => x.id === subId ? { ...x, assignee_id: (s as { assignee_id: string | null }).assignee_id } : x));
  };

  const setSubPrimary = async (subId: string, uid: string | null) => {
    const list = subAssignees[subId] ?? [];
    if (uid && !list.includes(uid)) {
      await setSubAssigneesList(subId, [...list, uid]);
    }
    await supabase.from("card_subitems").update({ assignee_id: uid } as never).eq("id", subId);
    setSubs((prev) => prev.map((x) => x.id === subId ? { ...x, assignee_id: uid } : x));
  };


  // Subtarefas em aberto: o aviso pergunta se marca todas antes de concluir (inclusive as obrigatórias)
  const confirmAndMarkSubs = async () => {
    if (!card || !(await confirmComplete(card.id))) return false;
    setSubs((prev) => prev.map((x) => ({ ...x, done: true })));
    return true;
  };

  const tryComplete = async () => {
    if (!card) return;
    const { data: cols } = await supabase.from("board_columns").select("id").eq("board_id", card.board_id).eq("is_done_column", true).order("position").limit(1);
    const doneCol = (cols as Array<{ id: string }> | null)?.[0];
    if (!doneCol) { toast.error("Nenhuma coluna de conclusão configurada"); return; }
    if (!(await confirmAndMarkSubs())) return;
    await update({ column_id: doneCol.id });
  };

  // Trocar a etapa para uma coluna de concluídos também conclui: mesmo aviso
  const changeColumn = async (columnId: string) => {
    if (!card) return;
    const to = boardColumns.find((b) => b.id === columnId);
    const from = boardColumns.find((b) => b.id === card.column_id);
    if (to?.is_done_column && !from?.is_done_column && !(await confirmAndMarkSubs())) return;
    await update({ column_id: columnId });
  };

  const toggleTag = async (tagId: string) => {
    const had = cardTagIds.has(tagId);
    setCardTagIds((prev) => {
      const next = new Set(prev);
      if (had) next.delete(tagId); else next.add(tagId);
      return next;
    });
    const { error } = had
      ? await supabase.from("card_tags").delete().eq("card_id", cardId).eq("tag_id", tagId)
      : await supabase.from("card_tags").insert({ card_id: cardId, tag_id: tagId } as never);
    if (error) {
      toast.error(error.message);
      setCardTagIds((prev) => {
        const next = new Set(prev);
        if (had) next.add(tagId); else next.delete(tagId);
        return next;
      });
    } else {
      onChanged();
    }
  };

  const addSub = async () => {
    const title = newSub.trim();
    if (!title) return;
    setNewSub("");
    const { data, error } = await supabase
      .from("card_subitems")
      .insert({ card_id: cardId, title, position: subs.length } as never)
      .select("*")
      .single();
    if (error) { toast.error(error.message); setNewSub(title); return; }
    setSubs((prev) => [...prev, data as Sub]);
    onChanged();
  };
  const toggleSub = async (s: Sub) => {
    const next = !s.done;
    setSubs((prev) => prev.map((x) => x.id === s.id ? { ...x, done: next } : x));
    const { error } = await supabase.from("card_subitems").update({ done: next } as never).eq("id", s.id);
    if (error) { toast.error(error.message); setSubs((prev) => prev.map((x) => x.id === s.id ? { ...x, done: s.done } : x)); }
    else onChanged();
  };
  const updateSub = async (id: string, patch: Partial<Sub>) => {
    setSubs((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
    const { error } = await supabase.from("card_subitems").update(patch as never).eq("id", id);
    if (error) { toast.error(error.message); load(); }
  };
  const removeSub = async (id: string) => {
    const prevSubs = subs;
    setSubs((p) => p.filter((s) => s.id !== id));
    const { error } = await supabase.from("card_subitems").delete().eq("id", id);
    if (error) { toast.error(error.message); setSubs(prevSubs); } else onChanged();
  };

  const addComment = async () => {
    if (!newComment.trim() || !user) return;
    const body = newComment;
    setNewComment("");
    const { data: ins, error } = await supabase
      .from("card_comments")
      .insert({ card_id: cardId, author_id: user.id, body } as never)
      .select("id")
      .single();
    if (error || !ins) { toast.error(error?.message ?? "Falha ao comentar"); setNewComment(body); return; }
    const commentId = (ins as { id: string }).id;
    const mentions = extractMentionUserIds(body);
    if (mentions.length > 0) {
      const rows = mentions.map((uid) => ({ comment_id: commentId, user_id: uid }));
      await supabase.from("card_comment_mentions" as never).insert(rows as never);
    }
    // Realtime handler will append the inserted row
  };

  const setFieldValue = async (fieldId: string, value: string) => {
    setFieldValues({ ...fieldValues, [fieldId]: value });
    await supabase.from("card_field_values").upsert({ card_id: cardId, field_id: fieldId, value } as never, { onConflict: "card_id,field_id" } as never);
  };

  const promoteSub = async (sub: Sub, targetBoardId: string) => {
    if (sub.promoted_card_id) { toast.error("Já promovida"); return; }
    if (targetBoardId === card?.board_id) { toast.error("Escolha uma esteira diferente"); return; }
    const { data: cols } = await supabase.from("board_columns")
      .select("id").eq("board_id", targetBoardId).eq("is_done_column", false)
      .order("position").limit(1);
    const firstCol = (cols as { id: string }[] | null)?.[0];
    if (!firstCol) { toast.error("Esteira destino sem coluna pendente"); return; }
    const { data: ins, error: insErr } = await supabase.from("cards").insert({
      board_id: targetBoardId,
      column_id: firstCol.id,
      title: sub.title,
      assignee_id: sub.assignee_id,
      due_date: sub.due_date,
      position: 0,
      source_subitem_id: sub.id,
      created_by: user?.id,
    } as never).select("id").single();
    if (insErr || !ins) { toast.error(insErr?.message ?? "Falha ao promover"); return; }
    const newCardId = (ins as { id: string }).id;
    const { error: updErr } = await supabase.from("card_subitems")
      .update({ promoted_card_id: newCardId, promoted_board_id: targetBoardId } as never)
      .eq("id", sub.id);
    if (updErr) { toast.error(updErr.message); return; }
    setSubs((prev) => prev.map((x) => x.id === sub.id ? { ...x, promoted_card_id: newCardId, promoted_board_id: targetBoardId } : x));
    toast.success("Subtarefa promovida para esteira");
  };

  const unpromoteSub = async (sub: Sub) => {
    if (!sub.promoted_card_id) return;
    if (!window.confirm("Desvincular esta subtarefa do card promovido? O card permanecerá na outra esteira.")) return;
    await supabase.from("cards").update({ source_subitem_id: null } as never).eq("id", sub.promoted_card_id);
    const { error } = await supabase.from("card_subitems")
      .update({ promoted_card_id: null, promoted_board_id: null } as never).eq("id", sub.id);
    if (error) { toast.error(error.message); return; }
    setSubs((prev) => prev.map((x) => x.id === sub.id ? { ...x, promoted_card_id: null, promoted_board_id: null } : x));
    toast.success("Desvinculada");
  };

  const toggleBlocksParent = async (sub: Sub) => {
    const next = !sub.blocks_parent;
    setSubs((prev) => prev.map((x) => x.id === sub.id ? { ...x, blocks_parent: next } : x));
    const { error } = await supabase.from("card_subitems").update({ blocks_parent: next } as never).eq("id", sub.id);
    if (error) { toast.error(error.message); setSubs((prev) => prev.map((x) => x.id === sub.id ? { ...x, blocks_parent: sub.blocks_parent } : x)); }
  };

  if (!card) return null;

  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const initials = (name?: string | null, email?: string | null) => {
    const s = (name || email || "?").trim();
    const parts = s.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || s[0].toUpperCase();
  };

  const nameForUser = (id: unknown): string => {
    if (typeof id !== "string" || !id) return "—";
    const p = profilesById.get(id);
    return p?.full_name || p?.email || "Usuário";
  };
  const nameForColumn = (id: unknown): string => {
    if (typeof id !== "string" || !id) return "—";
    return boardColumns.find((c) => c.id === id)?.name ?? "—";
  };
  const nameForSquad = (id: unknown): string => {
    if (typeof id !== "string" || !id) return "—";
    return squads.find((s) => s.id === id)?.name ?? "—";
  };
  const priorityLabel = (v: unknown): string => {
    const map: Record<string, string> = { low: "baixa", medium: "média", high: "alta", urgent: "urgente" };
    return typeof v === "string" ? (map[v] ?? v) : "—";
  };
  const asText = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string") return v || "—";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v);
  };
  const formatDateVal = (v: unknown): string => {
    if (typeof v !== "string" || !v) return "—";
    return formatDateBR(v);
  };
  const describeActivity = (a: Activity): string => {
    const actor = a.actor_id ? nameForUser(a.actor_id) : "Sistema";
    switch (a.action) {
      case "created": return `${actor} criou o card`;
      case "moved": return `${actor} moveu de "${nameForColumn(a.old_value)}" para "${nameForColumn(a.new_value)}"`;
      case "assigned": return `${actor} alterou responsável: ${nameForUser(a.old_value)} → ${nameForUser(a.new_value)}`;
      case "assignee_added": return `${actor} adicionou responsável: ${nameForUser(a.new_value)}`;
      case "assignee_removed": return `${actor} removeu responsável: ${nameForUser(a.old_value)}`;
      case "priority_changed": return `${actor} mudou prioridade: ${priorityLabel(a.old_value)} → ${priorityLabel(a.new_value)}`;
      case "due_changed": return `${actor} alterou prazo: ${formatDateVal(a.old_value)} → ${formatDateVal(a.new_value)}`;
      case "title_changed": return `${actor} renomeou para "${asText(a.new_value)}"`;
      case "description_changed": return `${actor} atualizou a descrição`;
      case "squad_changed": return `${actor} alterou squad: ${nameForSquad(a.old_value)} → ${nameForSquad(a.new_value)}`;
      case "completed": return `${actor} concluiu o card`;
      case "reopened": return `${actor} reabriu o card`;
      case "tag_added": return `${actor} adicionou tag "${asText(a.new_value)}"`;
      case "tag_removed": return `${actor} removeu tag "${asText(a.old_value)}"`;
      case "custom_field_changed": {
        const label = a.field ?? "campo";
        if (a.old_value == null) return `${actor} definiu "${label}": ${asText(a.new_value)}`;
        if (a.new_value == null) return `${actor} limpou "${label}"`;
        return `${actor} alterou "${label}": ${asText(a.old_value)} → ${asText(a.new_value)}`;
      }
      case "subitem_added": return `${actor} adicionou subtarefa "${asText(a.new_value)}"`;
      case "subitem_removed": return `${actor} removeu subtarefa "${asText(a.old_value)}"`;
      case "subitem_renamed": return `${actor} renomeou subtarefa "${asText(a.old_value)}" → "${asText(a.new_value)}"`;
      case "subitem_completed": return `${actor} concluiu subtarefa "${asText(a.new_value)}"`;
      case "subitem_reopened": return `${actor} reabriu subtarefa "${asText(a.new_value)}"`;
      case "mention_added": return `${actor} mencionou ${nameForUser(a.new_value)}`;
      default: return `${actor} ${a.action}${a.field ? ` (${a.field})` : ""}`;
    }
  };

  type TimelineItem =
    | { kind: "comment"; id: string; created_at: string; comment: Comment }
    | { kind: "event"; id: string; created_at: string; activity: Activity };
  type TimelineEvent = Extract<TimelineItem, { kind: "event" }>;
  type TimelineEntry = TimelineItem | { kind: "event_group"; id: string; events: TimelineEvent[] };
  const timeline: TimelineItem[] = [
    ...(timelineFilter !== "events"
      ? comments.map<TimelineItem>((c) => ({ kind: "comment", id: `c-${c.id}`, created_at: c.created_at, comment: c }))
      : []),
    ...(timelineFilter !== "comments"
      ? activity.map<TimelineItem>((a) => ({ kind: "event", id: `a-${a.id}`, created_at: a.created_at, activity: a }))
      : []),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // No modo "Tudo", atualizações consecutivas viram um grupo recolhível para
  // não poluir o chat. O id do grupo é o do primeiro evento (estável).
  const groupedTimeline: TimelineEntry[] = [];
  if (timelineFilter === "all") {
    for (const item of timeline) {
      const last = groupedTimeline[groupedTimeline.length - 1];
      if (item.kind === "event" && last?.kind === "event_group") {
        last.events.push(item);
      } else if (item.kind === "event" && last?.kind === "event") {
        groupedTimeline[groupedTimeline.length - 1] = { kind: "event_group", id: `g-${last.id}`, events: [last, item] };
      } else {
        groupedTimeline.push(item);
      }
    }
  } else {
    groupedTimeline.push(...timeline);
  }



  return (
    <>
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[92vh] p-0 overflow-hidden">
        {/* minmax(0,…) e min-w-0: um link comprido (descrição, comentário, histórico) não pode
            alargar a grade e empurrar o painel de comentários para fora da tela */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] h-full min-h-0 min-w-0">
          <div className="overflow-y-auto p-6 min-h-0 min-w-0">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{card.short_id}</span>
            {card.completed_at && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" />Concluído</span>}
          </div>
          <DialogTitle asChild>
            <Input value={card.title} onChange={(e) => setCard({ ...card, title: e.target.value })}
              onBlur={(e) => update({ title: e.target.value })}
              disabled={!canEdit}
              className="text-lg font-semibold border-0 px-0 focus-visible:ring-0" />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div>
            <Label className="text-xs mb-1 block">Etapa do Kanban</Label>
            <Select value={card.column_id} onValueChange={changeColumn} disabled={!canEdit}>
              <SelectTrigger>
                <SelectValue>
                  {(() => {
                    const cur = boardColumns.find((b) => b.id === card.column_id);
                    return cur ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cur.color }} />
                        {cur.name}
                      </span>
                    ) : null;
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {boardColumns.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                      {b.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Responsáveis</Label>
              <AssigneesPicker
                value={cardAssignees}
                primaryId={card.assignee_id}
                onChange={setCardAssigneesList}
                onSetPrimary={setCardPrimary}
                disabled={!canEdit || !!card.squad_id}
              />
              {card.squad_id && (
                <p className="text-[10px] text-muted-foreground mt-1">Card atribuído a um squad — remova o squad para atribuir a pessoas.</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select value={card.priority} onValueChange={(v) => update({ priority: v as Card["priority"] })} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* Bandeira sempre preenchida, na cor da prioridade (src/lib/priority.ts) */}
                  {PRIORITY_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="inline-flex items-center gap-2">
                        <Flag className={cn("h-3.5 w-3.5 fill-current", PRIORITY_META[p].flag)} />
                        {PRIORITY_META[p].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Squad (grupo responsável)</Label>
              <Select
                value={card.squad_id ?? "none"}
                onValueChange={async (v) => {
                  const nextSquad = v === "none" ? null : v;
                  const patch: Partial<Card> = { squad_id: nextSquad };
                  // Ao atribuir a um squad, limpa o responsável principal individual
                  if (nextSquad) patch.assignee_id = null;
                  await update(patch);
                }}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem squad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem squad</SelectItem>
                  {squads.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Início</Label>
              <Input type="date" value={card.start_date ?? ""} onChange={(e) => update({ start_date: e.target.value || null })} disabled={!canEdit} />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input type="date" value={card.end_date ?? ""} onChange={(e) => update({ end_date: e.target.value || null })} disabled={!canEdit} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Vencimento</Label>
              <Input type="date" value={card.due_date ?? ""} onChange={(e) => update({ due_date: e.target.value || null })} disabled={!canEdit} />
            </div>
            <div className="col-span-2 flex items-center gap-2 rounded-md border px-3 py-2">
              <Checkbox
                id="visible-cal"
                checked={card.visible_in_calendar}
                onCheckedChange={(v) => canEdit && update({ visible_in_calendar: !!v })}
                disabled={!canEdit}
              />
              <Label htmlFor="visible-cal" className="text-sm font-normal cursor-pointer flex-1">
                Visível no calendário
                <span className="block text-xs text-muted-foreground font-normal">Requer data de início e fim preenchidas.</span>
              </Label>
            </div>
            <div className="col-span-2">
              <RecurrenceBlock card={card} canEdit={canEdit} onUpdate={update} />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-2 block">Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((t) => {
                const on = cardTagIds.has(t.id);
                return (
                  <button key={t.id} onClick={() => canEdit && toggleTag(t.id)} disabled={!canEdit}
                    className={cn("tint rounded-full bg-(--tint-pill) px-2 py-0.5 text-xs text-(--tint-ink) transition-opacity", !on && "opacity-40")}
                    style={{ "--tint": t.color } as React.CSSProperties}>
                    {t.name}
                  </button>
                );
              })}
              {allTags.length === 0 && <span className="text-xs text-muted-foreground">Crie tags em Configurações.</span>}
            </div>
          </div>

          {/* O tiptap injeta ".ProseMirror { word-wrap: break-word }" fora de camada, que vence as
              classes do Tailwind: só o "!" força o "anywhere". O min-w-0 segura a largura do painel */}
          <div className="min-w-0 [&_.ProseMirror]:wrap-anywhere!">
            <Label className="text-xs mb-2 block">Descrição</Label>
            <DescriptionField cardId={card.id} value={card.description} onSave={(v) => update({ description: v as never })} />
          </div>


          {fields.length > 0 && (
            <div>
              <Label className="text-xs mb-2 block">Campos personalizados</Label>
              <div className="space-y-2">
                {fields.map((f) => (
                  <div key={f.id}>
                    <div className="text-xs text-muted-foreground mb-1">{f.name}</div>
                    {f.type === "select" ? (
                      <Select value={fieldValues[f.id] ?? ""} onValueChange={(v) => setFieldValue(f.id, v)} disabled={!canEdit}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {(f.options?.values ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : f.type === "product" ? (
                      <Select value={fieldValues[f.id] ?? ""} onValueChange={(v) => setFieldValue(f.id, v)} disabled={!canEdit}>
                        <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input type={f.type === "link" ? "url" : "text"} value={fieldValues[f.id] ?? ""}
                        onChange={(e) => setFieldValues({ ...fieldValues, [f.id]: e.target.value })}
                        onBlur={(e) => setFieldValue(f.id, e.target.value)} disabled={!canEdit} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs mb-2 block">Subtarefas</Label>
            <div className="space-y-2">
              {subs.map((s) => (
                <SubtaskItem
                  key={s.id}
                  sub={s}
                  profiles={profiles}
                  canEdit={canEdit}
                  availableBoards={availableBoards}
                  assignees={subAssignees[s.id] ?? []}
                  onAssigneesChange={(next) => setSubAssigneesList(s.id, next)}
                  onSetPrimary={(uid) => setSubPrimary(s.id, uid)}
                  onToggle={() => toggleSub(s)}
                  onUpdate={(patch) => updateSub(s.id, patch)}
                  onRemove={() => removeSub(s.id)}
                  onPromote={(boardId) => promoteSub(s, boardId)}
                  onUnpromote={() => unpromoteSub(s)}
                  onToggleBlocks={() => toggleBlocksParent(s)}
                  onOpenPromoted={(bId, cId) => {
                    onClose();
                    navigate({ to: "/boards/$boardId", params: { boardId: bId }, search: { card: cId } });
                  }}
                />
              ))}
              {canEdit && (
                <div className="flex gap-2 pt-1">
                  <Input placeholder="Nova subtarefa" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} />
                  <Button size="sm" onClick={addSub}><Plus className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          </div>


          {/* Comentários e histórico foram unificados no painel lateral */}


          <div className="flex justify-between border-t pt-4">
            <div className="text-xs text-muted-foreground">Criado em {formatDateTimeBR(card.created_at)}</div>
            <div className="flex gap-2">
              {!card.completed_at && canEdit && (
                <Button size="sm" variant="outline" onClick={tryComplete}><Check className="h-4 w-4" /> Finalizar</Button>
              )}
              {isAdmin && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir card?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. O card e todos seus comentários, subtarefas e dependências serão removidos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive-strong text-destructive-foreground hover:bg-destructive-strong/90"
                      onClick={async () => {
                        const error = await deleteCard(cardId);
                        if (error) { toast.error(error); return; }
                        setConfirmDelete(false);
                        onChanged(); onClose();
                      }}
                    >Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
        {/* close left column */}
        </div>

        {/* Chat sidebar — Comentários + histórico */}
        <div className="border-t lg:border-t-0 lg:border-l bg-muted/20 flex flex-col h-full min-h-0 min-w-0 lg:min-w-[320px]">
          <div className="px-4 py-3 border-b bg-muted/40 backdrop-blur shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Comentários</h3>
              <p className="text-[11px] text-muted-foreground">
                {comments.length} msg · {activity.length} edições
              </p>
            </div>
            <div className="flex gap-1">
              {(["all", "comments", "events"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setTimelineFilter(v)}
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                    timelineFilter === v
                      ? "bg-primary-strong text-primary-foreground border-primary-strong hover:bg-primary-strong/90"
                      : "bg-transparent text-muted-foreground hover:bg-accent",
                  )}
                >
                  {v === "all" ? "Tudo" : v === "comments" ? "Comentários" : "Edições"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 min-h-0 min-w-0">
            {groupedTimeline.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">Nada por aqui ainda.</div>
            )}
            {groupedTimeline.map((item) => {
              if (item.kind === "comment") {
                const c = item.comment;
                const author = profilesById.get(c.author_id);
                const isMe = c.author_id === user?.id;
                const name = author?.full_name ?? author?.email ?? "Usuário";
                return (
                  <div key={item.id} className={cn("flex gap-2", isMe && "flex-row-reverse")}>
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="text-[10px]">{initials(author?.full_name, author?.email)}</AvatarFallback>
                    </Avatar>
                    <div className={cn("flex flex-col gap-0.5 max-w-[80%] min-w-0", isMe && "items-end")}>
                      <div className="text-[11px] text-muted-foreground flex min-w-0 max-w-full items-center gap-1.5">
                        <span className="min-w-0 truncate font-medium text-foreground">{isMe ? "Você" : name}</span>
                        <span>·</span>
                        <span className="shrink-0">{formatDateTimeBR(c.created_at)}</span>
                      </div>
                      <div className={cn(
                        "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere max-w-full min-w-0",
                        isMe ? "bg-primary-strong text-primary-foreground rounded-tr-sm" : "bg-card border rounded-tl-sm",
                      )}>
                        {parseMentions(c.body).map((part, i) =>
                          part.type === "mention" ? (
                            <span
                              key={i}
                              className={cn(
                                "inline-flex items-center rounded px-1 py-0.5 mx-0.5 text-xs font-medium",
                                isMe ? "bg-primary-foreground/20" : "bg-primary/15 text-primary",
                              )}
                            >
                              @{part.name}
                            </span>
                          ) : (
                            <span key={i}>
                              {linkify(part.text, isMe
                                ? "underline underline-offset-2 hover:opacity-80"
                                : "text-primary underline underline-offset-2 hover:opacity-80")}
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              if (item.kind === "event_group") {
                const g = item;
                const expanded = expandedGroups.has(g.id);
                const lastEvent = g.events[g.events.length - 1];
                return (
                  <div key={g.id} className="space-y-1.5">
                    <div className="flex justify-center">
                      <button
                        onClick={() => setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                          return next;
                        })}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground px-2 py-1 rounded-md bg-muted/40 border border-dashed hover:bg-muted/70 hover:text-foreground transition-colors"
                      >
                        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {g.events.length} atualizações
                        <span className="opacity-60">·</span>
                        <span className="tabular-nums opacity-70">{formatDateTimeBR(lastEvent.created_at)}</span>
                      </button>
                    </div>
                    {expanded && g.events.map((ev) => (
                      <div key={ev.id} className="flex justify-center">
                        <div className="text-[11px] text-muted-foreground text-center max-w-[90%] min-w-0 wrap-anywhere px-2 py-1 rounded-md bg-muted/40 border border-dashed">
                          {describeActivity(ev.activity)}
                          <span className="mx-1 opacity-60">·</span>
                          <span className="tabular-nums opacity-70">{formatDateTimeBR(ev.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
              const a = item.activity;
              return (
                <div key={item.id} className="flex justify-center">
                  <div className="text-[11px] text-muted-foreground text-center max-w-[90%] min-w-0 wrap-anywhere px-2 py-1 rounded-md bg-muted/40 border border-dashed">
                    {describeActivity(a)}
                    <span className="mx-1 opacity-60">·</span>
                    <span className="tabular-nums opacity-70">{formatDateTimeBR(a.created_at)}</span>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t p-2 flex gap-2 items-end shrink-0">
            <MentionTextarea
              value={newComment}
              onChange={setNewComment}
              onSubmit={addComment}
              placeholder="Escreva uma mensagem... (use @ para mencionar)"
            />
            <Button size="icon" onClick={addComment} disabled={!newComment.trim()} aria-label="Enviar comentário">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>


        </div>
      </DialogContent>
    </Dialog>
    {completeGuardDialog}
    </>
  );
}

function SubtaskItem({
  sub, profiles, canEdit, availableBoards, assignees, onAssigneesChange, onSetPrimary,
  onToggle, onUpdate, onRemove, onPromote, onUnpromote, onToggleBlocks, onOpenPromoted,
}: {
  sub: Sub;
  profiles: Profile[];
  canEdit: boolean;
  availableBoards: BoardLite[];
  assignees: string[];
  onAssigneesChange: (next: string[]) => void;
  onSetPrimary: (uid: string | null) => void;
  onToggle: () => void;
  onUpdate: (patch: Partial<Sub>) => void;
  onRemove: () => void;
  onPromote: (boardId: string) => void;
  onUnpromote: () => void;
  onToggleBlocks: () => void;
  onOpenPromoted: (boardId: string, cardId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(sub.title);
  useEffect(() => { setTitle(sub.title); }, [sub.title]);
  const promotedBoard = sub.promoted_board_id
    ? availableBoards.find((b) => b.id === sub.promoted_board_id)
    : null;
  const openPromotedCard = () => {
    if (sub.promoted_card_id && sub.promoted_board_id) {
      onOpenPromoted(sub.promoted_board_id, sub.promoted_card_id);
    }
  };
  const hasMeta = !!promotedBoard || !!sub.due_date;
  return (
    <div className={cn("rounded-md border bg-card/40", sub.blocks_parent && !sub.done && "border-warning/40")}>
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
        <Checkbox checked={sub.done} onCheckedChange={() => canEdit && onToggle()} disabled={!canEdit} className="shrink-0" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={open ? "Recolher" : "Expandir"}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== sub.title && onUpdate({ title })}
          disabled={!canEdit}
          className={cn("flex-1 min-w-0 bg-transparent outline-none text-sm", sub.done && "line-through text-muted-foreground")}
        />
        {sub.blocks_parent && (
          <Lock className={cn("h-3 w-3 shrink-0", sub.done ? "text-muted-foreground" : "text-warning")} aria-label="Obrigatória para concluir a mãe" />
        )}
        {assignees.length > 0 && (
          <AssigneeStack
            assignees={assignees.map((id) => ({ id, name: (profiles.find((p) => p.id === id)?.full_name ?? profiles.find((p) => p.id === id)?.email ?? "?").trim() }))}
            primaryId={sub.assignee_id}
            size="xs"
            max={3}
            ringClassName="ring-popover"
          />
        )}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuCheckboxItem checked={sub.blocks_parent} onCheckedChange={onToggleBlocks}>
                Obrigatória para concluir a mãe
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {sub.promoted_card_id ? (
                <DropdownMenuItem onClick={onUnpromote}>Desvincular da esteira</DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Promover para esteira</DropdownMenuLabel>
                  {availableBoards.length === 0 && (
                    <DropdownMenuItem disabled>Sem outras esteiras</DropdownMenuItem>
                  )}
                  {availableBoards.map((b) => (
                    <DropdownMenuItem key={b.id} onClick={() => onPromote(b.id)}>
                      <span className="h-2 w-2 rounded-[2px] mr-2" style={{ backgroundColor: b.color }} />
                      {b.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRemove} className="text-destructive">
                <X className="h-3 w-3 mr-2" /> Remover subtarefa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {hasMeta && (
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1.5 pl-9 text-[10px] text-muted-foreground">
          {promotedBoard && (
            <button
              type="button"
              onClick={openPromotedCard}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border hover:bg-accent"
              style={{ borderColor: promotedBoard.color, color: promotedBoard.color }}
              title={`Abrir em ${promotedBoard.name}`}
            >
              <ExternalLink className="h-2.5 w-2.5" />
              {promotedBoard.name}
            </button>
          )}
          {sub.due_date && (
            <span className="tabular-nums">📅 {formatDateBR(sub.due_date)}</span>
          )}
        </div>
      )}
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t min-w-0 [&_.ProseMirror]:wrap-anywhere!">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Responsáveis</Label>
              <AssigneesPicker
                value={assignees}
                primaryId={sub.assignee_id}
                onChange={onAssigneesChange}
                onSetPrimary={onSetPrimary}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Vencimento</Label>
              <Input
                type="date"
                value={sub.due_date ?? ""}
                onChange={(e) => onUpdate({ due_date: e.target.value || null })}
                disabled={!canEdit}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Detalhes</Label>
            <RichTextEditor
              key={sub.id}
              value={parseMaybeJson(sub.description)}
              onChange={(v) => onUpdate({ description: v ? JSON.stringify(v) : null })}
              minHeightClass="min-h-[80px]"
              expandTitle={`Detalhes — ${sub.title}`}
              disabled={!canEdit}
              placeholder="Adicione detalhes sobre esta subtarefa..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Links colados no comentário viram clicáveis (só http/https e www., nada de javascript:)
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

function linkify(text: string, linkClass: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    let url = m[0];
    // Pontuação no fim ("veja https://x.com.") fica fora do link; ")" só sai se estiver sobrando
    while (/[.,;:!?\]}'"]$/.test(url) || (url.endsWith(")") && url.split("(").length < url.split(")").length)) {
      url = url.slice(0, -1);
    }
    // Sobrou só o prefixo ("www." solto etc.): fica como texto
    if (!/^(?:https?:\/\/|www\.)\S+$/i.test(url)) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    out.push(
      <a key={m.index} href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {url}
      </a>,
    );
    last = m.index + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function parseMaybeJson(value: string | null | undefined): unknown {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // legacy plain text — wrap as a paragraph doc
    return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] };
  }
  return value;
}

function RecurrenceBlock({
  card, canEdit, onUpdate,
}: {
  card: Card;
  canEdit: boolean;
  onUpdate: (patch: Partial<Card>) => void | Promise<void>;
}) {
  const isChild = !!card.recurrence_template_id;
  const rec: Recurrence = card.recurrence ?? { enabled: false, frequency: "weekly", interval: 1, days: [] };
  const enabled = !!rec.enabled;

  if (isChild) {
    return (
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        🔁 Esta é uma ocorrência de uma tarefa recorrente. As próximas ocorrências usam a configuração
        do card original (não desta cópia).
      </div>
    );
  }

  const setRec = (patch: Partial<Recurrence>) => {
    onUpdate({ recurrence: { ...rec, ...patch } as Recurrence });
  };

  const toggleDay = (d: number) => {
    const cur = new Set(rec.days ?? []);
    if (cur.has(d)) cur.delete(d); else cur.add(d);
    setRec({ days: Array.from(cur).sort() });
  };

  const applyPreset = (preset: "weekdays" | "weekend" | "all") => {
    if (preset === "weekdays") setRec({ frequency: "weekdays", days: [1,2,3,4,5] });
    else if (preset === "weekend") setRec({ frequency: "weekdays", days: [0,6] });
    else setRec({ frequency: "weekdays", days: [0,1,2,3,4,5,6] });
  };

  const dayLabels = ["D","S","T","Q","Q","S","S"];
  const dayFullLabels = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

  return (
    <div className="rounded-md border px-3 py-2 space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox
          checked={enabled}
          onCheckedChange={(v) => canEdit && setRec({ enabled: !!v })}
          disabled={!canEdit}
        />
        <span className="text-sm font-normal flex-1">
          Tarefa recorrente
          <span className="block text-xs text-muted-foreground font-normal">
            Ao concluir, uma nova ocorrência é criada automaticamente.
          </span>
        </span>
      </label>
      {enabled && (
        <div className="pl-6 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Frequência</Label>
              <Select
                value={rec.frequency}
                onValueChange={(v) => setRec({ frequency: v as Recurrence["frequency"] })}
                disabled={!canEdit}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diária</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="weekdays">Dias da semana</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rec.frequency !== "weekdays" && (
              <div>
                <Label className="text-xs">A cada</Label>
                <Input
                  type="number"
                  min={1}
                  value={rec.interval}
                  onChange={(e) => setRec({ interval: Math.max(1, Number(e.target.value) || 1) })}
                  disabled={!canEdit}
                />
              </div>
            )}
          </div>

          {rec.frequency === "weekdays" && (
            <div className="space-y-2">
              <Label className="text-xs">Dias da semana</Label>
              <div className="flex flex-wrap gap-1">
                {dayLabels.map((lbl, i) => {
                  const active = (rec.days ?? []).includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleDay(i)}
                      title={dayFullLabels[i]}
                      aria-pressed={active}
                      className={cn(
                        "h-8 w-8 rounded-md border text-xs font-medium transition-colors",
                        active
                          ? "bg-primary-strong text-primary-foreground border-primary-strong hover:bg-primary-strong/90"
                          : "bg-background hover:bg-muted/40 text-muted-foreground border-border",
                        !canEdit && "opacity-60 cursor-not-allowed",
                      )}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <button type="button" onClick={() => applyPreset("weekdays")}
                    className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-muted/40">
                    Dias úteis
                  </button>
                  <button type="button" onClick={() => applyPreset("weekend")}
                    className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-muted/40">
                    Fim de semana
                  </button>
                  <button type="button" onClick={() => applyPreset("all")}
                    className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-muted/40">
                    Todos
                  </button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Ao concluir, a próxima ocorrência cai no próximo dia selecionado.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DescriptionField({ cardId, value, onSave }: { cardId: string; value: unknown; onSave: (v: unknown) => void }) {
  const [local, setLocal] = useState<unknown>(value);
  const latestRef = useRef<unknown>(value);
  const savedRef = useRef<string>(JSON.stringify(value ?? null));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ao trocar de card, sincroniza baseline
  useEffect(() => {
    setLocal(value);
    latestRef.current = value;
    savedRef.current = JSON.stringify(value ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const serialized = JSON.stringify(latestRef.current ?? null);
    if (serialized !== savedRef.current) {
      savedRef.current = serialized;
      onSave(latestRef.current);
    }
  }, [onSave]);

  // Flush ao desmontar / trocar card
  useEffect(() => {
    return () => { flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const handleChange = (v: unknown) => {
    setLocal(v);
    latestRef.current = v;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, 900);
  };

  return (
    <div onBlur={flush}>
      <RichTextEditor key={cardId} value={local} onChange={handleChange} />
    </div>
  );
}
