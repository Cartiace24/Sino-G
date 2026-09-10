import { Suspense, lazy, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, MapPin, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyGroups } from '../../hooks/useGroups';
import { useMyHangouts, useRealtimeHangouts } from '../../hooks/useHangouts';
import { hangoutsService } from '../../services/hangouts.service';
import { friendlyError } from '../../utils/errors';
import { localISODate, todayISO } from '../../hooks/useAvailability';
import { describeHangoutWhen } from '../../utils/time';
import type { PinnedLocation } from '../../types/app.types';

const LocationPicker = lazy(() =>
  import('../../components/hangouts/LocationPicker').then((m) => ({ default: m.LocationPicker })),
);
import { qk } from '../../lib/queryClient';
import { PREF_KEYS, usePreference } from '../../lib/preferences';
import { Avatar } from '../../components/common/Avatar';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { useToast } from '../../components/common/Toast';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';

/** Quick picks resolve to concrete datetimes; the picked/custom Date below
 *  is the single source of truth (never a label string). */
interface WhenPreset {
  label: string;
  at: () => Date;
}

function atTime(base: Date, hours: number, minutes = 0): Date {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function shiftDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

const WHEN_PRESETS: WhenPreset[] = [
  { label: 'Tonight · 7 PM', at: () => atTime(new Date(), 19) },
  { label: 'Later · 9 PM', at: () => atTime(new Date(), 21) },
  { label: 'Tomorrow · 2 PM', at: () => atTime(shiftDays(new Date(), 1), 14) },
];

/** "7 PM" / "7:30 PM" (as passed from Plan's best slot) -> today at that time. */
function parseTimeLabel(label: string): Date | null {
  const m = label.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h < 1 || h > 12 || min > 59) return null;
  if (/pm/i.test(m[3]) && h !== 12) h += 12;
  if (/am/i.test(m[3]) && h === 12) h = 0;
  return atTime(new Date(), h, min);
}

function initialWhen(param: string | null): Date {
  if (param) {
    const legacy = WHEN_PRESETS.find((p) => p.label === param);
    if (legacy) return legacy.at();
    const parsed = parseTimeLabel(param);
    if (parsed) return parsed;
  }
  return WHEN_PRESETS[0].at();
}

function sameMinute(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes()
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function Hangouts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [params] = useSearchParams();

  const groupsQ = useMyGroups(user?.id);
  const groups = groupsQ.data ?? [];
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);

  const hangoutsQ = useMyHangouts(user?.id, groupIds);
  useRealtimeHangouts(groupIds);

  const [showForm, setShowForm] = useState(params.has('group'));
  const [groupId, setGroupId] = useState(params.get('group') ?? '');
  const [what, setWhat] = useState('');
  const [where, setWhere] = useState('');
  // Exact map pin, if the user picked one (cleared when the text diverges).
  const [pin, setPin] = useState<PinnedLocation | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Canonical selection: one real datetime. Presets and pickers both
  // read/write this — there is no separate label state to drift.
  const [whenDate, setWhenDate] = useState<Date>(() => initialWhen(params.get('when')));
  const [error, setError] = useState<string | null>(null);
  // Hangout alerts toggle mutes celebratory toasts (errors still surface).
  const [alertsOn] = usePreference(PREF_KEYS.alerts, true);

  // Per-group live counts (one batched query for the visible list, not N).
  const countsQ = useQuery({
    queryKey: ['hangout-counts', (hangoutsQ.data ?? []).map((h) => h.id).join(',')],
    queryFn: () => hangoutsService.countDownsFor(hangoutsQ.data ?? []),
    enabled: (hangoutsQ.data?.length ?? 0) > 0,
    staleTime: 10_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      hangoutsService.create(user!.id, {
        group_id: groupId || groups[0]?.id || '',
        title: what,
        location: where,
        location_lat: pin?.lat ?? null,
        location_lng: pin?.lng ?? null,
        // The exact selected datetime goes to proposed_time; the human label
        // stays in message so existing rows/detail rendering is unchanged.
        proposed_time: whenDate.toISOString(),
        message: `When: ${describeHangoutWhen(whenDate)}`,
      }),
    onSuccess: (h) => {
      if (user) qc.invalidateQueries({ queryKey: qk.myHangouts(user.id) });
      for (const g of groupIds) qc.invalidateQueries({ queryKey: qk.hangouts(g) });
      setWhat('');
      setWhere('');
      setPin(null);
      setShowForm(false);
      if (alertsOn) toast('<b>Asked!</b> The group has been pinged.');
      navigate(`/g/${h.id}`);
    },
    onError: (err) => setError(friendlyError(err, 'Could not ask the group.')),
  });

  const onAsk = (e: FormEvent) => {
    e.preventDefault();
    if (!what.trim()) {
      setError('What are you planning? Add it first.');
      return;
    }
    if (!groupId && groups.length === 0) {
      setError('Join or create a group first.');
      return;
    }
    if (whenDate.getTime() <= Date.now()) {
      setError('That time has already passed — pick a future time.');
      return;
    }
    setError(null);
    createMut.mutate();
  };

  const hangouts = hangoutsQ.data ?? [];
  const effectiveGroup = groupId || groups[0]?.id || '';

  const activePreset = WHEN_PRESETS.find((preset) => sameMinute(preset.at(), whenDate));
  const dateValue = localISODate(whenDate);
  const timeValue = `${pad2(whenDate.getHours())}:${pad2(whenDate.getMinutes())}`;
  const setDatePart = (iso: string) => {
    if (!iso) return;
    const [y, mo, d] = iso.split('-').map(Number);
    const next = new Date(whenDate);
    next.setFullYear(y, mo - 1, d);
    setWhenDate(next);
  };
  const setTimePart = (hm: string) => {
    if (!hm) return;
    const [h, m] = hm.split(':').map(Number);
    const next = new Date(whenDate);
    next.setHours(h, m, 0, 0);
    setWhenDate(next);
  };

  return (
    <>
      <p className="kicker" style={{ marginTop: 14 }}>
        SPONTANEOUS MODE · {hangouts.length} LIVE NOW
      </p>
      <h1 className="display xl">
        WHO&apos;S
        <br />
        <span className="accent">DOWN?</span>
      </h1>
      <p className="lede" style={{ marginTop: 8 }}>
        See who&apos;s ready to hang out. No planning thread needed.
      </p>
      <Button variant="dark" size="bigBlock" onClick={() => setShowForm((s) => !s)} style={{ marginTop: 16 }}>
        + Start a hangout
      </Button>

      {showForm && (
        <>
          <form className="sheet" onSubmit={onAsk}>
          <span className="kicker">NEW HANGOUT · ~15 SECONDS</span>
          <div className="field" style={{ marginTop: 12 }}>
            <Label htmlFor="what">01 · What are you planning?</Label>
            <Input id="what" placeholder="e.g. Basketball" value={what} onChange={(e) => setWhat(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <Label>02 · Group</Label>
            <div className="chiprow">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`chip${effectiveGroup === g.id ? ' sel' : ''}`}
                  onClick={() => setGroupId(g.id)}
                >
                  {g.name.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <Label>03 · When?</Label>
            <span className="kicker">QUICK PICK</span>
            <div className="chiprow" style={{ marginTop: 8 }}>
              {WHEN_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`chip${activePreset?.label === preset.label ? ' sel' : ''}`}
                  onClick={() => setWhenDate(preset.at())}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <span className="kicker" style={{ display: 'block', marginTop: 14 }}>DATE &amp; TIME</span>
            <div className="timegrid" style={{ marginTop: 8 }}>
              <div>
                <Label htmlFor="when-date">Date</Label>
                <Input
                  id="when-date"
                  type="date"
                  min={todayISO()}
                  value={dateValue}
                  onChange={(e) => setDatePart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="when-time">Time</Label>
                <Input
                  id="when-time"
                  type="time"
                  value={timeValue}
                  onChange={(e) => setTimePart(e.target.value)}
                />
              </div>
            </div>
            <p className="small" style={{ marginTop: 8 }}>
              Selected: <b>{describeHangoutWhen(whenDate)}</b>
            </p>
          </div>
          <div className="field">
            <Label htmlFor="where">04 · Where? (optional)</Label>
            <Input
              id="where"
              placeholder="e.g. Nuvali"
              value={where}
              onChange={(e) => {
                setWhere(e.target.value);
                // Renamed by hand: the old pin no longer describes this text.
                if (pin && e.target.value !== pin.name) setPin(null);
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn btn-paper btn-sm" onClick={() => setPickerOpen(true)}>
                <MapPin size={15} /> {pin ? 'Change pin' : 'Pin a location'}
              </button>
              {pin && <span className="small muted">Exact map location saved</span>}
            </div>
          </div>
          <FieldError message={error} />
          <Button type="submit" variant="green" size="bigBlock" disabled={createMut.isPending}>
            {createMut.isPending ? 'Asking…' : (<>Create hangout <ArrowRight size={18} /></>)}
          </Button>
        </form>
        {pickerOpen && (
          <Suspense fallback={<LoadingRows rows={3} />}>
            <LocationPicker
              initial={pin}
              onClose={() => setPickerOpen(false)}
              onConfirm={(loc) => {
                setWhere(loc.name);
                setPin(loc);
                setPickerOpen(false);
              }}
            />
          </Suspense>
        )}
      </>
      )}

      <hr className="rule" />
      <span className="kicker">LIVE REQUESTS</span>
      {hangoutsQ.isLoading || groupsQ.isLoading ? (
        <LoadingRows rows={3} />
      ) : hangouts.length === 0 ? (
        <div style={{ marginTop: 10 }}>
          <EmptyState
            icon={<Moon size={30} />}
            title="Nothing's happening right now."
            body="Be the first to ask. Barkadas move fast."
          />
        </div>
      ) : (
        <div>
          {hangouts.map((h) => (
            <button key={h.id} className="hangitem" onClick={() => navigate(`/g/${h.id}`)}>
              <span className="pulse" />
              <Avatar name={h.creator?.display_name ?? '?'} src={h.creator?.avatar_url} />
              <span>
                <span className="kicker" style={{ fontSize: 10 }}>
                  {h.group_name.toUpperCase()} · {h.message ?? 'NOW'}
                </span>
                <br />
                <strong style={{ fontSize: 16 }}>{h.title ?? 'Hangout?'}</strong>{' '}
                <span className="muted small">— {h.creator?.display_name}</span>
                <br />
                <span className="small">
                  <b className="free-n" style={{ color: 'var(--free)' }}>
                    {countsQ.data?.get(h.id) ?? '…'} down
                  </b>{' '}
                  <span className="muted">· {h.location ?? 'TBD'}</span>
                </span>
              </span>
              <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
