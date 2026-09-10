import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/button';

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn>(() => Promise.resolve(false));

export function useConfirm(): ConfirmFn {
  return useContext(Ctx);
}

/**
 * Brand-styled replacement for window.confirm (which is blocking,
 * unstyled, and ignores dark mode). Reuses the .pick-overlay/.pick-panel
 * bottom-sheet tokens. Backdrop click / Escape = cancel.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { id: number }) | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => undefined);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setState({ ...opts, id: Date.now() });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setState(null);
    resolver.current(value);
  }, []);

  useEffect(() => {
    if (!state) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, close]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="pick-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
        >
          <div
            className="pick-panel"
            role="alertdialog"
            aria-modal="true"
            aria-label={state.title}
            aria-describedby={state.body ? 'confirm-body' : undefined}
          >
            <span className="kicker" style={state.danger ? { color: 'var(--busy)' } : undefined}>
              {state.danger ? 'ARE YOU SURE?' : 'CONFIRM'}
            </span>
            <h3
              className="display md"
              style={{ marginTop: 8, fontSize: 'clamp(22px,4.5vw,30px)' }}
            >
              {state.title}
            </h3>
            {state.body && (
              <p id="confirm-body" className="small muted" style={{ marginTop: 8 }}>
                {state.body}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <Button variant="paper" size="block" onClick={() => close(false)}>
                {state.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                ref={confirmBtnRef as React.Ref<HTMLButtonElement>}
                variant={state.danger ? 'dark' : 'green'}
                size="block"
                onClick={() => close(true)}
                {...(state.danger ? { style: { background: 'var(--busy)', borderColor: 'var(--ink)', color: '#fff' } } : {})}
              >
                {state.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
