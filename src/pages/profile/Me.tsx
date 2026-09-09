import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Pencil, Plus, Settings2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyGroups, useRealtimeGroupsList } from '../../hooks/useGroups';
import { Avatar } from '../../components/common/Avatar';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { Button } from '../../components/ui/button';

export function Me() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const groupsQ = useMyGroups(user?.id);
  const groups = groupsQ.data ?? [];
  // Counts stay current as membership churns.
  useRealtimeGroupsList();

  return (
    <>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 18 }}>
        <Avatar name={profile?.display_name ?? '?'} src={profile?.avatar_url} size="xl" />
        <div>
          <p className="kicker">@{profile?.username ?? '…'}</p>
          <h1 className="display md">{(profile?.display_name ?? 'YOU').toUpperCase()}</h1>
          <p className="small muted">
            {groups.length} group{groups.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <Button variant="line" size="sm" onClick={() => navigate('/settings')}>
          <Pencil size={15} /> Edit profile
        </Button>
        <Button variant="green" size="sm" onClick={() => navigate('/availability')}>
          <Clock size={15} /> Set availability
        </Button>
      </div>

      <hr className="rule" />
      <div className="row-between">
        <span className="kicker">MY GROUPS · {groups.length}</span>
        <Button variant="paper" size="sm" onClick={() => navigate('/groups')}>
          All <ArrowRight size={15} />
        </Button>
      </div>
      {groupsQ.isLoading ? (
        <LoadingRows rows={3} />
      ) : groups.length === 0 ? (
        <div style={{ marginTop: 10 }}>
          <EmptyState
            icon={null}
            title="You haven't found your people yet."
            body="Start your own barkada or join one with a code."
            action={
              <Button variant="green" size="sm" onClick={() => navigate('/onboarding/group')}>
                Create or join
              </Button>
            }
          />
        </div>
      ) : (
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
                <small>
                  {g.member_count} MEMBERS · {g.my_role.toUpperCase()}
                </small>
              </span>
              <ArrowRight size={19} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
            </button>
          ))}
        </div>
      )}

      <button className="choice" onClick={() => navigate('/onboarding/group')} style={{ marginTop: 18 }}>
        <span className="k">+ NEW</span>
        <h3 style={{ fontSize: 20 }}>Create or join another</h3>
        <span className="go">
          <Plus size={19} />
        </span>
      </button>
      <Button variant="paper" size="block" onClick={() => navigate('/settings')} style={{ marginTop: 4 }}>
        <Settings2 size={16} /> Settings
      </Button>
    </>
  );
}
