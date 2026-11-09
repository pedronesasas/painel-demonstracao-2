import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { FunnelPage } from "@/components/funil/FunnelPage";

// ?mercado=BR&etapa=back  (mercado = região do idioma na tela de Idiomas)
const searchSchema = z.object({
  mercado: z.string().max(10).optional().catch(undefined),
  etapa: z.enum(["front", "back"]).optional().catch(undefined),
});

export const Route = createFileRoute("/funis/$productId")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Funil — NEXUS" },
      { name: "description", content: "Funil da oferta por mercado e front/back: status, testes, páginas e fluxograma." },
      { property: "og:title", content: "Funil — NEXUS" },
      { property: "og:description", content: "Funil da oferta por mercado e front/back." },
    ],
  }),
  component: () => {
    const { productId } = Route.useParams();
    const { mercado, etapa } = Route.useSearch();
    return (
      <RequireTabAccess tab="funnels">
        <AppLayout>
          <FunnelPage
            productId={productId}
            region={mercado}
            stage={etapa === "back" ? "BACK" : etapa === "front" ? "FRONT" : undefined}
          />
        </AppLayout>
      </RequireTabAccess>
    );
  },
});
