import { createFileRoute } from "@tanstack/react-router";
import { ColumnKindsSettings } from "@/components/settings/ColumnKindsSettings";

export const Route = createFileRoute("/settings/column-kinds")({
  component: ColumnKindsSettings,
});
