import { Component, type ErrorInfo, type ReactNode } from "react";

export interface BoardFailureDiagnostic {
  code: "board-render-failed";
  errorType: string;
}

interface BoardErrorBoundaryProps {
  children: ReactNode;
  onFailure: (diagnostic: BoardFailureDiagnostic) => void;
  onReturnToWorkspace: () => void;
}

interface BoardErrorBoundaryState {
  diagnostic: BoardFailureDiagnostic | null;
}

function diagnosticFor(error: unknown): BoardFailureDiagnostic {
  return {
    code: "board-render-failed",
    errorType: error instanceof Error ? error.name : "UnknownError",
  };
}

export class BoardErrorBoundary extends Component<
  BoardErrorBoundaryProps,
  BoardErrorBoundaryState
> {
  state: BoardErrorBoundaryState = { diagnostic: null };

  static getDerivedStateFromError(error: unknown): BoardErrorBoundaryState {
    return { diagnostic: diagnosticFor(error) };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    this.props.onFailure(diagnosticFor(error));
  }

  render(): ReactNode {
    const { diagnostic } = this.state;
    if (!diagnostic) return this.props.children;

    return (
      <section className="board-error" role="alert" aria-labelledby="board-error-title">
        <h2 id="board-error-title">Board Mode unavailable</h2>
        <p>Your workspace and agent session are still running.</p>
        <button type="button" onClick={this.props.onReturnToWorkspace}>
          Return to Workspace
        </button>
        <details>
          <summary>Diagnostic</summary>
          <code>{`${diagnostic.code}:${diagnostic.errorType}`}</code>
        </details>
      </section>
    );
  }
}
