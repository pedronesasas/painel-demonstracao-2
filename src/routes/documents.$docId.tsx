import { createFileRoute, useParams } from "@tanstack/react-router";
import { DocumentPage } from "@/components/documents/DocumentPage";

export const Route = createFileRoute("/documents/$docId")({
  head: () => ({
    meta: [
      { title: "Documento — NEXUS" },
      { name: "description", content: "Página de documento." },
      { property: "og:title", content: "Documento — NEXUS" },
      { property: "og:description", content: "Página de documento." },
    ],
  }),
  component: DocRoute,
});

function DocRoute() {
  const { docId } = useParams({ from: "/documents/$docId" });
  return <DocumentPage docId={docId} />;
}
