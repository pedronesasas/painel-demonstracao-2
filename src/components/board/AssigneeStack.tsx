import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type AssigneeLite = { id: string; name: string };

function initials(name: string) {
  const s = (name || "?").trim();
  const parts = s.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || s[0]!.toUpperCase();
}

// Cor fixa por pessoa: hash do id escolhe um dos 8 tons de avatar
const TONES = ["bg-avatar-1", "bg-avatar-2", "bg-avatar-3", "bg-avatar-4", "bg-avatar-5", "bg-avatar-6", "bg-avatar-7", "bg-avatar-8"] as const;
function tone(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function AssigneeStack({
  assignees,
  primaryId,
  max = 3,
  size = "sm",
  className,
  ringClassName = "ring-background",
}: {
  assignees: AssigneeLite[];
  primaryId?: string | null;
  max?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
  /** Cor do anel que separa os avatares; use a cor da superfície (ex.: ring-card dentro de card) */
  ringClassName?: string;
}) {
  if (!assignees.length) return null;
  // Coloca o principal primeiro
  const sorted = [...assignees].sort((a, b) => {
    if (a.id === primaryId) return -1;
    if (b.id === primaryId) return 1;
    return 0;
  });
  const shown = sorted.slice(0, max);
  const extra = sorted.length - shown.length;
  const sizeCls = size === "xs" ? "h-5 w-5 text-[9px]" : size === "md" ? "h-7 w-7 text-xs" : "h-6 w-6 text-[10px]";
  return (
    <div className={cn("flex -space-x-1.5", className)} title={sorted.map((a) => a.name).join(", ")}>
      {shown.map((a) => (
        <Avatar
          key={a.id}
          className={cn(sizeCls, "ring-2", ringClassName, a.id === primaryId && "ring-primary")}
        >
          <AvatarFallback className={cn("font-semibold text-foreground", tone(a.id))}>
            {initials(a.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <Avatar className={cn(sizeCls, "ring-2", ringClassName)}>
          <AvatarFallback className="bg-muted text-muted-foreground">+{extra}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
