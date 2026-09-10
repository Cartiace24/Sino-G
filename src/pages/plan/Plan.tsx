import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarX, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyGroups, useRealtimeGroup } from '../../hooks/useGroups';
import { FULL_DAY, useGroupAvailability, type DayRange } from '../../hooks/useAvailability';
import { nextDays, todayISO } from '../../utils/dates';
import {
  CalendarPopup,
  CalendarToggleButton,
  useCalendarDropdown,
} from '../../components/common/CalendarDropdown';
import { useRealtimeAvailability } from '../../hooks/useHangouts';
import { AvatarStack } from '../../components/common/Avatar';
import { EmptyState, ErrorState, LoadingRows } from '../../components/common/Feedback';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';

type WindowPreset = 'all' | 'morning' | 'afternoon' | 'tonight' | 'custom';

const PRESETS: Record<Exclude<WindowPreset, 'custom'>, DayRange> = {
  all: FULL_DAY,
  morning: { start: 8 * 60, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 18 * 60 },
  tonight: { start: 18 * 60, end: 23 * 60 },
};

const PRESET_LABEL: Record<Exclude<WindowPreset, 'custom'>, string> = {
  all: 'All day',
  morning: 'Morning',
  afternoon: 'Afternoon',
  tonight: 'Tonight',
};

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function Plan() {
  const { groupId: paramGroupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const days = useMemo(() => nextDays(7), []);
  const [date, setDate] = useState(todayISO());
  const [slotIdx, setSlotIdx] = useState<number | null>(null);
  const [preset, setPreset] = useState<WindowPreset>('all');
  const [customFrom, setCustomFrom] = useState('18:00');
  const [customUntil, setCustomUntil] = useState('23:00');
  // Shared dropdown calendar (month math + outside-click live in the hook).
  const cal = useCalendarDropdown(date);
  const todayIso = useMemo(() => todayISO(), []);

  const customValid = hhmmToMinutes(customUntil) > hhmmToMinutes(customFrom);
  // Invalid custom ranges fall back to the full day (with a note) rather
  // than computing a nonsense or empty window.
  const range: DayRange =
    preset === 'custom'
      ? customValid
        ? { start: hhmmToMinutes(customFrom), end: hhmmToMinutes(customUntil) }
        : FULL_DAY
      : PRESETS[preset];

  const pickPreset = (p: WindowPreset) => {
    setPreset(p);
    setSlotIdx(null);
  };
  const pickDate = (d: string) => {
    setDate(d);
    setSlotIdx(null);
  };

  // Past dates disabled in the calendar (availability is forward-looking).
  const isCustomDate = !days.some((d) => d.iso === date);

  const groupsQ = useMyGroups(user?.id);
  const groups = groupsQ.data ?? [];
  const groupId = paramGroupId ?? groups[0]?.id;
  const group = groups.find((g) => g.id === groupId) ?? groups[0];

  const { membersQ, rowsQ, memberIds, slots, best } = useGroupAvailability(group?.id, date, range);
  useRealtimeAvailability(group?.id);
  // Membership churn changes the member set the bars are computed from.
  useRealtimeGroup(group?.id);

  const activeIdx = slotIdx ?? best?.index ?? null;
  const active = activeIdx != null ? slots[activeIdx] : null;
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of membersQ.data ?? []) m.set(mem.user_id, mem.profile.display_name);
    return m;
  }, [membersQ.data]);

  if (groupsQ.isLoading) return <LoadingRows rows={5} />;
  if (groupsQ.isError) {
    return (
      <div style={{ paddingTop: 30 }}>
        <h1 className="display lg">PLAN.</h1>
        <div style={{ height: 16 }} />
        <ErrorState
          title="Couldn't load your groups."
          body="Check your connection and try again."
          onRetry={() => groupsQ.refetch()}
        />
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div style={{ paddingTop: 30 }}>
        <h1 className="display lg">NO CREW YET.</h1>
        <div style={{ height: 16 }} />
        <EmptyState
          icon={<Users size={30} />}
          title="You haven't found your people yet."
          body="Create or join a group to start planning."
          action={
            <Button variant="green" size="sm" onClick={() => navigate('/onboarding/group')}>
              Create or join
            </Button>
          }
        />
      </div>
    );
  }

  const max = Math.max(1, ...slots.map((s) => s.score));
  // Full crew at the best slot (2+ friends) — the screenshot moment.
  const isFullHouse = (best?.slot.free ?? 0) === memberIds.length && memberIds.length >= 2;
  const CONFETTI_COLORS = ['#B6D83B', '#FBFAF7', '#FF6B35', '#4d6600'];

  return (
    <>
      <p className="kicker sec-sm">
        PLAN · {group?.name.toUpperCase()} · {memberIds.length} FRIENDS
      </p>
      <h1 className="display lg">
        WHEN&apos;S
        <br />
        EVERYONE <span className="accent">FREE?</span>
      </h1>

      {!paramGroupId && groups.length > 1 && (
        <div className="daytabs sec-sm">
          {groups.map((g) => (
            <button
              key={g.id}
              className={`daytab${g.id === group?.id ? ' sel' : ''}`}
              onClick={() => navigate(`/groups/${g.id}/availability`)}
            >
              {g.name.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <div className="cal-anchor sec-sm" ref={cal.ref}>
        <div className="daytabs" style={{ marginTop: 0 }}>
          {days.map((d) => (
            <button
              key={d.iso}
              className={`daytab${d.iso === date ? ' sel' : ''}`}
              onClick={() => pickDate(d.iso)}
            >
              {d.dow} {d.num}
            </button>
          ))}
          <CalendarToggleButton
            value={date}
            active={isCustomDate}
            open={cal.open}
            onClick={cal.openToggle}
          />
        </div>

        {cal.open && (
          <CalendarPopup
            value={date}
            min={todayIso}
            cursor={cal.cursor}
            cells={cal.cells}
            onStep={cal.stepMonth}
            onPick={(iso) => {
              pickDate(iso);
              cal.setOpen(false);
            }}
          />
        )}
      </div>

      <div className="sec">
        <span className="kicker">TIME WINDOW</span>
        <div className="chiprow sec-sm">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`chip${preset === p ? ' sel' : ''}`}
              onClick={() => pickPreset(p)}
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
          <button
            type="button"
            className={`chip${preset === 'custom' ? ' sel' : ''}`}
            onClick={() => pickPreset('custom')}
          >
            Custom
          </button>
        </div>
        {preset === 'custom' && (
          <div className="timegrid sec-sm" style={{ maxWidth: 420 }}>
            <div>
              <Label htmlFor="win-from">From</Label>
              <Input
                id="win-from"
                type="time"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setSlotIdx(null);
                }}
              />
            </div>
            <div>
              <Label htmlFor="win-until">Until</Label>
              <Input
                id="win-until"
                type="time"
                value={customUntil}
                onChange={(e) => {
                  setCustomUntil(e.target.value);
                  setSlotIdx(null);
                }}
              />
            </div>
          </div>
        )}
        {preset === 'custom' && !customValid && (
          <FieldError message="End time has to be later than start time — showing the full day." />
        )}
      </div>

      {rowsQ.isError || membersQ.isError ? (
        <div className="sec">
          <ErrorState
            title="Couldn't load availability."
            body="Check your connection and try again."
            onRetry={() => {
              membersQ.refetch();
              rowsQ.refetch();
            }}
          />
        </div>
      ) : rowsQ.isLoading || membersQ.isLoading ? (
        <LoadingRows rows={5} />
      ) : best ? (
        <>
          <div className="besthero">
            {isFullHouse && (
              <span className="confetti" aria-hidden>
                {Array.from({ length: 14 }).map((_, i) => (
                  <i
                    key={i}
                    style={{
                      left: `${(i * 71) % 100}%`,
                      background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                      animationDuration: `${2.4 + (i % 5) * 0.5}s`,
                      animationDelay: `${(i % 7) * 0.35}s`,
                    }}
                  />
                ))}
              </span>
            )}
            <span className="tag-best">{isFullHouse ? '★ FULL HOUSE' : '★ BEST TIME'}</span>
            <h3>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
              <br />
              {best.slot.label}
            </h3>
            <div className="row-between">
              <p>
                {isFullHouse ? (
                  <b style={{ color: '#fff' }}>Everyone&apos;s free</b>
                ) : (
                  <>
                    <b style={{ color: '#fff' }}>
                      {best.slot.free} of {memberIds.length} friends
                    </b>{' '}
                    available
                  </>
                )}
              </p>
              <button
                className="btn btn-green btn-sm"
                onClick={() =>
                  navigate(
                  `/g?group=${group!.id}&when=${encodeURIComponent(best.slot.label)}&date=${date}`,
                )
                }
              >
                {isFullHouse ? 'Tara, G!' : 'Ask the group'}
              </button>
            </div>
          </div>

          <span className="kicker">TAP A TIME TO SEE WHO&apos;S FREE</span>
          <div className="bars">
            {slots.map((s, i) => {
              const count = s.free + s.maybe;
              const isBest = best.index === i;
              const isActive = activeIdx === i;
              return (
                <button
                  key={s.start}
                  className={`bar-row${isBest ? ' best' : ''}`}
                  onClick={() => setSlotIdx(i)}
                  aria-pressed={isActive}
                  aria-label={`${s.label}, ${count} of ${memberIds.length} available${isBest ? ' (best time)' : ''}`}
                  style={isActive && !isBest ? { borderColor: 'var(--ink)' } : undefined}
                >
                  <span className="t">{s.label}</span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${Math.round((s.score / max) * 100)}%`,
                        opacity: isBest ? 1 : 0.35 + 0.65 * (s.score / max),
                      }}
                    />
                  </span>
                  <span className="n">
                    {count}/{memberIds.length}
                  </span>
                </button>
              );
            })}
          </div>

          {active && (
            <div className="sheet">
              <div className="row-between">
                <span className="kicker">
                  WHO&apos;S FREE · {active.label}
                </span>
                <span className="small">
                  <b>
                    {active.free}/{memberIds.length}
                  </b>
                </span>
              </div>
              <div style={{ margin: '12px 0' }}>
                <AvatarStack
                  names={active.coverage
                    .filter((c) => c.status === 'free')
                    .map((c) => nameById.get(c.userId) ?? '?')}
                />
              </div>
              <p className="small muted">
                {active.coverage
                  .filter((c) => c.status === 'free')
                  .map((c) => nameById.get(c.userId) ?? 'Someone')
                  .join(' · ') || 'Nobody free at this time yet.'}
                {active.maybe > 0 &&
                  ` — ${active.coverage
                    .filter((c) => c.status === 'maybe')
                    .map((c) => nameById.get(c.userId) ?? 'Someone')
                    .join(', ')} ${active.maybe === 1 ? 'is' : 'are'} maybe.`}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="sec">
          <EmptyState
            icon={<CalendarX size={30} />}
            title="No one's marked their schedule yet."
            body={`Nudge ${group?.name} to set availability for this date.`}
            action={
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <Button variant="green" size="sm" onClick={() => navigate('/availability')}>
                  Set mine
                </Button>
                <Button variant="line" size="sm" onClick={() => navigate(`/groups/${group!.id}`)}>
                  Nudge group
                </Button>
              </div>
            }
          />
        </div>
      )}

      <p className="small muted sec">
        <Link className="link-u" to={`/groups/${group!.id}`}>
          Back to {group?.name}
        </Link>
      </p>
    </>
  );
}
