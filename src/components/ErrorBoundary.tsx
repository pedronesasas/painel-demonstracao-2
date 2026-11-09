import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Algo deu errado
            </h1>
            <p className="text-sm text-muted-foreground break-words">
              {this.state.error.message || "Ocorreu um erro inesperado na aplicação."}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button onClick={this.reset}>Tentar novamente</Button>
              <Button variant="outline" onClick={() => { window.location.href = "/"; }}>
                Voltar ao início
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
