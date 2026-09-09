import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, MapPin, Share2, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHangoutDetail } from '../../hooks/useHangouts';
import { useMyGroups } from '../../hooks/useGroups';
import { countResponses, hangoutsService } from '../../services/hangouts.service';
import { friendlyError } from '../../utils/errors';
import { qk } from '../../lib/queryClient';
import { Avatar } from '../../components/common/Avatar';
import { StatusDot } from '../../components/common/StatusDot';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { useToast } from '../../components/common/Toast';
import { Button } from '../../components/ui/button';
import type { HangoutResponseValue } from '../../types/database.types';

const OPTIONS: { value: HangoutResponseValue; label: string; cls: string }[] = [
  { value: 'down', label: "I'M DOWN", cls: 'down' },
  { value: 'maybe', label: 'MAYBE', cls: 'maybe-b' },
  { value: 'unavailable', label: "CAN'T", cls: 'cant' },
];

const CONFIRM_MSG: Record<HangoutResponseValue, string> = {
  down: "<b>🔥 You're down!</b> The group sees it live.",
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

  const h = hangoutQ.data;
  const responses = responsesQ.data ?? [];
  const counts = countResponses(responses);
  // Creator counts as down exactly once — not twice when they tap I'M DOWN.
  const creatorDown = responses.some((r) => r.user_id === h?.created_by && r.response === 'down');
  const downCount = counts.down + (h && !creatorDown ? 1 : 0);
  const myResp = responses.find((r) => r.user_id === user?.id)?.response;
  const myRole = myGroupsQ.data?.find((g) => g.id === h?.group_id)?.my_role;
  const canClose = h && (h.created_by === user?.id || myRole === 'owner' || myRole === 'admin');

  const respondMut = useMutation({
    mutationFn: (v: HangoutResponseValue) => hangoutsService.respond(hangoutId!, user!.id, v),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: qk.hangoutResponses(hangoutId!) });
      toast(CONFIRM_MSG[v]);
    },
    onError: (err) => toast(friendlyError(err, 'Could not save your response.')),
  });

  const nudgeMut = useMutation({
    mutationFn: () => hangoutsService.nudge(hangoutId!),
    onSuccess: (count) => {
      toast(
        count > 0
          ? `<b>⚡ Nudged!</b> ${count} ${count === 1 ? 'friend was' : 'friends were'} notified in-app.`
          : `<b>⚡ Nudged!</b> Everyone's already down.`,
      );
    },
    onError: (err) => toast(friendlyError(err, 'Could not send the nudge.')),
  });

  // Clipboard text for the external group chat + in-app notification to
  // fellow members (excluding the nudger and anyone already down).
  const onNudge = async () => {
    try {
      await navigator.clipboard.writeText(`${h?.creator?.display_name} is asking: ${h?.title ?? 'Hangout?'} ${h?.location ? `at ${h.location}` : ''} — respond in Sino G!`);
      toast('Copied for the GC — notifying the group in-app too.');
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
        qc.invalidateQueries({ queryKey: ['hangout-counts'] });
      }
      if (user) qc.invalidateQueries({ queryKey: qk.myHangouts(user.id) });
      toast(status === 'closed' ? 'Hangout closed. Have fun. 🎉' : 'Hangout cancelled.');
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

  return (
    <>
      <Link className="backlink" to="/g" style={{ marginTop: 14 }}>
        <ArrowLeft size={16} /> ALL HANGOUTS
      </Link>
      <div className="hangalert">
        <span className="kicker">
          {h.status === 'active' ? '🔥 HANGOUT ALERT · LIVE' : `· ${h.status.toUpperCase()} ·`}
        </span>
        <p className="small" style={{ color: '#cfccc2', marginTop: 10, letterSpacing: '.1em', fontWeight: 700 }}>
          {(h.creator?.display_name ?? 'SOMEONE').toUpperCase()} IS ASKING:
        </p>
        <h2>{h.title ?? 'Hangout?'}</h2>
        <div className="meta">
          {h.location && (
            <span>
              <MapPin size={15} /> {h.location}
            </span>
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
        <p className="small muted">This hangout is {h.status}. Catch the next one. ⚡</p>
      )}

      <hr className="rule" />
      <div className="row-between">
        <span className="kicker">🔥 {String(downCount).padStart(2, '0')} PEOPLE ARE DOWN</span>
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
            <span className="right">🔥</span>
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
              <span className="right">🔥</span>
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
        {canClose && h.status === 'active' && (
          <>
            <Button variant="paper" size="sm" onClick={() => closeMut.mutate('closed')} disabled={closeMut.isPending}>
              Close hangout
            </Button>
            <Button variant="paper" size="sm" style={{ color: 'var(--busy)' }} onClick={() => closeMut.mutate('cancelled')} disabled={closeMut.isPending}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </>
  );
}
