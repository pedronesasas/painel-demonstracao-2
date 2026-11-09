import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, UserPlus, Users } from "lucide-react";
import { AssigneeStack } from "./AssigneeStack";
import { cn } from "@/lib/utils";
import { useProfiles } from "@/hooks/use-profiles";

export function AssigneesPicker({
  value,
  primaryId,
  onChange,
  onSetPrimary,
  disabled,
  compact,
}: {
  value: string[];
  primaryId: string | null;
  onChange: (next: string[]) => void;
  onSetPrimary: (userId: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { data: profiles = [] } = useProfiles();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const byId = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const p of profiles) m.set(p.id, { id: p.id, name: (p.full_name ?? p.email ?? "—").trim() });
    return m;
  }, [profiles]);

  const assignees = value.map((id) => byId.get(id) ?? { id, name: "?" });

  const filtered = profiles.filter((p) => {
    if (!search.trim()) return true;
    const hay = `${p.full_name ?? ""} ${p.email ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const toggle = (id: string, on: boolean) => {
    if (on) onChange([...value, id]);
    else onChange(value.filter((x) => x !== id));
  };

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border bg-background hover:bg-accent px-2 py-1 text-left",
            compact ? "h-7 text-xs" : "h-9 w-full text-sm",
            disabled && "opacity-60 cursor-not-allowed",
          )}
          aria-label="Editar responsáveis"
        >
          {assignees.length > 0 ? (
            <>
              <AssigneeStack assignees={assignees} primaryId={primaryId} size={compact ? "xs" : "sm"} max={3} />
              <span className="text-muted-foreground text-xs truncate">
                {assignees.length === 1 ? assignees[0].name : `${assignees.length} responsáveis`}
              </span>
            </>
          ) : (
            <>
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground text-xs">Sem responsável</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2 space-y-2">
        <div className="flex items-center gap-2">
          <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pessoa..."
            className="h-8 text-sm"
          />
        </div>
        {value.length > 0 && (
          <div className="border rounded-md p-1.5 space-y-0.5 max-h-32 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pb-1">Selecionados</div>
            {value.map((id) => {
              const p = byId.get(id);
              const isPrimary = id === primaryId;
              return (
                <div key={id} className="flex items-center gap-1.5 text-xs px-1 py-0.5">
                  <span className="flex-1 truncate">{p?.name ?? "?"}</span>
                  <button
                    type="button"
                    onClick={() => onSetPrimary(isPrimary ? null : id)}
                    title={isPrimary ? "Remover como principal" : "Tornar principal"}
                    className={cn(
                      "p-0.5 rounded hover:bg-accent",
                      isPrimary ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Star className={cn("h-3 w-3", isPrimary && "fill-current")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(id, false)}
                    className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive text-[14px] leading-none"
                    aria-label="Remover"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {filtered.map((p) => {
            const checked = value.includes(p.id);
            return (
              <label
                key={p.id}
                className="flex items-center gap-2 text-sm cursor-pointer px-1 py-1 rounded hover:bg-accent"
              >
                <Checkbox checked={checked} onCheckedChange={(v) => toggle(p.id, !!v)} />
                <span className="truncate flex-1">{p.full_name ?? p.email}</span>
                {p.id === primaryId && <Star className="h-3 w-3 text-primary fill-current" />}
              </label>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-xs text-muted-foreground italic px-1 py-2">Nenhuma pessoa encontrada</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
