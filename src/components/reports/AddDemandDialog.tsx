import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { hmsToSeconds, secondsToHMS, formatDurationHM } from "@/lib/utils";
import type { VideoEditEditor } from "./AddVideoEditDialog";

type CardOpt = { id: string; short_id: string | null; title: string };

type VideoRow = { id: string; title: string; h: string; m: string; s: string };

export type DemandEditInitial = {
  id: string;
  editor_id: string;
  title: string;
  delivered_at: string;
  card_id: string | null;
  mode: "detailed" | "aggregate";
  aggregate_video_count: number | null;
  aggregate_total_seconds: number | null;
  notes: string | null;
};

function newRow(): VideoRow {
  return { id: crypto.randomUUID(), title: "", h: "0", m: "0", s: "0" };
}

export function AddDemandDialog({
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
  initial?: DemandEditInitial | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [editorId, setEditorId] = useState("");
  const [title, setTitle] = useState("");
  const [deliveredAt, setDeliveredAt] = useState(today);
  const [notes, setNotes] = useState("");
  const [cardId, setCardId] = useState<string | null>(null);
  const [cardLabel, setCardLabel] = useState("");
  const [cardQuery, setCardQuery] = useState("");
  const [cardOpen, setCardOpen] = useState(false);
  const [cards, setCards] = useState<CardOpt[]>([]);
  const [mode, setMode] = useState<"detailed" | "aggregate">("detailed");
  const [videos, setVideos] = useState<VideoRow[]>([newRow()]);
  const [aggCount, setAggCount] = useState("0");
  const [aggH, setAggH] = useState("0");
  const [aggM, setAggM] = useState("0");
  const [aggS, setAggS] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setEditorId(initial.editor_id);
      setTitle(initial.title);
      setDeliveredAt(initial.delivered_at);
      setNotes(initial.notes ?? "");
      setCardId(initial.card_id);
      setCardLabel("");
      setMode(initial.mode);
      if (initial.card_id) {
        supabase.from("cards").select("id,short_id,title").eq("id", initial.card_id).maybeSingle().then((r) => {
          if (r.data) setCardLabel(`${r.data.short_id ?? ""} ${r.data.title}`.trim());
        });
      }
      if (initial.mode === "aggregate") {
        setAggCount(String(initial.aggregate_video_count ?? 0));
        const { h, m, s } = secondsToHMS(initial.aggregate_total_seconds ?? 0);
        setAggH(String(h));
        setAggM(String(m));
        setAggS(String(s));
        setVideos([newRow()]);
      } else {
        // load child entries
        supabase
          .from("video_edit_entries")
          .select("id,title,duration_seconds")
          .eq("demand_id", initial.id)
          .order("created_at", { ascending: true })
          .then((r) => {
            const list = (r.data ?? []).map((e) => {
              const { h, m, s } = secondsToHMS(e.duration_seconds);
              return { id: e.id, title: e.title, h: String(h), m: String(m), s: String(s) };
            });
            setVideos(list.length ? list : [newRow()]);
          });
      }
    } else {
      setEditorId("");
      setTitle("");
      setDeliveredAt(today);
      setNotes("");
      setCardId(null);
      setCardLabel("");
      setMode("detailed");
      setVideos([newRow()]);
      setAggCount("0");
      setAggH("0");
      setAggM("0");
      setAggS("0");
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

  const totalDetailedSeconds = useMemo(
    () => videos.reduce((s, v) => s + hmsToSeconds(v.h, v.m, v.s), 0),
    [videos],
  );
  const aggSeconds = useMemo(() => hmsToSeconds(aggH, aggM, aggS), [aggH, aggM, aggS]);
  const aggCountNum = Math.max(0, Math.floor(Number(aggCount) || 0));
  const avgAggSeconds = aggCountNum > 0 ? Math.round(aggSeconds / aggCountNum) : 0;

  const canSave = useMemo(() => {
    if (!editorId || !title.trim() || !deliveredAt) return false;
    if (mode === "detailed") {
      return videos.some((v) => v.title.trim() && hmsToSeconds(v.h, v.m, v.s) > 0);
    }
    return aggCountNum > 0 && aggSeconds > 0;
  }, [editorId, title, deliveredAt, mode, videos, aggCountNum, aggSeconds]);

  const updateVideo = (id: string, patch: Partial<VideoRow>) => {
    setVideos((p) => p.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();

    const demandPayload = {
      editor_id: editorId,
      title: title.trim(),
      delivered_at: deliveredAt,
      card_id: cardId,
      mode,
      aggregate_video_count: mode === "aggregate" ? aggCountNum : null,
      aggregate_total_seconds: mode === "aggregate" ? aggSeconds : null,
      notes: notes.trim() || null,
    };

    let demandId = initial?.id;
    if (initial?.id) {
      const { error } = await supabase.from("video_edit_demands").update(demandPayload).eq("id", initial.id);
      if (error) {
        setSaving(false);
        toast.error("Erro ao salvar demanda", { description: error.message });
        return;
      }
      // wipe old child entries (simpler than diffing)
      await supabase.from("video_edit_entries").delete().eq("demand_id", initial.id);
    } else {
      const { data, error } = await supabase
        .from("video_edit_demands")
        .insert({ ...demandPayload, created_by: auth.user?.id })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        toast.error("Erro ao criar demanda", { description: error?.message });
        return;
      }
      demandId = data.id;
    }

    if (mode === "detailed" && demandId) {
      const rows = videos
        .filter((v) => v.title.trim() && hmsToSeconds(v.h, v.m, v.s) > 0)
        .map((v) => ({
          demand_id: demandId!,
          editor_id: editorId,
          card_id: cardId,
          title: v.title.trim(),
          duration_seconds: hmsToSeconds(v.h, v.m, v.s),
          delivered_at: deliveredAt,
          notes: null,
          created_by: auth.user?.id,
        }));
      if (rows.length) {
        const { error } = await supabase.from("video_edit_entries").insert(rows);
        if (error) {
          setSaving(false);
          toast.error("Erro ao salvar vídeos", { description: error.message });
          return;
        }
      }
    }

    setSaving(false);
    toast.success(initial?.id ? "Demanda atualizada" : "Demanda criada");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar demanda" : "Nova demanda"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Editor</Label>
              <Select value={editorId} onValueChange={setEditorId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {editors.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de entrega</Label>
              <Input type="date" value={deliveredAt} onChange={(e) => setDeliveredAt(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Título da demanda</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex.: Criativos lote 03" />
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

          <Tabs value={mode} onValueChange={(v) => setMode(v as "detailed" | "aggregate")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="detailed">Detalhado (1 a 1)</TabsTrigger>
              <TabsTrigger value="aggregate">Agregado (total)</TabsTrigger>
            </TabsList>

            <TabsContent value="detailed" className="space-y-2 mt-3">
              <div className="space-y-2">
                {videos.map((v, idx) => (
                  <div key={v.id} className="flex gap-2 items-end">
                    <div className="flex-1">
                      {idx === 0 && <Label className="text-xs">Título do vídeo</Label>}
                      <Input
                        value={v.title}
                        onChange={(e) => updateVideo(v.id, { title: e.target.value })}
                        placeholder={`Vídeo ${idx + 1}`}
                      />
                    </div>
                    <div className="w-16">
                      {idx === 0 && <Label className="text-xs">h</Label>}
                      <Input type="number" min={0} value={v.h} onChange={(e) => updateVideo(v.id, { h: e.target.value })} />
                    </div>
                    <div className="w-16">
                      {idx === 0 && <Label className="text-xs">m</Label>}
                      <Input type="number" min={0} max={59} value={v.m} onChange={(e) => updateVideo(v.id, { m: e.target.value })} />
                    </div>
                    <div className="w-16">
                      {idx === 0 && <Label className="text-xs">s</Label>}
                      <Input type="number" min={0} max={59} value={v.s} onChange={(e) => updateVideo(v.id, { s: e.target.value })} />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setVideos((p) => (p.length > 1 ? p.filter((x) => x.id !== v.id) : p))}
                      disabled={videos.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setVideos((p) => [...p, newRow()])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar vídeo
                </Button>
                <div className="text-xs text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{formatDurationHM(totalDetailedSeconds)}</span> · {videos.length} vídeo(s)
                </div>
              </div>
            </TabsContent>

            <TabsContent value="aggregate" className="space-y-3 mt-3">
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">Qtd. vídeos</Label>
                  <Input type="number" min={0} value={aggCount} onChange={(e) => setAggCount(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Total h</Label>
                  <Input type="number" min={0} value={aggH} onChange={(e) => setAggH(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Total m</Label>
                  <Input type="number" min={0} max={59} value={aggM} onChange={(e) => setAggM(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Total s</Label>
                  <Input type="number" min={0} max={59} value={aggS} onChange={(e) => setAggS(e.target.value)} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Média por vídeo: <span className="font-semibold text-foreground">{formatDurationHM(avgAggSeconds)}</span>
                {" · "}Total creditado em {deliveredAt}: <span className="font-semibold text-foreground">{formatDurationHM(aggSeconds)}</span>
              </div>
            </TabsContent>
          </Tabs>

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
