import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Plus, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

type Doc = {
  id: string; parent_id: string | null; title: string; icon: string | null;
  cover_color: string | null; updated_at: string;
};

export function DocumentsLandingPage() {
  const { canEditTab, user } = useAuth();
  const canCreate = canEditTab("documents" as never);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: docs = [] } = useQuery({
    queryKey: ["documents-landing"],
    queryFn: async () => {
      const { data } = await supabase.from("documents")
        .select("id,parent_id,title,icon,cover_color,updated_at")
        .is("parent_id", null)
        .order("position")
        .range(0, 999);
      return (data ?? []) as Doc[];
    },
    staleTime: 30_000,
  });

  const createDoc = async () => {
    if (!canCreate) { toast.error("Sem permissão"); return; }
    const { data, error } = await supabase.from("documents").insert({
      title: "Sem título",
      created_by: user?.id,
      updated_by: user?.id,
      position: docs.length,
    } as never).select("id").maybeSingle();
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["documents-landing"] });
    qc.invalidateQueries({ queryKey: ["sidebar-docs"] });
    const created = data as { id: string } | null;
    if (created?.id) navigate({ to: "/documents/$docId", params: { docId: created.id } });
  };

  return (
    <div className="mx-auto max-w-3xl px-6 md:px-12 py-10 md:py-14 space-y-8">
      <PageHeader
        title="Documentos"
        description="Organize páginas, anotações e bases de conhecimento com subpáginas."
        actions={canCreate && (
          <Button onClick={createDoc}>
            <Plus className="h-4 w-4" /> Nova página
          </Button>
        )}
      />

      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma página ainda"
          description={canCreate ? "Crie sua primeira página para começar uma base de conhecimento." : "Aguarde alguém com permissão criar a primeira página."}
          action={canCreate ? (
            <Button onClick={createDoc}><Plus className="h-4 w-4" /> Criar primeira página</Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Páginas raiz
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {docs.map((d) => (
              <Link key={d.id} to="/documents/$docId" params={{ docId: d.id }}>
                <div className="group relative overflow-hidden rounded-xl border border-border/40 bg-card/40 hover:bg-accent/30 hover:border-border transition cursor-pointer">
                  <div
                    className="h-1.5 w-full"
                    style={{
                      background: `linear-gradient(90deg, ${d.cover_color ?? "var(--primary)"}, color-mix(in oklab, ${d.cover_color ?? "var(--primary)"} 30%, transparent))`,
                    }}
                  />
                  <div className="p-4 flex items-start gap-3">
                    <div className="text-2xl shrink-0">{d.icon ?? "📄"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate group-hover:text-primary transition">{d.title || "Sem título"}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Atualizada em {new Date(d.updated_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition mt-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
