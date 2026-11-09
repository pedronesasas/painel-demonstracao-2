import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth, type TabKey } from "@/lib/auth";

export function RequireTabAccess({ tab, children }: { tab: TabKey; children: ReactNode }) {
  const { loading, isAuthenticated, canViewTab, status } = useAuth();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      if (currentPath !== "/auth") navigate({ to: "/auth", search: { next: undefined }, replace: true });
      return;
    }
    if (status && status !== "approved") {
      if (currentPath !== "/pending") {
        navigate({ to: "/pending", search: { status }, replace: true });
      }
      return;
    }
    if (!canViewTab(tab) && currentPath !== "/") {
      navigate({ to: "/", replace: true });
    }
  }, [loading, isAuthenticated, status, tab, canViewTab, navigate, currentPath]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true" aria-live="polite">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-label="Carregando"
        />
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (status && status !== "approved") return null;
  if (!canViewTab(tab)) return null;
  return <>{children}</>;
}
