import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Configurações — NEXUS" },
      { name: "description", content: "Configurações do sistema." },
      { property: "og:title", content: "Configurações — NEXUS" },
      { property: "og:description", content: "Configurações do sistema." },
    ],
  }),
  component: SettingsLayout,
});

function SettingsLayout() {
  const loc = useLocation();
  const tabs = [
    { to: "/settings/profiles", label: "Perfis" },
    { to: "/settings/squads", label: "Squads" },
    { to: "/settings/tags", label: "Etiquetas" },
    { to: "/settings/custom-fields", label: "Campos personalizados" },
    { to: "/settings/column-kinds", label: "Tipos de coluna" },
  ];

  return (
    <RequireTabAccess tab="settings">
      <AppLayout>
        <div className="space-y-6">
          <PageHeader title="Configurações" />
          <div className="border-b flex gap-1">
            {tabs.map((t) => (
              <Link key={t.to} to={t.to} className={cn(
                "px-4 py-2 text-sm border-b-2 -mb-px",
                loc.pathname === t.to ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>{t.label}</Link>
            ))}
          </div>
          <Outlet />
        </div>
      </AppLayout>
    </RequireTabAccess>
  );
}
