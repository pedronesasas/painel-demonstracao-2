import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { ReportsPage } from "@/components/reports/ReportsPage";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Relatórios — NEXUS" },
      { name: "description", content: "Relatórios operacionais." },
      { property: "og:title", content: "Relatórios — NEXUS" },
      { property: "og:description", content: "Relatórios operacionais." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="reports">
      <AppLayout><ReportsPage /></AppLayout>
    </RequireTabAccess>
  ),
});
