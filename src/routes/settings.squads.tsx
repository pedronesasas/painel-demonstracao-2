import { createFileRoute } from "@tanstack/react-router";
import { SquadsSettings } from "@/components/settings/SquadsSettings";

export const Route = createFileRoute("/settings/squads")({
  head: () => ({
    meta: [
      { title: "Squads — NEXUS" },
      { name: "description", content: "Grupos de responsáveis por card." },
      { property: "og:title", content: "Squads — NEXUS" },
      { property: "og:description", content: "Grupos de responsáveis por card." },
    ],
  }),
  component: SquadsSettings,
});
