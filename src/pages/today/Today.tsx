import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Moon, Users, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyGroups, useRealtimeGroupsList } from '../../hooks/useGroups';
import { todayISO, useTonight } from '../../hooks/useAvailability';
import { useMyHangouts, useRealtimeHangouts } from '../../hooks/useHangouts';
import { groupsService } from '../../services/groups.service';
import { availabilityService } from '../../services/availability.service';
import { calculateGroupAvailability, findBestSlot } from '../../utils/availability-calculator';
import { friendlyError } from '../../utils/errors';
import { useToast } from '../../components/common/Toast';
import { qk } from '../../lib/queryClient';
import { Avatar, AvatarStack } from '../../components/common/Avatar';
import { EmptyState, ErrorState, LoadingRows } from '../../components/common/Feedback';
import { Button } from '../../components/ui/button';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'GOOD MORNING';
  if (h < 18) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

export function Today() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const today = todayISO();

  const groupsQ = useMyGroups(user?.id);
  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data]);
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);

  const tonight = useTonight(user?.id, groupIds, today);
  const hangoutsQ = useMyHangouts(user?.id, groupIds);
  useRealtimeHangouts(groupIds);
  // Group counts/visibility stay current as membership churns.
  useRealtimeGroupsList();

  const firstName = profile?.display_name?.split(' ')[0]?.toUpperCase() ?? 'FRIEND';

  // Best upcoming window per group (top 3 groups, next 3 days), ranked by
  // true score — the old groups[0]-only hero hid every other barkada.
  const bestQ = useQuery({
    queryKey: [...qk.bestUpcoming(), [...groupIds].sort().slice(0, 3).join(','), today],
    queryFn: async () => {
      const targets = groups.slice(0, 3);
      const perGroup = await Promise.all(
        targets.map(async (g) => {
          const members = await groupsService.members(g.id);
          const ids = members.map((m) => m.user_id);
          if (ids.length === 0) return null;
          const dates = [todayISO(0), todayISO(1), todayISO(2)];
          const perDay = await Promise.all(
            dates.map(async (d) => ({
              date: d,
              rows: await availabilityService.listForDate(ids, d),
            })),
          );
          let best: {
            groupId: string;
            groupName: string;
            date: string;
            label: string;
            window: string;
            free: number;
            total: number;
            score: number;
          } | null = null;
          for (const { date, rows } of perDay) {
            const slots = calculateGroupAvailability(ids, rows);
            const found = findBestSlot(slots);
            // Compare true scores: free count alone ignores maybe-points and can
            // crown a lower-scoring day.
            if (found && (!best || found.slot.score > best.score)) {
              best = {
                groupId: g.id,
                groupName: g.name,
                date,
                label: found.slot.label,
                window: found.window.label,
                free: found.slot.free,
                total: ids.length,
                score: found.slot.score,
              };
            }
          }
          return best;
        }),
      );
      return perGroup
        .filter((b): b is NonNullable<typeof b> => b != null)
        .sort((a, b) => b.score - a.score || b.free - a.free)
        .slice(0, 3);
    },
    enabled: groups.length > 0,
    staleTime: 60_000,
  });
  const bestList = bestQ.data ?? [];
  const topBest = bestList[0] ?? null;

  if (groupsQ.isLoading) return <LoadingRows rows={6} />;
  if (groupsQ.isError) {
    return (
      <div style={{ paddingTop: 30 }}>
        <p className="kicker">{greeting()}, {firstName}.</p>
        <h1 className="display xl">
          WHO&apos;S
          <br />
          FREE <span className="accent">TODAY?</span>
        </h1>
        <div style={{ height: 18 }} />
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
        <p className="kicker">{greeting()}, {firstName}.</p>
        <h1 className="display xl">
          FIND YOUR
          <br />
          <span className="accent">PEOPLE.</span>
        </h1>
        <div style={{ height: 18 }} />
        <EmptyState
          icon={<Users size={30} />}
          title="You haven't found your people yet."
          body="Start your own barkada or join one with a code."
          action={
            <div style={{ display: 'grid', gap: 10 }}>
              <Button variant="green" size="block" onClick={() => navigate('/onboarding/group')}>
                Create or join a group
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const freeCount = tonight.summary.freeTonight.length;
  const hangouts = hangoutsQ.data ?? [];
  const imFreeTonight = user ? tonight.summary.freeTonight.includes(user.id) : false;

  // One-tap activation: tonight 6–10 PM free, no form. Overlapping saves are
  // legal (busy wins a slot), so this never corrupts existing windows.
  const [taraPending, setTaraPending] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const onTaraTonight = async () => {
    if (!user || taraPending || imFreeTonight) return;
    setTaraPending(true);
    try {
      await availabilityService.save(user.id, {
        date: today,
        start_time: '18:00',
        end_time: '22:00',
        status: 'free',
      });
      qc.invalidateQueries({ queryKey: ['my-availability'] });
      qc.invalidateQueries({ queryKey: qk.groupAvailabilityAll() });
      qc.invalidateQueries({ queryKey: qk.tonightForUser(user.id) });
      qc.invalidateQueries({ queryKey: qk.bestUpcoming() });
      toast("<b>You're in for tonight.</b> The barkada can see it.");
    } catch (err) {
      toast(friendlyError(err, 'Could not save that. Try again.'));
    } finally {
      setTaraPending(false);
    }
  };

  return (
    <>
      <p className="kicker" style={{ marginTop: 10 }}>
        {greeting()}, {firstName}.
      </p>
      <h1 className="display xl">
        WHO&apos;S
        <br />
        FREE <span className="accent">TODAY?</span>
      </h1>

      <div className="two-col" style={{ marginTop: 8 }}>
        <div>
          <div className="avail-stat">
            <span className="bignum">{String(freeCount).padStart(2, '0')}</span>
            <span className="avail-cap">
              {freeCount === 1 ? 'Friend' : 'Friends'}
              <br />
              available
            </span>
          </div>
          {tonight.rowsQ.isLoading ? (
            <LoadingRows rows={1} />
          ) : freeCount === 0 ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              No one&apos;s marked today yet.{' '}
              <Link className="link-u" to="/availability">
                Set your availability
              </Link>{' '}
              to get things moving.
            </p>
          ) : (
            <div className="hero-avatars">
              <AvatarStack
                names={tonight.summary.freeTonight.slice(0, 6).map((id) => tonight.people[id]?.name ?? '?')}
                photos={tonight.summary.freeTonight.slice(0, 6).map((id) => tonight.people[id]?.photo ?? null)}
              />
              <span className="small">
                <b>{freeCount} free today</b> <span className="muted">across your groups</span>
              </span>
            </div>
          )}
          {tonight.summary.freeNow.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span className="kicker">AVAILABLE NOW</span>
              <div className="rows" style={{ marginTop: 6 }}>
                {tonight.summary.freeNow.slice(0, 4).map((id) => (
                  <div className="member-row" key={id}>
                    <Avatar name={tonight.people[id]?.name ?? '?'} src={tonight.people[id]?.photo ?? null} size="sm" />
                    <span className="who">
                      <strong>{tonight.people[id]?.name ?? 'Someone'}</strong>
                      <small>Free · Now</small>
                    </span>
                    <span className="right"><span className="dot free" /></span>
                  </div>
                ))}
              </div>
              {tonight.summary.freeNow.length > 4 && (
                <p className="small muted" style={{ marginTop: 6 }}>
                  +{tonight.summary.freeNow.length - 4} more free right now
                </p>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-line btn-sm"
              onClick={() => navigate(`/groups/${topBest?.groupId ?? groups[0].id}`)}
            >
              See who&apos;s free <ArrowRight size={16} />
            </button>
            <button className="btn btn-paper btn-sm" onClick={() => navigate('/availability')}>
              Set my availability
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              className={`btn btn-block ${imFreeTonight ? 'btn-paper' : 'btn-green'}`}
              disabled={imFreeTonight || taraPending || tonight.rowsQ.isLoading}
              onClick={onTaraTonight}
              aria-live="polite"
            >
              <Zap size={16} />{' '}
              {imFreeTonight
                ? "YOU'RE IN TONIGHT"
                : taraPending
                  ? 'Saving…'
                  : 'TARA, G TONIGHT? · 6–10 PM'}
            </button>
          </div>
        </div>
        <div>
          <div className="besthero">
            <span className="kicker">★ BEST UPCOMING WINDOW</span>
            {bestQ.isError ? (
              <>
                <h3>Couldn&apos;t load.</h3>
                <p>Check your connection and try again.</p>
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-green btn-sm" onClick={() => bestQ.refetch()}>
                    Retry
                  </button>
                </div>
              </>
            ) : topBest ? (
              <>
                <h3>
                  {topBest.date === today ? 'Today' : topBest.date} looks good.
                </h3>
                <p className="small" style={{ color: 'var(--green)', fontWeight: 700, letterSpacing: '.08em' }}>
                  {topBest.groupName.toUpperCase()}
                </p>
                <div className="row-between" style={{ marginTop: 10 }}>
                  <div>
                    <div className="bign">
                      {topBest.free}
                      <span style={{ fontSize: 22 }}>/{topBest.total}</span>
                    </div>
                    <p>{topBest.window} · {topBest.free} free</p>
                  </div>
                  <button className="btn btn-green btn-sm" onClick={() => navigate(`/groups/${topBest.groupId}/availability`)}>
                    View plan <ArrowUpRight size={15} />
                  </button>
                </div>
                {bestList.length > 1 && (
                  <div className="rows" style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,.14)' }}>
                    {bestList.slice(1).map((b) => (
                      <button
                        key={b.groupId}
                        className="member-row"
                        style={{ borderBottom: '1px solid rgba(255,255,255,.14)', padding: '10px 2px' }}
                        onClick={() => navigate(`/groups/${b.groupId}/availability`)}
                      >
                        <span className="who">
                          <strong style={{ color: '#fff', fontSize: 14 }}>{b.groupName}</strong>
                          <small style={{ color: '#cfccc2' }}>
                            {b.date === today ? 'Today' : b.date} · {b.window} · {b.free}/{b.total} free
                          </small>
                        </span>
                        <span className="right">
                          <ArrowUpRight size={16} style={{ color: 'var(--green)' }} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h3>No signal yet.</h3>
                <p>Get the barkada moving in 3 steps:</p>
                <div className="rows" style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,.14)' }}>
                  <button
                    className="member-row"
                    style={{ borderBottom: '1px solid rgba(255,255,255,.14)', padding: '10px 2px' }}
                    onClick={() => navigate('/availability')}
                  >
                    <span
                      className="mini-avatar"
                      aria-hidden
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 12,
                        fontWeight: 800,
                        background: (tonight.rowsQ.data?.length ?? 0) > 0 ? 'var(--green)' : 'transparent',
                        border: '1.5px solid var(--green)',
                        color: (tonight.rowsQ.data?.length ?? 0) > 0 ? 'var(--ink)' : 'var(--green)',
                      }}
                    >
                      {(tonight.rowsQ.data?.length ?? 0) > 0 ? '✓' : '1'}
                    </span>
                    <span className="who">
                      <strong style={{ color: '#fff', fontSize: 14 }}>Set your availability</strong>
                      <small style={{ color: '#cfccc2' }}>~20 seconds</small>
                    </span>
                    <span className="right">
                      <ArrowUpRight size={16} style={{ color: 'var(--green)' }} />
                    </span>
                  </button>
                  <button
                    className="member-row"
                    style={{ borderBottom: '1px solid rgba(255,255,255,.14)', padding: '10px 2px' }}
                    onClick={() => navigate(`/groups/${groups[0].id}`)}
                  >
                    <span
                      className="mini-avatar"
                      aria-hidden
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 12,
                        fontWeight: 800,
                        background: groups.some((g) => g.member_count > 1) ? 'var(--green)' : 'transparent',
                        border: '1.5px solid var(--green)',
                        color: groups.some((g) => g.member_count > 1) ? 'var(--ink)' : 'var(--green)',
                      }}
                    >
                      {groups.some((g) => g.member_count > 1) ? '✓' : '2'}
                    </span>
                    <span className="who">
                      <strong style={{ color: '#fff', fontSize: 14 }}>Invite the barkada</strong>
                      <small style={{ color: '#cfccc2' }}>Share the group code</small>
                    </span>
                    <span className="right">
                      <ArrowUpRight size={16} style={{ color: 'var(--green)' }} />
                    </span>
                  </button>
                  <button
                    className="member-row"
                    style={{ borderBottom: '1px solid rgba(255,255,255,.14)', padding: '10px 2px' }}
                    onClick={() => navigate('/g')}
                  >
                    <span
                      className="mini-avatar"
                      aria-hidden
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 12,
                        fontWeight: 800,
                        background: hangouts.length > 0 ? 'var(--green)' : 'transparent',
                        border: '1.5px solid var(--green)',
                        color: hangouts.length > 0 ? 'var(--ink)' : 'var(--green)',
                      }}
                    >
                      {hangouts.length > 0 ? '✓' : '3'}
                    </span>
                    <span className="who">
                      <strong style={{ color: '#fff', fontSize: 14 }}>Start a hangout</strong>
                      <small style={{ color: '#cfccc2' }}>Ask who&apos;s down</small>
                    </span>
                    <span className="right">
                      <ArrowUpRight size={16} style={{ color: 'var(--green)' }} />
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <hr className="rule" />
      <div className="row-between">
        <span className="kicker">YOUR GROUPS · {groups.length}</span>
        <Link className="small link-u" to="/groups">
          Manage
        </Link>
      </div>
      <div className="rows" style={{ marginTop: 6 }}>
        {groups.map((g) => (
          <button key={g.id} className="group-row" onClick={() => navigate(`/groups/${g.id}`)}>
            {g.avatar_url ? (
              <img src={g.avatar_url} alt="" className="gavatar" style={{ objectFit: 'cover' }} />
            ) : (
              <span className="gavatar">
                {g.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="gmeta">
              <strong>{g.name}</strong>
              <span className="countline">
                {g.member_count} MEMBERS · {g.my_role.toUpperCase()}
              </span>
            </span>
            <ArrowRight size={19} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
          </button>
        ))}
      </div>

      <hr className="rule" />
      <div className="row-between">
        <span className="kicker">LIVE NOW · {hangouts.length} ASKING</span>
        <Link className="small link-u" to="/g">
          Open G?
        </Link>
      </div>
      {hangoutsQ.isLoading ? (
        <LoadingRows rows={2} />
      ) : hangoutsQ.isError ? (
        <div style={{ marginTop: 10 }}>
          <ErrorState
            title="Couldn't load hangouts."
            body="Check your connection and try again."
            onRetry={() => hangoutsQ.refetch()}
          />
        </div>
      ) : hangouts.length === 0 ? (
        <div style={{ marginTop: 10 }}>
          <EmptyState
            icon={<Moon size={30} />}
            title="Nothing's happening right now."
            body="Be the one to start something."
            action={
              <Button variant="green" size="sm" onClick={() => navigate('/g')}>
                Start a hangout
              </Button>
            }
          />
        </div>
      ) : (
        hangouts.slice(0, 4).map((h) => (
          <button key={h.id} className="hangitem" onClick={() => navigate(`/g/${h.id}`)}>
            <span className="pulse" />
            <Avatar name={h.creator?.display_name ?? '?'} src={h.creator?.avatar_url} size="sm" />
            <span>
              <strong>{h.creator?.display_name ?? 'Someone'}:</strong> {h.title ?? 'Hangout?'}{' '}
              <span className="muted">· {h.group_name}</span>
              <br />
              <span className="small muted">
                {h.location ?? ''} {h.location ? '· ' : ''}tap to respond
              </span>
            </span>
            <ArrowUpRight size={18} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
          </button>
        ))
      )}

      <div style={{ position: 'sticky', bottom: 84, marginTop: 20 }}>
        <button
          className="btn btn-green btn-block btn-big btn-chunk"
          onClick={() => navigate('/g')}
        >
          WHO&apos;S DOWN?
        </button>
      </div>
    </>
  );
}
