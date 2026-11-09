import { createFileRoute } from "@tanstack/react-router";
import { CustomFieldsSettings } from "@/components/settings/CustomFieldsSettings";

export const Route = createFileRoute("/settings/custom-fields")({
  head: () => ({
    meta: [
      { title: "Campos personalizados — NEXUS" },
      { name: "description", content: "Campos customizados das esteiras." },
      { property: "og:title", content: "Campos personalizados — NEXUS" },
      { property: "og:description", content: "Campos customizados das esteiras." },
    ],
  }),
  component: CustomFieldsSettings,
});
