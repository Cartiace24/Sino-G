import { Suspense, lazy, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, MapPin, MessageCircle, Pencil, Share2, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHangoutDetail } from '../../hooks/useHangouts';
import { useMyGroups } from '../../hooks/useGroups';
import { countResponses, hangoutsService } from '../../services/hangouts.service';
import { friendlyError } from '../../utils/errors';
import { describeHangoutWhen } from '../../utils/time';
import { googleMapsUrl } from '../../utils/maps';
import { localISODate, todayISO } from '../../hooks/useAvailability';
import { qk } from '../../lib/queryClient';
import { PREF_KEYS, usePreference } from '../../lib/preferences';
import { Avatar } from '../../components/common/Avatar';
import { StatusDot } from '../../components/common/StatusDot';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { useToast } from '../../components/common/Toast';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';
import type { HangoutResponseValue } from '../../types/database.types';
import type { PinnedLocation } from '../../types/app.types';

const LocationPicker = lazy(() =>
  import('../../components/hangouts/LocationPicker').then((m) => ({ default: m.LocationPicker })),
);

function toInputTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const OPTIONS: { value: HangoutResponseValue; label: string; cls: string }[] = [
  { value: 'down', label: "I'M DOWN", cls: 'down' },
  { value: 'maybe', label: 'MAYBE', cls: 'maybe-b' },
  { value: 'unavailable', label: "CAN'T", cls: 'cant' },
];

const CONFIRM_MSG: Record<HangoutResponseValue, string> = {
  down: "<b>You're down!</b> The group sees it live.",
  maybe: '<b>Maybe noted.</b> We\'ll keep you posted.',
  unavailable: "<b>Marked can't.</b> Next time.",
};

export function HangoutDetail() {
  const { hangoutId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const { hangoutQ, responsesQ } = useHangoutDetail(hangoutId);
  const myGroupsQ = useMyGroups(user?.id);
  // Mutes celebratory hangout toasts when Hangout alerts is off (errors still show).
  const [alertsOn] = usePreference(PREF_KEYS.alerts, true);

  const h = hangoutQ.data;
  const responses = responsesQ.data ?? [];
  const counts = countResponses(responses);
  // Creator counts as down exactly once — not twice when they tap I'M DOWN.
  const creatorDown = responses.some((r) => r.user_id === h?.created_by && r.response === 'down');
  const downCount = counts.down + (h && !creatorDown ? 1 : 0);
  const myResp = responses.find((r) => r.user_id === user?.id)?.response;
  const myRole = myGroupsQ.data?.find((g) => g.id === h?.group_id)?.my_role;
  const canClose = h && (h.created_by === user?.id || myRole === 'owner' || myRole === 'admin');

  // Edit-details draft (date/time/location only — title stays fixed in V1).
  const [editing, setEditing] = useState(false);
  const [eDate, setEDate] = useState('');
  const [eTime, setETime] = useState('');
  const [eWhere, setEWhere] = useState('');
  const [ePin, setEPin] = useState<PinnedLocation | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEditor = () => {
    if (!h) return;
    if (h.proposed_time) {
      const d = new Date(h.proposed_time);
      setEDate(localISODate(d));
      setETime(toInputTime(d));
    } else {
      setEDate(todayISO());
      setETime('19:00');
    }
    setEWhere(h.location ?? '');
    setEPin(
      h.location != null && h.location_lat != null && h.location_lng != null
        ? { name: h.location, lat: h.location_lat, lng: h.location_lng }
        : null,
    );
    setEditError(null);
    setEditing(true);
  };

  const editMut = useMutation({
    mutationFn: () => {
      if (!eDate || !eTime) throw new Error('Pick a date and time first.');
      const at = new Date(`${eDate}T${eTime}:00`);
      if (Number.isNaN(at.getTime())) throw new Error('That date and time look off — try again.');
      if (at.getTime() <= Date.now()) throw new Error('That time has already passed — pick a future time.');
      const name = eWhere.trim() || null;
      const keepPin = ePin && name === ePin.name ? ePin : null;
      return hangoutsService.updateHangout(hangoutId!, {
        proposed_time: at.toISOString(),
        location: name,
        location_lat: keepPin?.lat ?? null,
        location_lng: keepPin?.lng ?? null,
        message: `When: ${describeHangoutWhen(at)}`,
      });
    },
    onSuccess: () => {
      setEditError(null);
      setEditing(false);
      setPickerOpen(false);
      qc.invalidateQueries({ queryKey: qk.hangout(hangoutId!) });
      if (h) {
        qc.invalidateQueries({ queryKey: qk.hangouts(h.group_id) });
        qc.invalidateQueries({ queryKey: qk.hangoutCounts() });
      }
      if (user) qc.invalidateQueries({ queryKey: qk.myHangouts(user.id) });
      if (alertsOn) toast('<b>Saved.</b> The group will be notified of any changes.');
    },
    onError: (err) => setEditError(friendlyError(err, 'Could not save changes.')),
  });

  const respondMut = useMutation({
    mutationFn: (v: HangoutResponseValue) => hangoutsService.respond(hangoutId!, user!.id, v),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: qk.hangoutResponses(hangoutId!) });
      if (alertsOn) toast(CONFIRM_MSG[v]);
    },
    onError: (err) => toast(friendlyError(err, 'Could not save your response.')),
  });

  const nudgeMut = useMutation({
    mutationFn: () => hangoutsService.nudge(hangoutId!),
    onSuccess: (count) => {
      if (!alertsOn) return;
      toast(
        count > 0
          ? `<b>Nudged!</b> ${count} ${count === 1 ? 'friend was' : 'friends were'} notified in-app.`
          : `<b>Nudged!</b> Everyone's already down.`,
      );
    },
    onError: (err) => toast(friendlyError(err, 'Could not send the nudge.')),
  });

  // Clipboard text for the external group chat + in-app notification to
  // fellow members (excluding the nudger and anyone already down).
  const onNudge = async () => {
    try {
      await navigator.clipboard.writeText(`${h?.creator?.display_name} is asking: ${h?.title ?? 'Hangout?'} ${h?.location ? `at ${h.location}` : ''} — respond in Sino G!`);
      if (alertsOn) toast('Copied for the GC — notifying the group in-app too.');
    } catch {
      // Clipboard unavailable: the in-app nudge still goes out below.
    }
    nudgeMut.mutate();
  };

  const closeMut = useMutation({    mutationFn: (status: 'closed' | 'cancelled') => hangoutsService.setStatus(hangoutId!, status),
    onSuccess: (_d, status) => {
      qc.invalidateQueries({ queryKey: qk.hangout(hangoutId!) });
      // Otherwise the closed hangout lingers in the G? and Today lists.
      if (h) {
        qc.invalidateQueries({ queryKey: qk.hangouts(h.group_id) });
        qc.invalidateQueries({ queryKey: qk.hangoutCounts() });
      }
      if (user) qc.invalidateQueries({ queryKey: qk.myHangouts(user.id) });
      if (alertsOn) toast(status === 'closed' ? 'Hangout closed. Have fun.' : 'Hangout cancelled.');
      navigate('/g');
    },
    onError: (err) => toast(friendlyError(err, 'Could not update the hangout.')),
  });

  if (hangoutQ.isLoading) return <LoadingRows rows={5} />;
  if (!h) {
    return (
      <div style={{ paddingTop: 30 }}>
        <EmptyState
          icon={null}
          title="That hangout is gone."
          body="It may have been cancelled or the link is wrong."
          action={
            <Button variant="line" size="sm" onClick={() => navigate('/g')}>
              Back to G?
            </Button>
          }
        />
      </div>
    );
  }

  const down = responses.filter((r) => r.response === 'down');
  const maybe = responses.filter((r) => r.response === 'maybe');
  const cant = responses.filter((r) => r.response === 'unavailable');
  // Exact pin when present, readable-name search for legacy text rows.
  const mapsUrl = googleMapsUrl(h.location, h.location_lat ?? null, h.location_lng ?? null);

  return (
    <>
      <Link className="backlink" to="/g" style={{ marginTop: 14 }}>
        <ArrowLeft size={16} /> ALL HANGOUTS
      </Link>
      <div className="hangalert">
        <span className="kicker">
          {h.status === 'active' ? 'HANGOUT ALERT · LIVE' : `· ${h.status.toUpperCase()} ·`}
        </span>
        <p className="small" style={{ color: '#cfccc2', marginTop: 10, letterSpacing: '.1em', fontWeight: 700 }}>
          {(h.creator?.display_name ?? 'SOMEONE').toUpperCase()} IS ASKING:
        </p>
        <h2>{h.title ?? 'Hangout?'}</h2>
        <div className="meta">
          {h.location && mapsUrl && (
            <a className="map-pill" href={mapsUrl} target="_blank" rel="noreferrer">
              <MapPin size={15} /> {h.location}
            </a>
          )}
          {h.message && (
            <span>
              <Clock size={15} /> {h.message}
            </span>
          )}
          <span>
            <Users size={15} /> {h.group_name}
          </span>
        </div>
      </div>

      {h.status === 'active' ? (
        <>
          <h2 className="display md">
            ARE YOU
            <br />
            DOWN?
          </h2>
          <div className="respond" style={{ marginTop: 12 }}>
            {OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`rbtn ${o.cls}${myResp === o.value ? ' picked' : ''}`}
                onClick={() => respondMut.mutate(o.value)}
                disabled={respondMut.isPending}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="small muted">This hangout is {h.status}. Catch the next one.</p>
      )}

      <hr className="rule" />
      <div className="row-between">
        <span className="kicker">{String(downCount).padStart(2, '0')} PEOPLE ARE DOWN</span>
        <span className="small muted">updates live</span>
      </div>
      <div className="rows" style={{ marginTop: 8 }}>
        {h.creator && (
          <div className="member-row">
            <Avatar name={h.creator.display_name} src={h.creator.avatar_url} size="sm" />
            <span className="who">
              <strong>
                {h.creator.display_name} {h.created_by === user?.id && <span className="muted small">(you)</span>}
              </strong>
              <small>asked the group · is down</small>
            </span>
            <span className="right"><span className="dot free" /></span>
          </div>
        )}
        {down
          .filter((r) => r.user_id !== h.created_by)
          .map((r) => (
            <div className="member-row" key={r.id}>
              <Avatar name={r.profile?.display_name ?? '?'} src={r.profile?.avatar_url} size="sm" />
              <span className="who">
                <strong>
                  {r.profile?.display_name ?? 'Someone'}{' '}
                  {r.user_id === user?.id && <span className="muted small">(you)</span>}
                </strong>
                <small>is down · just now</small>
              </span>
              <span className="right"><span className="dot free" /></span>
            </div>
          ))}
        {maybe.map((r) => (
          <div className="member-row" key={r.id}>
            <Avatar name={r.profile?.display_name ?? '?'} src={r.profile?.avatar_url} size="sm" />
            <span className="who">
              <strong>{r.profile?.display_name ?? 'Someone'}</strong>
              <small>is thinking about it</small>
            </span>
            <span className="right">
              <StatusDot status="maybe" />
            </span>
          </div>
        ))}
        {cant.map((r) => (
          <div className="member-row" key={r.id}>
            <Avatar name={r.profile?.display_name ?? '?'} src={r.profile?.avatar_url} size="sm" />
            <span className="who">
              <strong>{r.profile?.display_name ?? 'Someone'}</strong>
              <small>can&apos;t make it</small>
            </span>
            <span className="right">
              <StatusDot status="busy" />
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        {h.status === 'active' && (
          <Button variant="line" size="block" onClick={onNudge} disabled={nudgeMut.isPending}>
            <Share2 size={16} /> {nudgeMut.isPending ? 'Nudging…' : "Nudge the GC"}
          </Button>
        )}
        <Button variant="paper" size="sm" onClick={() => navigate(`/groups/${h.group_id}/chat`)}>
          <MessageCircle size={15} /> Open group chat
        </Button>
        {canClose && h.status === 'active' && (
          <>
            <Button
              variant="paper"
              size="sm"
              onClick={() => {
                if (editing) setEditing(false);
                else openEditor();
              }}
            >
              <Pencil size={15} /> {editing ? 'Close editor' : 'Edit details'}
            </Button>
            <Button variant="paper" size="sm" onClick={() => closeMut.mutate('closed')} disabled={closeMut.isPending}>
              Close hangout
            </Button>
            <Button variant="paper" size="sm" style={{ color: 'var(--busy)' }} onClick={() => closeMut.mutate('cancelled')} disabled={closeMut.isPending}>
              Cancel
            </Button>
          </>
        )}
      </div>

      {editing && canClose && h.status === 'active' && (
        <div className="sheet" style={{ marginTop: 14 }}>
          <span className="kicker">EDIT DATE, TIME &amp; PLACE</span>
          <div className="timegrid" style={{ marginTop: 12 }}>
            <div>
              <Label htmlFor="edit-date">Date</Label>
              <Input id="edit-date" type="date" min={todayISO()} value={eDate} onChange={(e) => setEDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-time">Time</Label>
              <Input id="edit-time" type="time" value={eTime} onChange={(e) => setETime(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <Label htmlFor="edit-where">Where? (optional)</Label>
            <Input
              id="edit-where"
              placeholder="e.g. Nuvali"
              value={eWhere}
              onChange={(e) => {
                setEWhere(e.target.value);
                if (ePin && e.target.value.trim() !== ePin.name) setEPin(null);
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn btn-paper btn-sm" onClick={() => setPickerOpen(true)}>
                <MapPin size={15} /> {ePin ? 'Change pin' : 'Pin a location'}
              </button>
              {ePin && <span className="small muted">Exact map location saved</span>}
            </div>
          </div>
          <FieldError message={editError} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="green" size="sm" disabled={editMut.isPending} onClick={() => editMut.mutate()}>
              {editMut.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="paper" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            The group is notified only when the time or place actually changes.
          </p>
        </div>
      )}
      {pickerOpen && (
        <Suspense fallback={<LoadingRows rows={3} />}>
          <LocationPicker
            initial={ePin}
            onClose={() => setPickerOpen(false)}
            onConfirm={(loc) => {
              setEWhere(loc.name);
              setEPin(loc);
              setPickerOpen(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
