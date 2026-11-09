import { createFileRoute, redirect } from "@tanstack/react-router";

// Na demonstração não há login: quem abre já entra como administrador.
export const Route = createFileRoute("/pending")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
