import type { ReactNode } from 'react';
import { Button } from '../ui/button';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <p className="small">
        <b style={{ color: 'var(--ink)' }}>{title}</b>
        <br />
        {body}
      </p>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: 'grid', gap: 12, padding: '12px 0' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="skel" style={{ width: 44, height: 44, borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'grid', gap: 6 }}>
            <div className="skel" style={{ width: '45%' }} />
            <div className="skel" style={{ width: '70%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load that.",
  body = 'Check your connection and try again.',
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty" role="alert">
      <p className="small">
        <b style={{ color: 'var(--ink)' }}>{title}</b>
        <br />
        {body}
      </p>
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <Button variant="line" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
