import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  longDateLabel,
  monthLabel,
  parseISODate,
  shortDateLabel,
  toISODate,
} from '../../utils/dates';

const CAL_DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Shared month math + open/close behavior for the dropdown calendar.
 * The popup must render OUTSIDE the scrollable .daytabs (which clips
 * overflow) but INSIDE .cal-anchor (position:relative) — so the hook owns
 * state and each page keeps that anchor structure. See .cal-* in sinog.css.
 */
export function useCalendarDropdown(value: string) {
  const [open, setOpen] = useState(false);
  const { y: vy, m: vm } = parseISODate(value);
  const [cursor, setCursor] = useState({ y: vy, m: vm });
  const ref = useRef<HTMLDivElement>(null);

  const cells = useMemo(() => {
    const firstDow = new Date(cursor.y, cursor.m, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(toISODate(cursor.y, cursor.m, d));
    return out;
  }, [cursor]);

  const openToggle = () => {
    const { y, m } = parseISODate(value);
    setCursor({ y, m });
    setOpen((o) => !o);
  };

  const stepMonth = (dir: 1 | -1) => {
    setCursor((c) => {
      const next = new Date(c.y, c.m + dir, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  return { open, setOpen, cursor, cells, openToggle, stepMonth, ref };
}

export function CalendarToggleButton({
  value,
  active,
  open,
  onClick,
  idleLabel = 'CALENDAR',
}: {
  value: string;
  active?: boolean;
  open?: boolean;
  onClick: () => void;
  idleLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`daytab cal-toggle${active ? ' sel' : ''}${open ? ' open' : ''}`}
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Pick a date from calendar"
    >
      <CalendarDays size={14} strokeWidth={2.5} />
      {active ? shortDateLabel(value) : idleLabel}
    </button>
  );
}

export function CalendarPopup({
  value,
  min,
  cursor,
  cells,
  onStep,
  onPick,
}: {
  value: string;
  min?: string;
  cursor: { y: number; m: number };
  cells: (string | null)[];
  onStep: (dir: 1 | -1) => void;
  onPick: (iso: string) => void;
}) {
  return (
    <div className="cal-pop" role="dialog" aria-label="Choose a date">
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => onStep(-1)} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <strong>{monthLabel(cursor.y, cursor.m)}</strong>
        <button type="button" className="cal-nav" onClick={() => onStep(1)} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="cal-grid cal-dow-row">
        {CAL_DOW.map((w, i) => (
          <span key={i} className="cal-dow">
            {w}
          </span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((iso, i) =>
          iso === null ? (
            <span key={`blank-${i}`} />
          ) : (
            <button
              key={iso}
              type="button"
              disabled={min != null && iso < min}
              className={`cal-day${iso === value ? ' sel' : ''}${min != null && iso === min ? ' today' : ''}`}
              onClick={() => onPick(iso)}
            >
              {Number(iso.slice(8, 10))}
            </button>
          ),
        )}
      </div>
      <div className="cal-foot">
        <span className="small muted">{longDateLabel(value)}</span>
        {min != null && (
          <button type="button" className="chip sel" onClick={() => onPick(min)}>
            Today
          </button>
        )}
      </div>
    </div>
  );
}
