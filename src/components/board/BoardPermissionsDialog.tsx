import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Users as UsersIcon, UserCog } from "lucide-react";

type PermissionProfile = { id: string; name: string; description: string | null };
type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  isAdmin: boolean;
};
type UserAccess = "inherit" | "allow" | "deny";

export function BoardPermissionsDialog({
  boardId, boardName, open, onOpenChange,
}: {
  boardId: string;
  boardName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [profiles, setProfiles] = useState<PermissionProfile[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());

  const [users, setUsers] = useState<UserRow[]>([]);
  const [userAccess, setUserAccess] = useState<Record<string, UserAccess>>({});

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [pRes, accRes, uaRes, profilesRes, rolesRes] = await Promise.all([
        supabase.from("permission_profiles").select("id,name,description").order("name"),
        supabase.from("board_profile_access").select("profile_id").eq("board_id", boardId),
        supabase.from("board_user_access").select("user_id,access").eq("board_id", boardId),
        supabase.from("profiles").select("id,full_name,email,status").order("full_name"),
        supabase.from("user_roles").select("user_id,role").eq("role", "admin"),
      ]);

      setProfiles((pRes.data ?? []) as PermissionProfile[]);
      setSelectedProfiles(new Set(((accRes.data ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id)));

      const adminSet = new Set(((rolesRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
      const allUsers: UserRow[] = (profilesRes.data ?? [])
        .filter((u) => u.status === "approved")
        .map((u) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          status: u.status,
          isAdmin: adminSet.has(u.id),
        }));
      setUsers(allUsers);

      const ua: Record<string, UserAccess> = {};
      ((uaRes.data ?? []) as Array<{ user_id: string; access: "allow" | "deny" }>).forEach((r) => {
        ua[r.user_id] = r.access;
      });
      setUserAccess(ua);
    })();
  }, [open, boardId]);

  const toggleProfile = (id: string) => {
    const next = new Set(selectedProfiles);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedProfiles(next);
  };

  const setUA = (userId: string, access: UserAccess) => {
    setUserAccess((prev) => ({ ...prev, [userId]: access }));
  };

  const save = async () => {
    setSaving(true);

    // 1) Perfis
    const { error: delErr } = await supabase.from("board_profile_access")
      .delete().eq("board_id", boardId);
    if (delErr) { toast.error(delErr.message); setSaving(false); return; }
    if (selectedProfiles.size > 0) {
      const rows = Array.from(selectedProfiles).map((profile_id) => ({ board_id: boardId, profile_id }));
      const { error } = await supabase.from("board_profile_access").insert(rows as never);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    // 2) Usuários — limpar e reinserir só allow/deny (inherit = nenhuma linha)
    const { error: delUaErr } = await supabase.from("board_user_access")
      .delete().eq("board_id", boardId);
    if (delUaErr) { toast.error(delUaErr.message); setSaving(false); return; }
    const uaRows = Object.entries(userAccess)
      .filter(([, v]) => v === "allow" || v === "deny")
      .map(([user_id, access]) => ({ board_id: boardId, user_id, access }));
    if (uaRows.length > 0) {
      const { error } = await supabase.from("board_user_access").insert(uaRows as never);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    toast.success("Permissões salvas");
    setSaving(false);
    onOpenChange(false);
  };

  const allowCount = Object.values(userAccess).filter((v) => v === "allow").length;
  const denyCount = Object.values(userAccess).filter((v) => v === "deny").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> Permissões de "{boardName}"
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profiles">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profiles">
              <UserCog className="h-4 w-4 mr-2" /> Por perfil ({selectedProfiles.size})
            </TabsTrigger>
            <TabsTrigger value="users">
              <UsersIcon className="h-4 w-4 mr-2" /> Por usuário ({allowCount + denyCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Selecione os perfis que podem ver esta esteira. Sem nenhum perfil ou usuário marcado,
              todos com acesso à área de Esteiras a verão. Admins sempre veem tudo.
            </p>
            <div className="rounded-lg border divide-y max-h-[50vh] overflow-y-auto">
              {profiles.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  Nenhum perfil criado. Crie perfis em Configurações → Perfis.
                </div>
              ) : profiles.map((p) => (
                <label key={p.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30">
                  <Checkbox checked={selectedProfiles.has(p.id)} onCheckedChange={() => toggleProfile(p.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-muted-foreground truncate">{p.description}</div>}
                  </div>
                </label>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Permita ou bloqueie usuários individualmente. <strong>Bloquear</strong> sempre vence,
              mesmo que o perfil libere. <strong>Herdar</strong> mantém o comportamento do perfil.
            </p>
            <div className="rounded-lg border divide-y max-h-[50vh] overflow-y-auto">
              {users.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">Nenhum usuário aprovado.</div>
              ) : users.map((u) => {
                const current = userAccess[u.id] ?? "inherit";
                return (
                  <div key={u.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {u.full_name ?? u.email ?? "—"}
                        {u.isAdmin && <Badge variant="secondary" className="text-[10px] h-4">admin</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                    {u.isAdmin ? (
                      <span className="text-xs text-muted-foreground">sempre vê</span>
                    ) : (
                      <Select value={current} onValueChange={(v) => setUA(u.id, v as UserAccess)}>
                        <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">Herdar</SelectItem>
                          <SelectItem value="allow">Permitir</SelectItem>
                          <SelectItem value="deny">Bloquear</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
