import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Plus, Pencil, Trash2, Shield, Copy } from "lucide-react";

type TabKey = "dashboard"|"campaigns"|"products"|"import"|"compare"|"ranking"|"boards"|"funnels"|"calendar"|"reports"|"users"|"settings"|"documents"|"vsls"|"chips";
type CapKey = "move_cards"|"create_board"|"create_column"|"manage_custom_fields"|"manage_calendar"|"manage_tags"|"view_reports"|"override_dependencies"|"manage_column_kinds"|"log_video_edit"|"manage_editor_targets"|"manage_squads";

const TABS: TabKey[] = ["dashboard","campaigns","products","import","compare","ranking","boards","funnels","calendar","documents","vsls","chips","reports","users","settings"];
const TAB_LABEL: Record<TabKey, string> = {
  dashboard: "Dashboard",
  campaigns: "Campanhas",
  products: "Produtos",
  import: "Importar (dentro de Campanhas)",
  compare: "Comparar",
  ranking: "Ranking",
  boards: "Esteiras",
  funnels: "Funis",
  calendar: "Agenda",
  documents: "Documentos",
  vsls: "Inventário de VSLs",
  chips: "Chips de WhatsApp",
  reports: "Relatórios",
  users: "Usuários",
  settings: "Configurações",
};


const CAP_LABEL: Record<CapKey, string> = {
  move_cards: "Mover cards",
  create_board: "Criar esteira",
  create_column: "Criar coluna",
  manage_custom_fields: "Gerenciar campos personalizados",
  manage_calendar: "Gerenciar agenda",
  manage_tags: "Gerenciar tags",
  view_reports: "Ver relatórios",
  override_dependencies: "Forçar conclusão (deps)",
  manage_column_kinds: "Gerenciar tipos de coluna",
  log_video_edit: "Lançar tempo de edição",
  manage_editor_targets: "Gerenciar metas dos editores",
  manage_squads: "Gerenciar squads",
};

const CAP_GROUPS: { title: string; caps: CapKey[] }[] = [
  { title: "Esteiras", caps: ["move_cards", "create_board", "create_column", "manage_column_kinds", "override_dependencies"] },
  { title: "Conteúdo", caps: ["manage_calendar", "manage_tags", "manage_custom_fields"] },
  { title: "Equipe", caps: ["manage_squads"] },
  { title: "Relatórios e operação", caps: ["view_reports", "log_video_edit", "manage_editor_targets"] },
];

type Profile = { id: string; name: string; description: string | null; is_system: boolean };
type TabPerm = { view: boolean; edit: boolean };
type ProfileDetails = { tabs: Record<TabKey, TabPerm>; caps: Record<CapKey, boolean> };

const emptyTabs = (): Record<TabKey, TabPerm> => {
  const o = {} as Record<TabKey, TabPerm>;
  for (const t of TABS) o[t] = { view: false, edit: false };
  return o;
};
const emptyCaps = (): Record<CapKey, boolean> => {
  const o = {} as Record<CapKey, boolean>;
  for (const g of CAP_GROUPS) for (const c of g.caps) o[c] = false;
  return o;
};

export function ProfilesSettings() {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [details, setDetails] = useState<Record<string, ProfileDetails>>({});
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [tabPerms, setTabPerms] = useState<Record<TabKey, TabPerm>>(emptyTabs);
  const [caps, setCaps] = useState<Record<CapKey, boolean>>(emptyCaps);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);

  const load = async () => {
    const [pRes, mRes, tpRes, pcRes] = await Promise.all([
      supabase.from("permission_profiles").select("*").order("is_system", { ascending: false }).order("name"),
      supabase.from("profiles").select("profile_id"),
      supabase.from("profile_tab_permissions").select("profile_id,tab,can_view,can_edit"),
      supabase.from("profile_capabilities").select("profile_id,capability,enabled"),
    ]);
    setProfiles((pRes.data ?? []) as Profile[]);
    const counts: Record<string, number> = {};
    for (const r of (mRes.data ?? []) as Array<{ profile_id: string | null }>) {
      if (r.profile_id) counts[r.profile_id] = (counts[r.profile_id] ?? 0) + 1;
    }
    setMemberCounts(counts);
    const d: Record<string, ProfileDetails> = {};
    for (const p of (pRes.data ?? []) as Profile[]) d[p.id] = { tabs: emptyTabs(), caps: emptyCaps() };
    for (const r of (tpRes.data ?? []) as Array<{ profile_id: string; tab: TabKey; can_view: boolean; can_edit: boolean }>) {
      if (d[r.profile_id] && TABS.includes(r.tab)) d[r.profile_id].tabs[r.tab] = { view: r.can_view, edit: r.can_edit };
    }
    for (const r of (pcRes.data ?? []) as Array<{ profile_id: string; capability: CapKey; enabled: boolean }>) {
      if (d[r.profile_id] && r.capability in CAP_LABEL) d[r.profile_id].caps[r.capability] = r.enabled;
    }
    setDetails(d);
  };

  useEffect(() => { load(); }, []);

  const openEditor = (p: Profile | null, source?: Profile) => {
    const seed = source ? details[source.id] : (p ? details[p.id] : null);
    setEditing(p);
    setName(p?.name ?? (source ? `${source.name} (cópia)` : ""));
    setDescription(p?.description ?? source?.description ?? "");
    setTabPerms(seed ? { ...seed.tabs } : emptyTabs());
    setCaps(seed ? { ...seed.caps } : emptyCaps());
    setEditorOpen(true);
  };

  const toggleTab = (tab: TabKey, key: "view" | "edit") => {
    const cur = tabPerms[tab];
    const next = { ...cur, [key]: !cur[key] };
    if (key === "edit" && next.edit) next.view = true;
    if (key === "view" && !next.view) next.edit = false;
    setTabPerms({ ...tabPerms, [tab]: next });
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Dê um nome ao perfil"); return; }
    let profileId = editing?.id;
    if (!editing) {
      const { data, error } = await supabase
        .from("permission_profiles")
        .insert({ name: name.trim(), description: description.trim() || null, is_system: false } as never)
        .select("id")
        .single();
      if (error) { toast.error(error.message); return; }
      profileId = (data as { id: string }).id;
    } else {
      const { error } = await supabase
        .from("permission_profiles")
        .update({ name: name.trim(), description: description.trim() || null } as never)
        .eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    }
    if (!profileId) return;

    await supabase.from("profile_tab_permissions").delete().eq("profile_id", profileId);
    const tabRows = TABS
      .filter((t) => tabPerms[t].view || tabPerms[t].edit)
      .map((t) => ({ profile_id: profileId, tab: t, can_view: tabPerms[t].view, can_edit: tabPerms[t].edit }));
    if (tabRows.length) {
      const { error } = await supabase.from("profile_tab_permissions").insert(tabRows as never);
      if (error) { toast.error(error.message); return; }
    }

    await supabase.from("profile_capabilities").delete().eq("profile_id", profileId);
    const capRows = (Object.keys(caps) as CapKey[]).filter((c) => caps[c]).map((c) => ({ profile_id: profileId, capability: c, enabled: true }));
    if (capRows.length) {
      const { error } = await supabase.from("profile_capabilities").insert(capRows as never);
      if (error) { toast.error(error.message); return; }
    }

    toast.success(editing ? "Perfil atualizado" : "Perfil criado");
    setEditorOpen(false);
    load();
  };

  const remove = async (p: Profile) => {
    const { error } = await supabase.from("permission_profiles").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Perfil excluído");
    setDeleteTarget(null);
    load();
  };

  if (!isAdmin) return <div className="text-sm text-muted-foreground">Apenas admins podem gerenciar perfis.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Perfis de permissão</h2>
          <p className="text-sm text-muted-foreground">Crie perfis nomeados e atribua a um ou mais usuários.</p>
        </div>
        <Button onClick={() => openEditor(null)}><Plus className="h-4 w-4 mr-2" /> Novo perfil</Button>
      </div>

      <Card className="border-warning/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Administrador</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          O papel <strong>Administrador</strong> é fixo do sistema, tem acesso total e é gerenciado em <em>Usuários</em>.
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {profiles.map((p) => {
          const d = details[p.id];
          const tabsList = d ? TABS.filter((t) => d.tabs[t].view || d.tabs[t].edit) : [];
          const capCount = d ? Object.values(d.caps).filter(Boolean).length : 0;
          return (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.name}</span>
                      {p.is_system && <Badge variant="secondary" className="text-[10px]">sistema</Badge>}
                      <Badge variant="outline" className="text-[10px]">{memberCounts[p.id] ?? 0} usuário(s)</Badge>
                      <Badge variant="outline" className="text-[10px]">{capCount} capacidade(s)</Badge>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEditor(null, p)} title="Duplicar"><Copy className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => openEditor(p)}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
                    {!p.is_system && (
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteTarget(p)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {tabsList.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {tabsList.map((t) => {
                      const tp = d!.tabs[t];
                      return (
                        <span
                          key={t}
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${tp.edit ? "border-primary/60 bg-primary/10 text-primary" : "border-muted text-muted-foreground"}`}
                          title={tp.edit ? "Editar" : "Apenas ver"}
                        >
                          {TAB_LABEL[t]}{tp.edit ? " ✎" : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Sem áreas atribuídas.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {profiles.length === 0 && <p className="text-sm text-muted-foreground">Nenhum perfil criado ainda.</p>}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Editar: ${editing.name}` : "Novo perfil"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium">Nome</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Designer, Gerente de Tráfego" />
            </div>
            <div>
              <label className="text-xs font-medium">Descrição</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="O que esse perfil faz?" />
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-2">Áreas / Abas</h3>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase">
                    <tr>
                      <th className="text-left p-2 px-3">Área</th>
                      <th className="p-2 text-center w-24">Ver</th>
                      <th className="p-2 text-center w-24">Editar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TABS.map((t) => {
                      const tp = tabPerms[t] ?? { view: false, edit: false };
                      const mixed = tp.view && !tp.edit;
                      return (
                        <tr key={t} className={`border-t ${mixed ? "bg-warning/5" : ""}`}>
                          <td className="p-2 px-3">{TAB_LABEL[t]}</td>
                          <td className="p-2 text-center"><Checkbox checked={tp.view} onCheckedChange={() => toggleTab(t, "view")} /></td>
                          <td className="p-2 text-center"><Checkbox checked={tp.edit} onCheckedChange={() => toggleTab(t, "edit")} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Capacidades</h3>
              {CAP_GROUPS.map((g) => (
                <div key={g.title} className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-xs uppercase font-medium">{g.title}</div>
                  <div className="divide-y">
                    {g.caps.map((c) => (
                      <label key={c} className="flex items-center gap-3 p-2 px-3 cursor-pointer hover:bg-muted/30">
                        <Checkbox checked={caps[c]} onCheckedChange={() => setCaps({ ...caps, [c]: !caps[c] })} />
                        <span className="text-sm">{CAP_LABEL[c]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Criar perfil"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir perfil "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (memberCounts[deleteTarget.id] ?? 0) > 0
                ? `${memberCounts[deleteTarget.id]} usuário(s) ficarão sem perfil e perderão acesso até receberem um novo.`
                : "Nenhum usuário está atribuído a esse perfil hoje."}
              {" "}Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove(deleteTarget)} className="bg-destructive-strong text-destructive-foreground hover:bg-destructive-strong/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
