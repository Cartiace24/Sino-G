import type { AvailabilityStatus } from '../../types/database.types';

const LABEL: Record<AvailabilityStatus, string> = { free: 'FREE', maybe: 'MAYBE', busy: 'BUSY' };

export function StatusDot({ status, showLabel = true }: { status: AvailabilityStatus; showLabel?: boolean }) {
  if (!showLabel) return <span className={`dot ${status}`} />;
  return (
    <span className={`statusline ${status}`}>
      <span className={`dot ${status}`} /> {LABEL[status]}
    </span>
  );
}
