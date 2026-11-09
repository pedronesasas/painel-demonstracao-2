import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "editor" | "viewer";

export type TabKey =
  | "dashboard" | "campaigns" | "products" | "import" | "compare" | "ranking"
  | "boards" | "funnels" | "calendar" | "reports" | "users" | "settings" | "documents" | "vsls" | "chips";

export type CapabilityKey =
  | "move_cards" | "create_board" | "create_column" | "manage_custom_fields"
  | "manage_calendar" | "manage_tags" | "view_reports" | "override_dependencies"
  | "manage_column_kinds" | "log_video_edit" | "manage_editor_targets" | "manage_squads";

export type TabAccess = Record<TabKey, { view: boolean; edit: boolean }>;

const ALL_TABS: TabKey[] = [
  "dashboard","campaigns","products","import","compare","ranking",
  "boards","funnels","calendar","reports","users","settings","documents","vsls","chips",
];


const emptyTabAccess = (): TabAccess => {
  const o = {} as TabAccess;
  for (const t of ALL_TABS) o[t] = { view: false, edit: false };
  return o;
};

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  capabilities: Set<CapabilityKey>;
  tabAccess: TabAccess;
  loading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: AppRole) => boolean;
  hasCapability: (cap: CapabilityKey) => boolean;
  canViewTab: (tab: TabKey) => boolean;
  canEditTab: (tab: TabKey) => boolean;
  canEdit: boolean;
  isAdmin: boolean;
  status: string | null;
  isApproved: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, next?: string) => Promise<{ error: string | null; pending?: boolean }>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [capabilities, setCapabilities] = useState<Set<CapabilityKey>>(new Set());
  const [tabAccess, setTabAccess] = useState<TabAccess>(emptyTabAccess());
  const [status, setStatus] = useState<string | null>(null);
  // getSession() já respondeu (sabemos se há sessão ou não)
  const [sessionChecked, setSessionChecked] = useState(false);
  // uid cujas permissões (roles/status/abas) já estão no estado
  const [loadedUid, setLoadedUid] = useState<string | null>(null);

  const signingOutRef = useRef(false);
  const loadGenRef = useRef(0);

  // Busca roles/status/abas do uid; só grava enquanto for a carga mais recente
  const fetchUserData = async (uid: string | undefined, isCurrent: () => boolean) => {
    if (!uid) {
      if (!isCurrent()) return;
      setRoles([]); setStatus(null);
      setCapabilities(new Set()); setTabAccess(emptyTabAccess());
      signingOutRef.current = false;
      return;
    }
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("status, profile_id").eq("id", uid).maybeSingle(),
    ]);
    if (!isCurrent()) return;
    const userRoles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
    setRoles(userRoles);
    const userStatus = (profileRes.data?.status as string) ?? null;
    setStatus(userStatus);

    if (userStatus && userStatus !== "approved") {
      // Não fazemos signOut silencioso aqui — deixamos a UI redirecionar para /pending
      // para que o usuário veja uma mensagem clara em vez de apenas voltar ao login.
      if (!isCurrent()) return;
      setCapabilities(new Set());
      setTabAccess(emptyTabAccess());
      return;
    }

    const isAdminUser = userRoles.includes("admin");
    const profileId = (profileRes.data as { profile_id?: string | null } | null)?.profile_id ?? null;

    if (isAdminUser) {
      if (!isCurrent()) return;
      const acc = emptyTabAccess();
      for (const t of ALL_TABS) acc[t] = { view: true, edit: true };
      setTabAccess(acc);
      setCapabilities(new Set());
    } else if (profileId) {
      const [tpRes, pcRes] = await Promise.all([
        supabase.from("profile_tab_permissions").select("tab,can_view,can_edit").eq("profile_id", profileId),
        supabase.from("profile_capabilities").select("capability,enabled").eq("profile_id", profileId).eq("enabled", true),
      ]);
      if (!isCurrent()) return;
      const acc = emptyTabAccess();
      for (const r of (tpRes.data ?? []) as Array<{ tab: TabKey; can_view: boolean; can_edit: boolean }>) {
        acc[r.tab] = { view: r.can_view, edit: r.can_edit };
      }
      setTabAccess(acc);
      const caps = new Set<CapabilityKey>();
      for (const r of (pcRes.data ?? []) as Array<{ capability: CapabilityKey }>) caps.add(r.capability);
      setCapabilities(caps);
    } else {
      if (!isCurrent()) return;
      setCapabilities(new Set());
      setTabAccess(emptyTabAccess());
    }
  };

  // Carrega e marca o uid como carregado, mesmo com erro (senão o spinner não sai)
  const loadUserData = async (uid: string | undefined) => {
    const gen = ++loadGenRef.current;
    const isCurrent = () => loadGenRef.current === gen;
    try {
      await fetchUserData(uid, isCurrent);
    } catch (err) {
      console.error("[auth] falha ao carregar permissões", err);
      if (isCurrent()) {
        setRoles([]); setStatus(null);
        setCapabilities(new Set()); setTabAccess(emptyTabAccess());
      }
    } finally {
      if (isCurrent()) setLoadedUid(uid ?? null);
    }
  };

  // uid cuja carga já foi disparada (dedupe); "carregado" de fato é loadedUid
  const lastLoadedUidRef = useRef<string | null>(null);

  useEffect(() => {
    const maybeLoad = (uid: string | undefined) => {
      const next = uid ?? null;
      if (lastLoadedUidRef.current === next) return;
      lastLoadedUidRef.current = next;
      void loadUserData(uid);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setTimeout(() => maybeLoad(newSession?.user?.id), 0);
    });
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        setUser(s?.user ?? null);
        // Não libera loading aqui: ele só cai quando as permissões desse uid chegarem
        maybeLoad(s?.user?.id);
      })
      .finally(() => setSessionChecked(true));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Carregando até saber a sessão e ter as permissões DESSE uid (F5, login, troca de conta).
  // TOKEN_REFRESHED mantém o uid, então não pisca spinner.
  const sessionUid = session?.user?.id ?? null;
  const loading = !sessionChecked || (sessionUid !== null && loadedUid !== sessionUid);

  const isAdmin = roles.includes("admin");

  const value: AuthContextValue = {
    session, user, roles, capabilities, tabAccess, status, loading,
    isAuthenticated: !!session,
    isApproved: status === "approved",
    hasRole: (r) => roles.includes(r),
    hasCapability: (c) => isAdmin || capabilities.has(c),
    canViewTab: (t) => isAdmin || tabAccess[t]?.view,
    canEditTab: (t) => isAdmin || tabAccess[t]?.edit,
    canEdit: isAdmin || roles.includes("editor"),
    isAdmin,
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      if (data.user) {
        const { data: st } = await supabase.rpc("get_user_status", { _user_id: data.user.id });
        if (st && st !== "approved") {
          // Mantém a sessão para que /pending possa exibir a mensagem dedicada.
          // O guard de rota redireciona para /pending automaticamente.
          return { error: null };
        }
      }
      return { error: null };
    },
    signUp: async (email, password, fullName, next) => {
      const redirectBase = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: `${redirectBase}${next && next.startsWith("/") && !next.startsWith("//") ? next : "/"}`,
          data: { full_name: fullName },
        },
      });
      if (error) return { error: error.message };
      await supabase.auth.signOut();
      return { error: null, pending: true };
    },
    signOut: async () => { await supabase.auth.signOut(); },
    // Último uid pedido: não atropela a carga de uma troca de conta em andamento
    refreshRoles: async () => loadUserData(lastLoadedUidRef.current ?? undefined),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useCapability(cap: CapabilityKey) {
  return useAuth().hasCapability(cap);
}
export function useTabAccess(tab: TabKey) {
  const a = useAuth();
  return { canView: a.canViewTab(tab), canEdit: a.canEditTab(tab) };
}
