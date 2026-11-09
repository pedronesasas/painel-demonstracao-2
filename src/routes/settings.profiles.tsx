import { createFileRoute } from "@tanstack/react-router";
import { ProfilesSettings } from "@/components/settings/ProfilesSettings";

export const Route = createFileRoute("/settings/profiles")({
  head: () => ({
    meta: [
      { title: "Perfis — NEXUS" },
      { name: "description", content: "Perfis de permissão." },
      { property: "og:title", content: "Perfis — NEXUS" },
      { property: "og:description", content: "Perfis de permissão." },
    ],
  }),
  component: ProfilesSettings,
});
