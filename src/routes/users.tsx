import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, X, Shield, Search, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Usuários — NEXUS" },
      { name: "description", content: "Gerenciamento de usuários." },
      { property: "og:title", content: "Usuários — NEXUS" },
      { property: "og:description", content: "Gerenciamento de usuários." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="users">
      <AppLayout><UsersPage /></AppLayout>
    </RequireTabAccess>
  ),
});

const ADMIN_VALUE = "__admin__";
const NONE_VALUE = "__none__";

type StatusFilter = "all" | "approved" | "pending" | "rejected";

function UsersPage() {
  const { isAdmin, loading, user: me } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approveTarget, setApproveTarget] = useState<{ id: string; name: string } | null>(null);
  const [approveProfile, setApproveProfile] = useState<string>(NONE_VALUE);
  const [permsUserId, setPermsUserId] = useState<string | null>(null);

  useEffect(() => {
    // loading só cai com as permissões do uid carregadas; replace evita loop no Voltar
    if (!loading && !isAdmin) navigate({ to: "/", replace: true });
  }, [loading, isAdmin, navigate]);

  const { data: users } = useQuery({
    queryKey: ["users-list"],
    enabled: isAdmin,
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
      ]);
      const adminSet = new Set((rolesRes.data ?? []).map((r) => r.user_id));
      return (profilesRes.data ?? []).map((p) => ({
        ...p,
        isAdmin: adminSet.has(p.id),
      }));
    },
  });

  const { data: profilesList } = useQuery({
    queryKey: ["permission-profiles-list"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("permission_profiles").select("id,name").order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const setAssignment = async (userId: string, value: string) => {
    if (value === ADMIN_VALUE) {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.from("profiles").update({ profile_id: null }).eq("id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) { toast.error(error.message); return; }
    } else {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const newProfileId = value === NONE_VALUE ? null : value;
      const { error } = await supabase.from("profiles").update({ profile_id: newProfileId }).eq("id", userId);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Atribuição atualizada");
    qc.invalidateQueries({ queryKey: ["users-list"] });
  };

  const setStatusFor = async (userIds: string[], newStatus: "approved" | "rejected" | "pending", profileId?: string | null) => {
    if (!userIds.length) return;
    const patch: { status: typeof newStatus; profile_id?: string | null } = { status: newStatus };
    if (newStatus === "approved" && profileId !== undefined) patch.profile_id = profileId;
    const { error } = await supabase.from("profiles").update(patch).in("id", userIds);
    if (error) { toast.error(error.message); return; }
    toast.success(
      newStatus === "approved" ? `${userIds.length} usuário(s) aprovado(s)` :
      newStatus === "rejected" ? `${userIds.length} usuário(s) rejeitado(s)` :
      `${userIds.length} usuário(s) voltaram para pendente`,
    );
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["users-list"] });
  };

  const pending = (users ?? []).filter((u) => u.status === "pending");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (u.status === "pending") return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (profileFilter === ADMIN_VALUE && !u.isAdmin) return false;
      if (profileFilter === NONE_VALUE && (u.isAdmin || u.profile_id)) return false;
      if (profileFilter !== "all" && profileFilter !== ADMIN_VALUE && profileFilter !== NONE_VALUE && u.profile_id !== profileFilter) return false;
      if (q && !`${u.full_name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, search, statusFilter, profileFilter]);

  if (!isAdmin) return null;

  const profileNameById = new Map((profilesList ?? []).map((p) => [p.id, p.name]));
  const togglePending = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const allPendingSelected = pending.length > 0 && pending.every((u) => selected.has(u.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        description="Atribua um perfil de permissões a cada usuário."
        actions={
          <Button asChild variant="outline">
            <Link to="/settings/profiles"><Shield className="h-4 w-4 mr-2" /> Gerenciar perfis</Link>
          </Button>
        }
      />

      {pending.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Aprovações pendentes ({pending.length})</CardTitle>
            {selected.size > 0 && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setStatusFor(Array.from(selected), "approved", null)}>
                  <Check className="h-4 w-4 mr-1" /> Aprovar {selected.size}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setStatusFor(Array.from(selected), "rejected")}>
                  <X className="h-4 w-4 mr-1" /> Rejeitar {selected.size}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allPendingSelected}
                      onCheckedChange={(v) => setSelected(v ? new Set(pending.map((u) => u.id)) : new Set())}
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Checkbox checked={selected.has(u.id)} onCheckedChange={() => togglePending(u.id)} />
                    </TableCell>
                    <TableCell>{u.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" onClick={() => { setApproveTarget({ id: u.id, name: u.full_name ?? u.email ?? "" }); setApproveProfile(NONE_VALUE); }}>
                        <Check className="h-4 w-4 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStatusFor([u.id], "rejected")}>
                        <X className="h-4 w-4 mr-1" /> Rejeitar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Membros da equipe</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 pt-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por nome ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={profileFilter} onValueChange={setProfileFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                <SelectItem value={ADMIN_VALUE}>Administradores</SelectItem>
                <SelectItem value={NONE_VALUE}>Sem perfil</SelectItem>
                {(profilesList ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Perfil atual</TableHead>
                <TableHead>Atribuir</TableHead>
                <TableHead className="w-32 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const currentLabel = u.isAdmin
                  ? "Administrador"
                  : (u.profile_id ? profileNameById.get(u.profile_id) ?? "—" : "Sem perfil");
                const currentValue = u.isAdmin ? ADMIN_VALUE : (u.profile_id ?? NONE_VALUE);
                const isMe = me?.id === u.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>{u.full_name ?? "—"} {isMe && <span className="text-xs text-muted-foreground">(você)</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.status === "approved" ? "success" : "danger"}>{u.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isAdmin ? "default" : "secondary"}>{currentLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      <Select value={currentValue} onValueChange={(v) => setAssignment(u.id, v)} disabled={isMe}>
                        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ADMIN_VALUE}>Administrador</SelectItem>
                          <SelectItem value={NONE_VALUE}>Sem perfil</SelectItem>
                          {(profilesList ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver permissões" onClick={() => setPermsUserId(u.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {u.status === "rejected" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Voltar para pendente" onClick={() => setStatusFor([u.id], "pending")}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Nenhum usuário com esses filtros.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <p className="mt-4 text-xs text-muted-foreground">
            Você não pode alterar seu próprio perfil para evitar travar o acesso. Crie e edite perfis em <strong>Configurações → Perfis</strong>.
          </p>
        </CardContent>
      </Card>

      {/* Approve with profile dialog */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar {approveTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Opcionalmente, já atribua um perfil de permissão.</p>
            <Select value={approveProfile} onValueChange={setApproveProfile}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Sem perfil (atribuir depois)</SelectItem>
                <SelectItem value={ADMIN_VALUE}>Administrador</SelectItem>
                {(profilesList ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (!approveTarget) return;
              if (approveProfile === ADMIN_VALUE) {
                await setStatusFor([approveTarget.id], "approved", null);
                await setAssignment(approveTarget.id, ADMIN_VALUE);
              } else {
                const pid = approveProfile === NONE_VALUE ? null : approveProfile;
                await setStatusFor([approveTarget.id], "approved", pid);
              }
              setApproveTarget(null);
            }}>Aprovar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Effective permissions drawer */}
      <Sheet open={!!permsUserId} onOpenChange={(o) => !o && setPermsUserId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>Permissões efetivas</SheetTitle></SheetHeader>
          {permsUserId && (
            <PermissionsView
              userId={permsUserId}
              users={users ?? []}
              profilesList={profilesList ?? []}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const TAB_LABEL: Record<string, string> = {
  dashboard: "Dashboard", campaigns: "Campanhas", products: "Produtos", import: "Importar",
  compare: "Comparar", ranking: "Ranking", boards: "Esteiras", calendar: "Agenda",
  documents: "Documentos", vsls: "Inventário de VSLs", chips: "Chips de WhatsApp",
  reports: "Relatórios", users: "Usuários", settings: "Configurações",
};
const CAP_LABEL: Record<string, string> = {
  move_cards: "Mover cards", create_board: "Criar esteira", create_column: "Criar coluna",
  manage_custom_fields: "Gerenciar campos personalizados", manage_calendar: "Gerenciar agenda",
  manage_tags: "Gerenciar tags", view_reports: "Ver relatórios", override_dependencies: "Forçar conclusão (deps)",
  manage_column_kinds: "Gerenciar tipos de coluna", log_video_edit: "Lançar tempo de edição",
  manage_editor_targets: "Gerenciar metas dos editores",
};

function PermissionsView({
  userId,
  users,
  profilesList,
}: {
  userId: string;
  users: Array<{ id: string; isAdmin: boolean; profile_id: string | null; full_name: string | null; email: string | null }>;
  profilesList: Array<{ id: string; name: string }>;
}) {
  const u = users.find((x) => x.id === userId);
  const { data } = useQuery({
    queryKey: ["user-perms", userId],
    queryFn: async () => {
      if (!u || !u.profile_id) return { tabs: [], caps: [] };
      const [t, c] = await Promise.all([
        supabase.from("profile_tab_permissions").select("tab,can_view,can_edit").eq("profile_id", u.profile_id),
        supabase.from("profile_capabilities").select("capability,enabled").eq("profile_id", u.profile_id).eq("enabled", true),
      ]);
      return { tabs: t.data ?? [], caps: c.data ?? [] };
    },
  });

  if (!u) return null;
  const profileName = u.profile_id ? profilesList.find((p) => p.id === u.profile_id)?.name : null;

  return (
    <div className="mt-4 space-y-4 text-sm">
      <div>
        <div className="font-medium">{u.full_name ?? u.email}</div>
        <div className="text-xs text-muted-foreground">{u.email}</div>
      </div>
      {u.isAdmin ? (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
          <Shield className="inline h-3.5 w-3.5 mr-1" /> <strong>Administrador</strong> — acesso total a todas as abas e capacidades.
        </div>
      ) : !u.profile_id ? (
        <div className="text-sm text-muted-foreground">Sem perfil atribuído. Sem acesso a nenhuma aba.</div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">Perfil: <strong className="text-foreground">{profileName}</strong></div>
          <div>
            <div className="text-xs font-medium uppercase mb-2">Áreas</div>
            {(data?.tabs ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">Sem áreas atribuídas.</div>
            ) : (
              <div className="space-y-1">
                {(data?.tabs ?? []).map((t: any) => (
                  <div key={t.tab} className="flex items-center justify-between border rounded px-2 py-1.5 text-xs">
                    <span>{TAB_LABEL[t.tab] ?? t.tab}</span>
                    <span className="flex gap-1">
                      {t.can_view && <Badge variant="secondary" className="text-[10px]">Ver</Badge>}
                      {t.can_edit && <Badge variant="default" className="text-[10px]">Editar</Badge>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-medium uppercase mb-2">Capacidades</div>
            {(data?.caps ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">Sem capacidades especiais.</div>
            ) : (
              <ul className="space-y-1 text-xs">
                {(data?.caps ?? []).map((c: any) => (
                  <li key={c.capability} className="border rounded px-2 py-1.5">{CAP_LABEL[c.capability] ?? c.capability}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
