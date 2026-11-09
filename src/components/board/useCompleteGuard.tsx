import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Antes de concluir um card (bolinha, arrastar para concluídos, botão Finalizar, Minhas tarefas):
// se houver subtarefas em aberto, pergunta se marca todas como concluídas. Devolve true quando
// pode seguir com a conclusão. Quem leva o card para a coluna de concluídos é o banco
// (trigger trg_cards_a_move_on_completion) ou a própria ação de mover.
type Pending = { id: string; title: string };

export function useCompleteGuard() {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [saving, setSaving] = useState(false);
  const target = useRef<{ cardId: string; resolve: (ok: boolean) => void } | null>(null);

  const confirmComplete = useCallback(async (cardId: string): Promise<boolean> => {
    const { data, error } = await supabase.from("card_subitems")
      .select("id,title").eq("card_id", cardId).eq("done", false).order("position");
    if (error) { toast.error(error.message); return false; }
    const open = (data ?? []) as Pending[];
    if (open.length === 0) return true;
    return new Promise<boolean>((resolve) => {
      target.current = { cardId, resolve };
      setPending(open);
    });
  }, []);

  const finish = (ok: boolean) => {
    target.current?.resolve(ok);
    target.current = null;
    setPending(null);
  };

  const markAllAndContinue = async () => {
    const t = target.current;
    if (!t) return;
    setSaving(true);
    const { error } = await supabase.from("card_subitems")
      .update({ done: true } as never).eq("card_id", t.cardId).eq("done", false);
    setSaving(false);
    if (error) { toast.error(error.message); finish(false); return; }
    finish(true);
  };

  const n = pending?.length ?? 0;
  const dialog = (
    <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !saving) finish(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{n === 1 ? "Há 1 subtarefa pendente" : `Há ${n} subtarefas pendentes`}</AlertDialogTitle>
          <AlertDialogDescription>
            Para concluir o card, {n === 1 ? "ela será marcada" : "elas serão marcadas"} como {n === 1 ? "concluída" : "concluídas"} e o card vai para a coluna de concluídos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-48 overflow-y-auto space-y-1 text-sm text-muted-foreground list-disc pl-5">
          {(pending ?? []).map((s) => <li key={s.id}>{s.title}</li>)}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); markAllAndContinue(); }}>
            Marcar todas e concluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmComplete, completeGuardDialog: dialog };
}
