import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { hmsToSeconds, secondsToHMS } from "@/lib/utils";

export type VideoEditEditor = { id: string; name: string };
type CardOpt = { id: string; short_id: string | null; title: string };

type Entry = {
  id?: string;
  editor_id: string;
  card_id: string | null;
  title: string;
  duration_seconds: number;
  delivered_at: string;
  notes: string | null;
};

export function AddVideoEditDialog({
  open,
  onOpenChange,
  editors,
  onSaved,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editors: VideoEditEditor[];
  onSaved: () => void;
  initial?: Entry | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [editorId, setEditorId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState<string>("0");
  const [minutes, setMinutes] = useState<string>("0");
  const [seconds, setSeconds] = useState<string>("0");
  const [deliveredAt, setDeliveredAt] = useState<string>(today);
  const [notes, setNotes] = useState("");
  const [cardId, setCardId] = useState<string | null>(null);
  const [cardLabel, setCardLabel] = useState<string>("");
  const [cardQuery, setCardQuery] = useState("");
  const [cardOpen, setCardOpen] = useState(false);
  const [cards, setCards] = useState<CardOpt[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setEditorId(initial.editor_id);
      setTitle(initial.title);
      const { h, m, s } = secondsToHMS(initial.duration_seconds);
      setHours(String(h));
      setMinutes(String(m));
      setSeconds(String(s));
      setDeliveredAt(initial.delivered_at);
      setNotes(initial.notes ?? "");
      setCardId(initial.card_id);
      setCardLabel("");
      if (initial.card_id) {
        supabase.from("cards").select("id,short_id,title").eq("id", initial.card_id).maybeSingle().then((r) => {
          if (r.data) setCardLabel(`${r.data.short_id ?? ""} ${r.data.title}`.trim());
        });
      }
    } else {
      setEditorId("");
      setTitle("");
      setHours("0");
      setMinutes("0");
      setSeconds("0");
      setDeliveredAt(today);
      setNotes("");
      setCardId(null);
      setCardLabel("");
    }
    setCardQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  useEffect(() => {
    if (!cardOpen) return;
    const q = cardQuery.trim();
    const run = async () => {
      let query = supabase.from("cards").select("id,short_id,title").order("updated_at", { ascending: false }).limit(25);
      if (q) query = query.or(`title.ilike.%${q}%,short_id.ilike.%${q}%`);
      const { data } = await query;
      setCards((data ?? []) as CardOpt[]);
    };
    const t = setTimeout(run, 200);
    return () => clearTimeout(t);
  }, [cardQuery, cardOpen]);

  const totalSeconds = useMemo(() => hmsToSeconds(hours, minutes, seconds), [hours, minutes, seconds]);
  const canSave = editorId && title.trim().length > 0 && totalSeconds > 0 && deliveredAt;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload = {
      editor_id: editorId,
      card_id: cardId,
      title: title.trim(),
      duration_seconds: totalSeconds,
      delivered_at: deliveredAt,
      notes: notes.trim() || null,
    };
    let error;
    if (initial?.id) {
      ({ error } = await supabase.from("video_edit_entries").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await supabase.from("video_edit_entries").insert({ ...payload, created_by: auth.user?.id }));
    }
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success(initial?.id ? "Lançamento atualizado" : "Lançamento adicionado");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar demanda" : "Adicionar demanda"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Editor</Label>
            <Select value={editorId} onValueChange={setEditorId}>
              <SelectTrigger><SelectValue placeholder="Selecione o editor" /></SelectTrigger>
              <SelectContent>
                {editors.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Título da demanda</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex.: VSL produto X v3" />
          </div>
          <div>
            <Label>Tempo do vídeo</Label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Input type="number" min={0} step={1} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />
                <div className="text-[10px] text-muted-foreground text-center mt-1">horas</div>
              </div>
              <div>
                <Input type="number" min={0} max={59} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" />
                <div className="text-[10px] text-muted-foreground text-center mt-1">minutos</div>
              </div>
              <div>
                <Input type="number" min={0} max={59} step={1} value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="0" />
                <div className="text-[10px] text-muted-foreground text-center mt-1">segundos</div>
              </div>
            </div>
          </div>
          <div>
            <Label>Data de entrega</Label>
            <Input type="date" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
          </div>
          <div>
            <Label>Card vinculado (opcional)</Label>
            <Popover open={cardOpen} onOpenChange={setCardOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate text-left">{cardLabel || "Nenhum card"}</span>
                  <span className="text-xs text-muted-foreground ml-2">Buscar</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[380px] p-0 pointer-events-auto" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Buscar por título ou código..." value={cardQuery} onValueChange={setCardQuery} />
                  <CommandList>
                    <CommandEmpty>Nenhum card encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={() => { setCardId(null); setCardLabel(""); setCardOpen(false); }}>
                        — Nenhum —
                      </CommandItem>
                      {cards.map((c) => (
                        <CommandItem
                          key={c.id}
                          onSelect={() => {
                            setCardId(c.id);
                            setCardLabel(`${c.short_id ?? ""} ${c.title}`.trim());
                            setCardOpen(false);
                          }}
                        >
                          <span className="text-xs text-muted-foreground mr-2">{c.short_id ?? "—"}</span>
                          <span className="truncate">{c.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!canSave || saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
