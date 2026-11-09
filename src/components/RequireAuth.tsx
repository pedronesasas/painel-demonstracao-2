import { useAuth } from "@/lib/auth";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, status } = useAuth();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      if (currentPath !== "/auth") navigate({ to: "/auth", search: { next: undefined }, replace: true });
      return;
    }
    if (status && status !== "approved" && currentPath !== "/pending") {
      navigate({
        to: "/pending",
        search: { status },
        replace: true,
      });
    }
  }, [loading, isAuthenticated, status, navigate, currentPath]);

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

  return <>{children}</>;
}
