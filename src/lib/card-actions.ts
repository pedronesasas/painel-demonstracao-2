// Ações de card usadas pela esteira e pelo card aberto: link, excluir e duplicar.
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Link direto: a rota da esteira abre o card pelo ?card=
export function cardLink(boardId: string, cardId: string) {
  return `${window.location.origin}/boards/${boardId}?card=${cardId}`;
}

export async function copyCardLink(boardId: string, cardId: string) {
  const url = cardLink(boardId, cardId);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  } catch {
    toast.error("Não foi possível copiar", { description: url });
  }
}

// Exclui o card (comentários, subtarefas etc. saem em cascata no banco). Devolve o erro ou null.
export async function deleteCard(cardId: string): Promise<string | null> {
  const { error } = await supabase.from("cards").delete().eq("id", cardId);
  return error?.message ?? null;
}

type SourceCard = {
  id: string; board_id: string; column_id: string; title: string; description: unknown;
  priority: string; start_date: string | null; end_date: string | null; due_date: string | null;
  assignee_id: string | null; squad_id: string | null; visible_in_calendar: boolean;
};
type SourceSub = {
  id: string; title: string; position: number; assignee_id: string | null;
  due_date: string | null; description: string | null; blocks_parent: boolean;
};

export type CardCopy = {
  /** Linha completa do card novo (select *) */
  card: { id: string } & Record<string, unknown>;
  subitems: { id: string; title: string; done: boolean; position: number }[];
  assigneeIds: string[];
  /** Partes que falharam ao copiar (o card em si foi criado) */
  failed: string[];
};

// Grava linhas só se houver alguma; com onConflict ignora as que o banco já criou por trigger
async function insertRows(table: string, rows: object[], onConflict?: string): Promise<boolean> {
  if (!rows.length) return true;
  const q = supabase.from(table as never);
  const { error } = onConflict
    ? await q.upsert(rows as never, { onConflict, ignoreDuplicates: true } as never)
    : await q.insert(rows as never);
  return !error;
}

// Duplica o card na coluna pedida (ou na do original), na posição pedida, com título "(cópia)".
// Copia descrição, prioridade, datas, responsável/squad, co-responsáveis, etiquetas,
// campos personalizados e subtarefas (abertas) com os responsáveis delas.
// NÃO copia comentários, histórico, conclusão nem recorrência. O short_id vem do trigger.
// Atenção: coluna de concluídos faz a cópia nascer concluída (trigger do banco no INSERT).
export async function duplicateCard(
  sourceId: string,
  opts: { position: number; columnId?: string; userId?: string | null },
): Promise<{ data: CardCopy } | { error: string }> {
  // 1) Lê tudo antes de criar, para não sobrar cópia pela metade se a leitura falhar
  const { data: src, error: srcErr } = await supabase.from("cards").select("*").eq("id", sourceId).maybeSingle();
  if (srcErr) return { error: srcErr.message };
  if (!src) return { error: "Card não encontrado" };
  const s = src as unknown as SourceCard;

  const [ca, ct, fv, si] = await Promise.all([
    supabase.from("card_assignees" as never).select("user_id").eq("card_id", sourceId),
    supabase.from("card_tags").select("tag_id").eq("card_id", sourceId),
    supabase.from("card_field_values").select("field_id,value").eq("card_id", sourceId),
    supabase.from("card_subitems")
      .select("id,title,position,assignee_id,due_date,description,blocks_parent")
      .eq("card_id", sourceId).order("position"),
  ]);
  const readErr = ca.error ?? ct.error ?? fv.error ?? si.error;
  if (readErr) return { error: readErr.message };
  const subs = (si.data ?? []) as SourceSub[];

  let subAssignees: Array<{ subitem_id: string; user_id: string }> = [];
  if (subs.length) {
    const { data, error } = await supabase.from("card_subitem_assignees" as never)
      .select("subitem_id,user_id").in("subitem_id", subs.map((x) => x.id));
    if (error) return { error: error.message };
    subAssignees = (data ?? []) as Array<{ subitem_id: string; user_id: string }>;
  }

  // 2) Cria o card. Squad e responsável individual são excludentes: com squad, fica sem pessoa
  const primary = s.squad_id ? null : s.assignee_id;
  const { data: ins, error: insErr } = await supabase.from("cards").insert({
    board_id: s.board_id, column_id: opts.columnId ?? s.column_id, title: `${s.title} (cópia)`,
    description: s.description, priority: s.priority,
    start_date: s.start_date, end_date: s.end_date, due_date: s.due_date,
    visible_in_calendar: s.visible_in_calendar,
    squad_id: s.squad_id, assignee_id: primary,
    position: opts.position, created_by: opts.userId ?? null,
  } as never).select("*").single();
  if (insErr || !ins) return { error: insErr?.message ?? "Falha ao duplicar o card" };
  const card = ins as CardCopy["card"];
  const failed: string[] = [];

  // 3) Co-responsáveis (o principal o trigger do banco já incluiu), etiquetas e campos preenchidos
  const assigneeIds = s.squad_id ? [] : Array.from(new Set([
    ...(primary ? [primary] : []),
    ...((ca.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  ]));
  const tagIds = ((ct.data ?? []) as Array<{ tag_id: string }>).map((r) => r.tag_id);
  const values = ((fv.data ?? []) as Array<{ field_id: string; value: string | null }>).filter((v) => v.value);
  const [okAssignees, okTags, okFields] = await Promise.all([
    insertRows("card_assignees", assigneeIds.map((user_id) => ({ card_id: card.id, user_id })), "card_id,user_id"),
    insertRows("card_tags", tagIds.map((tag_id) => ({ card_id: card.id, tag_id }))),
    insertRows("card_field_values", values.map((v) => ({ card_id: card.id, field_id: v.field_id, value: v.value }))),
  ]);
  if (!okAssignees) failed.push("co-responsáveis");
  if (!okTags) failed.push("etiquetas");
  if (!okFields) failed.push("campos personalizados");

  // 4) Subtarefas, todas abertas e renumeradas 0..n-1 (a posição liga a nova à original)
  let subitems: CardCopy["subitems"] = [];
  if (subs.length) {
    const { data: newSubs, error: subErr } = await supabase.from("card_subitems").insert(subs.map((x, i) => ({
      card_id: card.id, title: x.title, done: false, position: i, assignee_id: x.assignee_id,
      due_date: x.due_date, description: x.description, blocks_parent: x.blocks_parent,
    })) as never).select("id,title,done,position");
    if (subErr) {
      failed.push("subtarefas");
    } else {
      subitems = ((newSubs ?? []) as CardCopy["subitems"]).sort((a, b) => a.position - b.position);
      const newIdByOld = new Map<string, string>();
      subs.forEach((x, i) => {
        const n = subitems.find((ns) => ns.position === i);
        if (n) newIdByOld.set(x.id, n.id);
      });
      const rows = subAssignees.flatMap((a) => {
        const nid = newIdByOld.get(a.subitem_id);
        return nid ? [{ subitem_id: nid, user_id: a.user_id }] : [];
      });
      if (!(await insertRows("card_subitem_assignees", rows, "subitem_id,user_id"))) failed.push("responsáveis das subtarefas");
    }
  }

  return { data: { card, subitems, assigneeIds, failed } };
}
