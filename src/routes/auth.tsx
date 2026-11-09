import { createFileRoute, redirect } from "@tanstack/react-router";

// Na demonstração não há login: quem abre já entra como administrador.
export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : (undefined as string | undefined),
  }),
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
