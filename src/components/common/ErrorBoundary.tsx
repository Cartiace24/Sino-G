import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Clears a caught error whenever this changes (wired to the route path,
   *  so navigating away from a broken page recovers automatically). */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Global render-error boundary. Catches page/component crashes (including
 * failed lazy-chunk imports) that would otherwise white-screen the app, and
 * shows a Sino G-styled fallback instead. Technical details are never
 * rendered — they go to console.error for development only.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    console.error('[Sino G] Unhandled render error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    // Reuses existing auth-wrap/buttons/type: no new visual language.
    // Go Home is a full reload (plain href), which also recovers from
    // stale/failed chunk loads where in-app navigation cannot help.
    return (
      <div className="auth-wrap">
        <p className="kicker">SINO G</p>
        <h1 className="display lg">
          SOMETHING
          <br />
          BROKE.
        </h1>
        <p className="lede" style={{ margin: '12px 0 22px' }}>
          Don&apos;t worry — your groups and plans are safe. Try again, or head home.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <button className="btn btn-dark btn-block" onClick={this.retry}>
            Try Again
          </button>
          <a className="btn btn-line btn-block" href="/today">
            Go Home
          </a>
        </div>
      </div>
    );
  }
}
