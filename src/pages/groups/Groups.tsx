import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyGroups, useRealtimeGroupsList } from '../../hooks/useGroups';
import { EmptyState, ErrorState, LoadingRows } from '../../components/common/Feedback';
import { Button } from '../../components/ui/button';

export function Groups() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const groupsQ = useMyGroups(user?.id);
  const groups = groupsQ.data ?? [];
  // Member joins/leaves/role changes and renames land without refresh.
  useRealtimeGroupsList();

  return (
    <>
      <p className="kicker" style={{ marginTop: 14 }}>
        YOUR CREWS · {groups.length}
      </p>
      <h1 className="display lg">
        YOUR
        <br />
        GROUPS.
      </h1>

      {groupsQ.isLoading ? (
        <LoadingRows rows={4} />
      ) : groupsQ.isError ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState
            title="Couldn't load your groups."
            body="Check your connection and try again."
            onRetry={() => groupsQ.refetch()}
          />
        </div>
      ) : groups.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <EmptyState
            icon={<Users size={30} />}
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
        <div className="rows" style={{ marginTop: 12 }}>
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
      )}

      <button className="choice" onClick={() => navigate('/onboarding/group')} style={{ marginTop: 18 }}>
        <span className="k">+ NEW</span>
        <h3 style={{ fontSize: 20 }}>Create or join another</h3>
        <span className="go">
          <Plus size={19} />
        </span>
      </button>
    </>
  );
}
