import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyGroups } from '../../hooks/useGroups';
import { useMyHangouts, useRealtimeHangouts } from '../../hooks/useHangouts';
import { hangoutsService } from '../../services/hangouts.service';
import { friendlyError } from '../../utils/errors';
import { qk } from '../../lib/queryClient';
import { Avatar } from '../../components/common/Avatar';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { useToast } from '../../components/common/Toast';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';

const WHEN_PRESETS = ['Tonight · 7:00 PM', 'Later · 9 PM', 'Tomorrow · 2 PM'];

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
  const [when, setWhen] = useState(params.get('when') ?? WHEN_PRESETS[0]);
  const [error, setError] = useState<string | null>(null);

  // Per-group live counts (one query for the visible list)
  const countsQ = useQuery({
    queryKey: ['hangout-counts', (hangoutsQ.data ?? []).map((h) => h.id).join(',')],
    queryFn: async () => {
      const map = new Map<string, number>();
      await Promise.all(
        (hangoutsQ.data ?? []).map(async (h) => {
          const r = await hangoutsService.responses(h.id);
          const downs = r.filter((x) => x.response === 'down');
          // The creator counts as down exactly once: the +1 applies only when
          // they have no explicit 'down' row (they may respond like anyone).
          const creatorDown = downs.some((x) => x.user_id === h.created_by);
          map.set(h.id, downs.length + (creatorDown ? 0 : 1));
        }),
      );
      return map;
    },
    enabled: (hangoutsQ.data?.length ?? 0) > 0,
    staleTime: 10_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      hangoutsService.create(user!.id, {
        group_id: groupId || groups[0]?.id || '',
        title: what,
        location: where,
        message: `When: ${when}`,
      }),
    onSuccess: (h) => {
      if (user) qc.invalidateQueries({ queryKey: qk.myHangouts(user.id) });
      for (const g of groupIds) qc.invalidateQueries({ queryKey: qk.hangouts(g) });
      setWhat('');
      setWhere('');
      setShowForm(false);
      toast('<b>Asked!</b> The group has been pinged.');
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
    setError(null);
    createMut.mutate();
  };

  const hangouts = hangoutsQ.data ?? [];
  const effectiveGroup = groupId || groups[0]?.id || '';

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
        <form className="sheet" onSubmit={onAsk}>
          <span className="kicker">NEW HANGOUT · ~15 SECONDS</span>
          <div className="field" style={{ marginTop: 12 }}>
            <Label>Group</Label>
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
            <Label htmlFor="what">What are you planning?</Label>
            <Input id="what" placeholder="e.g. Basketball" value={what} onChange={(e) => setWhat(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <Label htmlFor="where">Where? (optional)</Label>
            <Input id="where" placeholder="e.g. Nuvali" value={where} onChange={(e) => setWhere(e.target.value)} />
          </div>
          <div className="field">
            <Label>When?</Label>
            <div className="chiprow">
              {WHEN_PRESETS.map((w) => (
                <button key={w} type="button" className={`chip${when === w ? ' sel' : ''}`} onClick={() => setWhen(w)}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <FieldError message={error} />
          <Button type="submit" variant="green" size="bigBlock" disabled={createMut.isPending}>
            {createMut.isPending ? 'Asking…' : 'Ask the group'}
          </Button>
        </form>
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
