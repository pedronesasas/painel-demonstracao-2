import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  // Botões à direita do título (filtros vão em children, abaixo, para não apertar o título)
  actions?: ReactNode;
  // Conteúdo extra abaixo do título (filtros, abas, avisos...)
  children?: ReactNode;
  className?: string;
  // "h2" para o título de uma aba dentro da página, abaixo do h1
  as?: "h1" | "h2";
}

// Cabeçalho padrão das páginas: título, descrição e ações à direita
export function PageHeader({ title, description, actions, children, className, as: Heading = "h1" }: PageHeaderProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <Heading className={cn("font-semibold tracking-tight text-foreground", Heading === "h1" ? "text-2xl" : "text-lg")}>{title}</Heading>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
