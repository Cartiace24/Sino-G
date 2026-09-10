import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyAvailability } from '../../hooks/useAvailability';
import { longDateLabel, nextDays, todayISO } from '../../utils/dates';
import {
  CalendarPopup,
  CalendarToggleButton,
  useCalendarDropdown,
} from '../../components/common/CalendarDropdown';
import { availabilityService, validateAvailabilityInput } from '../../services/availability.service';
import { friendlyError } from '../../utils/errors';
import { formatTimeInputToLabel } from '../../utils/availability-calculator';
import { qk } from '../../lib/queryClient';
import { StatusDot } from '../../components/common/StatusDot';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { useToast } from '../../components/common/Toast';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';
import type { AvailabilityStatus } from '../../types/database.types';

const STATUS_META: { value: AvailabilityStatus; hint: string }[] = [
  { value: 'free', hint: "I'm in" },
  { value: 'maybe', hint: 'Depends' },
  { value: 'busy', hint: "Can't" },
];

export function Availability() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const days = useMemo(() => nextDays(14), []);

  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState<AvailabilityStatus>('free');
  const [from, setFrom] = useState('18:00');
  const [until, setUntil] = useState('22:00');
  const [error, setError] = useState<string | null>(null);
  // When set, the form edits this row instead of inserting a new one.
  const [editingId, setEditingId] = useState<string | null>(null);

  const fromISO = todayISO(-1);
  const toISO = todayISO(30);
  const mineQ = useMyAvailability(user?.id, fromISO, toISO);
  const mine = mineQ.data ?? [];
  const todayIso = todayISO();
  const cal = useCalendarDropdown(date);
  const isCustomDate = !days.some((d) => d.iso === date);
  const dayLabel = days.find((d) => d.iso === date)?.label ?? longDateLabel(date);

  const invalidate = () => {
    if (!user) return;
    qc.invalidateQueries({ queryKey: qk.myAvailability(user.id, fromISO, toISO) });
    qc.invalidateQueries({ queryKey: ['group-availability'] });
    qc.invalidateQueries({ queryKey: ['tonight', user.id] });
    qc.invalidateQueries({ queryKey: ['best-upcoming'] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      availabilityService.save(user!.id, { date, start_time: from, end_time: until, status }),
    onSuccess: () => {
      setError(null);
      invalidate();
      toast(`<b>Saved.</b> ${dayLabel} · ${status.toUpperCase()} · ${formatTimeInputToLabel(from)}–${formatTimeInputToLabel(until)}`);
    },
    onError: (err) => setError(friendlyError(err, 'Could not save. Try again.')),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => availabilityService.remove(id),
    onSuccess: (_d, id) => {
      if (id === editingId) cancelEdit();
      invalidate();
      toast('Removed.');
    },
    onError: (err) => toast(friendlyError(err, 'Could not remove that.')),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      availabilityService.update(editingId!, { date, start_time: from, end_time: until, status }),
    onSuccess: () => {
      setError(null);
      setEditingId(null);
      invalidate();
      toast('<b>Updated.</b> Your availability is current.');
    },
    onError: (err) => setError(friendlyError(err, 'Could not save. Try again.')),
  });

  const startEdit = (row: { id: string; date: string; start_time: string; end_time: string; status: AvailabilityStatus }) => {
    setEditingId(row.id);
    setDate(row.date);
    setStatus(row.status);
    setFrom(row.start_time.slice(0, 5));
    setUntil(row.end_time.slice(0, 5));
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const onSave = () => {
    const bad = validateAvailabilityInput({ date, start_time: from, end_time: until, status });
    if (bad) {
      setError(bad);
      return;
    }
    if (editingId) updateMut.mutate();
    else saveMut.mutate();
  };

  const upcoming = mine.filter((r) => r.date >= todayISO());

  return (
    <>
      <p className="kicker" style={{ marginTop: 14 }}>
        TAKES ~20 SECONDS
      </p>
      <h1 className="display lg">
        MY<br />
        AVAIL<span style={{ background: 'var(--green)', borderRadius: 6, padding: '0 .1em' }}>ABILITY.</span>
      </h1>

      <div className="weekstrip" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.slice(0, 7).map((d) => {
          const has = mine.some((r) => r.date === d.iso && r.status === 'free');
          const maybe = !has && mine.some((r) => r.date === d.iso);
          return (
            <button key={d.iso} className={`day${d.iso === date ? ' sel' : ''}`} onClick={() => setDate(d.iso)}>
              <b>{d.dow}</b>
              <strong>{d.num}</strong>
              <span className={`dot ${has ? 'free' : maybe ? 'maybe' : 'busy'}`} style={{ opacity: has || maybe ? 1 : 0.25 }} />
            </button>
          );
        })}
      </div>
      <div className="cal-anchor" ref={cal.ref}>
        <div className="daytabs">
          {days.slice(7).map((d) => (
            <button key={d.iso} className={`daytab${d.iso === date ? ' sel' : ''}`} onClick={() => setDate(d.iso)}>
              {d.dow} {d.num}
            </button>
          ))}
          <CalendarToggleButton value={date} active={isCustomDate} open={cal.open} onClick={cal.openToggle} />
        </div>
        {cal.open && (
          <CalendarPopup
            value={date}
            min={todayIso}
            cursor={cal.cursor}
            cells={cal.cells}
            onStep={cal.stepMonth}
            onPick={(iso) => {
              setDate(iso);
              cal.setOpen(false);
            }}
          />
        )}
      </div>

      <hr className="rule" />
      <p className="kicker">{dayLabel}</p>
      <h2 className="display md" style={{ marginTop: 6 }}>
        HOW AVAILABLE ARE YOU?
      </h2>
      <div className="seg3">
        {STATUS_META.map((s) => (
          <button
            key={s.value}
            className={`seg${status === s.value ? ` on-${s.value}` : ''}`}
            onClick={() => setStatus(s.value)}
          >
            <span className={`dot ${s.value}`} />
            {s.value.toUpperCase()}
            <small>{s.hint}</small>
          </button>
        ))}
      </div>

      <div className="timegrid" style={{ marginTop: 14 }}>
        <div>
          <Label htmlFor="from">From</Label>
          <Input id="from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="until">Until</Label>
          <Input id="until" type="time" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
      </div>

      <FieldError message={error} />
      <div style={{ position: 'sticky', bottom: 84, marginTop: 20 }}>
        <Button variant="green" size="bigBlock" className="btn-chunk" onClick={onSave} disabled={saveMut.isPending || updateMut.isPending}>
          {editingId ? (updateMut.isPending ? 'Saving…' : 'Save changes') : saveMut.isPending ? 'Saving…' : 'Save availability'}
        </Button>
        {editingId && (
          <Button variant="paper" size="block" onClick={cancelEdit} style={{ marginTop: 10 }}>
            Cancel editing
          </Button>
        )}
      </div>

      <hr className="rule" />
      <span className="kicker">MY UPCOMING · {upcoming.length}</span>
      {mineQ.isLoading ? (
        <LoadingRows rows={3} />
      ) : upcoming.length === 0 ? (
        <div style={{ marginTop: 10 }}>
          <EmptyState icon={null} title="Nothing marked yet." body="Add your first window above — 20 seconds." />
        </div>
      ) : (
        <div className="rows" style={{ marginTop: 8 }}>
          {upcoming.map((r) => (
            <div className="member-row" key={r.id}>
              <span className="who">
                <strong>
                  {new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </strong>
                <small>
                  {formatTimeInputToLabel(r.start_time.slice(0, 5))} – {formatTimeInputToLabel(r.end_time.slice(0, 5))}
                </small>
              </span>
              <span className="right">
                <StatusDot status={r.status} />
                <button
                  aria-label="Edit availability"
                  onClick={() => startEdit(r)}
                  style={{ color: editingId === r.id ? 'var(--ink)' : 'var(--muted)', display: 'grid', placeItems: 'center' }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label="Delete availability"
                  onClick={() => delMut.mutate(r.id)}
                  style={{ color: 'var(--muted)', display: 'grid', placeItems: 'center' }}
                >
                  <Trash2 size={17} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Trash2 size={15} style={{ color: 'var(--muted)' }} />
        <span className="small muted">Tip: add overlapping windows — busy always wins a time slot.</span>
      </div>
    </>
  );
}
