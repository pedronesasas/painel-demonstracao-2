import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { DocumentsSidebar } from "@/components/documents/DocumentsSidebar";

export const Route = createFileRoute("/documents")({
  component: DocumentsLayout,
});

function DocumentsLayout() {
  return (
    <RequireTabAccess tab={"documents" as never}>
      <AppLayout fullBleed>
        <div className="flex h-screen bg-background">
          <DocumentsSidebar />
          <main className="flex-1 min-w-0 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </AppLayout>
    </RequireTabAccess>
  );
}
