import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { FunisHome } from "@/components/funil/FunisHome";

export const Route = createFileRoute("/funis/")({
  head: () => ({
    meta: [
      { title: "Funis — NEXUS" },
      { name: "description", content: "Funis por oferta: língua, front-end e back-end, etapas e testes." },
      { property: "og:title", content: "Funis — NEXUS" },
      { property: "og:description", content: "Funis por oferta, com etapas e testes." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="funnels">
      <AppLayout>
        <FunisHome />
      </AppLayout>
    </RequireTabAccess>
  ),
});
