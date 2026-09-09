import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyGroups, useRealtimeGroupsList } from '../../hooks/useGroups';
import { todayISO, useTonight } from '../../hooks/useAvailability';
import { useMyHangouts, useRealtimeHangouts } from '../../hooks/useHangouts';
import { groupsService } from '../../services/groups.service';
import { availabilityService } from '../../services/availability.service';
import { calculateGroupAvailability, findBestSlot } from '../../utils/availability-calculator';
import { Avatar, AvatarStack } from '../../components/common/Avatar';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
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

  // Best upcoming window across the first group, next 3 days.
  const bestQ = useQuery({
    queryKey: ['best-upcoming', groups[0]?.id ?? 'none', today],
    queryFn: async () => {
      const gid = groups[0]!.id;
      const members = await groupsService.members(gid);
      const ids = members.map((m) => m.user_id);
      const dates = [todayISO(0), todayISO(1), todayISO(2)];
      const perDay = await Promise.all(
        dates.map(async (d) => ({
          date: d,
          rows: await availabilityService.listForDate(ids, d),
        })),
      );
      let best: { date: string; label: string; free: number; total: number; score: number } | null = null;
      for (const { date, rows } of perDay) {
        const slots = calculateGroupAvailability(ids, rows);
        const found = findBestSlot(slots);
        // Compare true scores: free count alone ignores maybe-points and can
        // crown a lower-scoring day.
        if (found && (!best || found.slot.score > best.score)) {
          best = { date, label: found.slot.label, free: found.slot.free, total: ids.length, score: found.slot.score };
        }
      }
      return best;
    },
    enabled: groups.length > 0,
    staleTime: 60_000,
  });

  if (groupsQ.isLoading) return <LoadingRows rows={6} />;

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
          icon={null}
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
          <button className="btn btn-line btn-sm" onClick={() => navigate(`/groups/${groups[0].id}`)} style={{ marginTop: 10 }}>
            See who&apos;s free <ArrowRight size={16} />
          </button>
        </div>
        <div>
          <div className="besthero">
            <span className="kicker">★ BEST UPCOMING WINDOW</span>
            {bestQ.data ? (
              <>
                <h3>
                  {bestQ.data.date === today ? 'Today' : bestQ.data.date} looks good.
                </h3>
                <div className="row-between" style={{ marginTop: 10 }}>
                  <div>
                    <div className="bign">
                      {bestQ.data.free}
                      <span style={{ fontSize: 22 }}>/{bestQ.data.total}</span>
                    </div>
                    <p>available · {bestQ.data.label}</p>
                  </div>
                  <button className="btn btn-green btn-sm" onClick={() => navigate(`/groups/${groups[0].id}/availability`)}>
                    View plan <ArrowUpRight size={15} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>No signal yet.</h3>
                <p>Once the group marks availability, the best time shows up here.</p>
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-green btn-sm" onClick={() => navigate('/availability')}>
                    Set availability
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
      ) : hangouts.length === 0 ? (
        <div style={{ marginTop: 10 }}>
          <EmptyState
            icon={null}
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
