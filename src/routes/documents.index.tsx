import { createFileRoute } from "@tanstack/react-router";
import { DocumentsLandingPage } from "@/components/documents/DocumentsLandingPage";

export const Route = createFileRoute("/documents/")({
  head: () => ({
    meta: [
      { title: "Documentos — NEXUS" },
      { name: "description", content: "Wiki e documentos da operação." },
      { property: "og:title", content: "Documentos — NEXUS" },
      { property: "og:description", content: "Wiki e documentos da operação." },
    ],
  }),
  component: DocumentsLandingPage,
});
