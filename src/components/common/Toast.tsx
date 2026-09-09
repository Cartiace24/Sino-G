import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastCtx {
  toast: (msg: string) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => undefined });

/**
 * Toast messages legitimately contain <b> and <br/> for emphasis, but several
 * call sites interpolate user-controlled text (group names) and raw backend
 * errors. Escape everything first, then restore only those two tags, so a
 * crafted name can never inject markup or scripts.
 */
function sanitizeToastHtml(raw: string): string {
  const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/&lt;(b|br)(\s*\/?)&gt;/gi, '<$1$2>')
    .replace(/&lt;\/b&gt;/gi, '</b>');
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setVisible(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), 2600);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className={`toast${visible ? ' show' : ''}`}
        role="status"
        aria-live="polite"
        dangerouslySetInnerHTML={{ __html: sanitizeToastHtml(msg) }}
      />
    </Ctx.Provider>
  );
}

export function useToast(): (msg: string) => void {
  return useContext(Ctx).toast;
}
