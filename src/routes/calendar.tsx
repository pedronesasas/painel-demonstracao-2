import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { CalendarPage } from "@/components/calendar/CalendarPage";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Agenda — NEXUS" },
      { name: "description", content: "Calendário de eventos e tarefas." },
      { property: "og:title", content: "Agenda — NEXUS" },
      { property: "og:description", content: "Calendário de eventos e tarefas." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="calendar">
      <AppLayout><CalendarPage /></AppLayout>
    </RequireTabAccess>
  ),
});
