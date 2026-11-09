import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { BoardKanban } from "@/components/board/BoardKanban";

const searchSchema = z.object({
  card: z.string().optional(),
});

export const Route = createFileRoute("/boards/$boardId")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Esteira — NEXUS" },
      { name: "description", content: "Quadro Kanban da esteira." },
      { property: "og:title", content: "Esteira — NEXUS" },
      { property: "og:description", content: "Quadro Kanban da esteira." },
    ],
  }),
  component: () => {
    const { boardId } = Route.useParams();
    return (
      <RequireTabAccess tab="boards">
        <AppLayout fullBleed>
          {/* Largura total, igual a /funis: 53px = barra do topo no celular */}
          <div className="h-[calc(100dvh-53px)] md:h-dvh px-4 pt-4 md:px-6 md:pt-5">
            <BoardKanban boardId={boardId} />
          </div>
        </AppLayout>
      </RequireTabAccess>
    );
  },
});
