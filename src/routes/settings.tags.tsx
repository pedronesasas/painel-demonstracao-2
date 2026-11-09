import { createFileRoute } from "@tanstack/react-router";
import { TagsSettings } from "@/components/settings/TagsSettings";

export const Route = createFileRoute("/settings/tags")({
  head: () => ({
    meta: [
      { title: "Tags — NEXUS" },
      { name: "description", content: "Gerenciar tags." },
      { property: "og:title", content: "Tags — NEXUS" },
      { property: "og:description", content: "Gerenciar tags." },
    ],
  }),
  component: TagsSettings,
});
