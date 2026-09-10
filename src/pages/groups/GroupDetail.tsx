import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Link2, MessageCircle, MoreHorizontal, Settings2, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup, useGroupMembers, useMyGroups, useRealtimeGroup } from '../../hooks/useGroups';
import { useUnreadChatGroups } from '../../hooks/useNotifications';
import { useGroupHangouts } from '../../hooks/useHangouts';
import { todayISO } from '../../hooks/useAvailability';
import { groupsService } from '../../services/groups.service';
import { availabilityService } from '../../services/availability.service';
import { friendlyError } from '../../utils/errors';
import { getClearedAt, clearSection } from '../../lib/dismissed';
import { qk } from '../../lib/queryClient';
import { Avatar } from '../../components/common/Avatar';
import { StatusDot } from '../../components/common/StatusDot';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { useToast } from '../../components/common/Toast';
import { useConfirm } from '../../components/common/ConfirmSheet';
import { Button } from '../../components/ui/button';
import type { AvailabilityStatus, MemberRole } from '../../types/database.types';

export function GroupDetail() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const groupQ = useGroup(groupId);
  const membersQ = useGroupMembers(groupId);
  const myGroupsQ = useMyGroups(user?.id);
  const hangoutsQ = useGroupHangouts(groupId);
  // Unread chat signal (derived from message notifications, no extra fetch).
  const unreadChat = useUnreadChatGroups(user?.id);
  // Live joins / leaves / removals / role changes / renames — no refresh.
  useRealtimeGroup(groupId);

  const myRole = myGroupsQ.data?.find((g) => g.id === groupId)?.my_role;
  const isOwner = myRole === 'owner';
  const canManage = isOwner || myRole === 'admin';
  const group = groupQ.data;
  const members = membersQ.data ?? [];

  // Dismissed recent hangouts (viewer-only; nothing is deleted for the group).
  // Items newer than the clear survive, so fresh hangouts keep appearing.
  const clearKey = `recent-hangouts:${groupId ?? 'none'}`;
  const [clearedAt, setClearedAt] = useState<string | null>(() => getClearedAt(clearKey));
  const clearedTs = clearedAt ? new Date(clearedAt).getTime() : null;
  const visibleHangouts = (hangoutsQ.data ?? []).filter((h) => {
    if (clearedTs == null) return true;
    const ts = new Date(h.created_at).getTime();
    return Number.isNaN(ts) || ts > clearedTs;
  });

  const onClearRecent = () => {
    clearSection(clearKey);
    setClearedAt(new Date().toISOString());
    toast('Cleared. New hangouts will show up here.');
  };
  // Which member's inline action menu is open (at most one).
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  /** Targeted refetch after any membership write (realtime covers viewers). */
  const invalidateMembership = () => {
    qc.invalidateQueries({ queryKey: qk.groupMembers(groupId!) });
    qc.invalidateQueries({ queryKey: qk.group(groupId!) });
    qc.invalidateQueries({ queryKey: qk.groupsAll() });
    qc.invalidateQueries({ queryKey: qk.tonightMembers() });
  };

  const leaveMut = useMutation({
    mutationFn: () => groupsService.leave(groupId!, user!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groups(user!.id) });
      toast('Left the group. No hard feelings.');
      navigate('/groups');
    },
    onError: (err) => toast(friendlyError(err, 'Could not leave the group.')),
  });

  const onLeave = async () => {
    if (!group) return;
    const ok = await confirm({
      title: `LEAVE ${group.name.toUpperCase().slice(0, 24)}?`,
      body: 'You will lose access to this group, its availability, and future hangouts.',
      confirmLabel: 'Leave group',
      danger: true,
    });
    if (ok) leaveMut.mutate();
  };

  const removeMut = useMutation({
    mutationFn: (targetUserId: string) => groupsService.removeMember(groupId!, targetUserId),
    onSuccess: () => {
      setOpenMenu(null);
      invalidateMembership();
      toast('Removed from the group.');
    },
    onError: (err) => toast(friendlyError(err, 'Could not remove that member.')),
  });

  const onRemove = async (displayName: string, targetUserId: string) => {
    if (!group) return;
    const ok = await confirm({
      title: `REMOVE ${displayName.toUpperCase().slice(0, 20)}?`,
      body: `${displayName} will lose access to ${group.name} and its future activity.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) removeMut.mutate(targetUserId);
  };

  const roleMut = useMutation({
    mutationFn: ({ targetUserId, role }: { targetUserId: string; role: MemberRole }) =>
      groupsService.makeAdmin(groupId!, targetUserId, role),
    onSuccess: (_d, vars) => {
      setOpenMenu(null);
      invalidateMembership();
      toast(vars.role === 'admin' ? '<b>Admin.</b> They can now manage members.' : 'Back to a regular member.');
    },
    onError: (err) => toast(friendlyError(err, 'Could not change that role.')),
  });

  const onRoleChange = async (displayName: string, targetUserId: string, role: MemberRole) => {
    if (!group) return;
    const ok = await confirm(
      role === 'admin'
        ? {
            title: `MAKE ${displayName.toUpperCase().slice(0, 20)} ADMIN?`,
            body: 'Admins can manage members and hangouts.',
            confirmLabel: 'Make admin',
          }
        : {
            title: 'REMOVE AS ADMIN?',
            body: `${displayName} will become a regular member.`,
            confirmLabel: 'Remove admin',
          },
    );
    if (ok) roleMut.mutate({ targetUserId, role });
  };

  const memberBusy = roleMut.isPending || removeMut.isPending;

  /**
   * Whether the viewer gets an action menu on this row. Mirrors (never
   * exceeds) the backend matrix from migration 0007: owners manage anyone
   * but themselves; admins manage regular members only (remove); members
   * manage nobody. RLS remains the enforcer — this only hides buttons.
   */
  const manageable = (m: { user_id: string; role: MemberRole }): boolean => {
    if (m.user_id === user?.id) return false;
    if (isOwner) return true;
    return myRole === 'admin' && m.role === 'member';
  };

  // Tonight status per member (one batched query, loaded once members arrive)
  const [statusByUser, setStatusByUser] = useState<Record<string, AvailabilityStatus | 'unknown'>>({});
  const memberIdsKey = members.map((m) => m.user_id).join(',');
  useEffect(() => {
    if (members.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await availabilityService.listForDate(
          members.map((m) => m.user_id),
          todayISO(),
        );
        if (cancelled) return;
        const map: Record<string, AvailabilityStatus | 'unknown'> = {};
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        for (const m of members) {
          const own = rows.filter(
            (r) => r.user_id === m.user_id && toMin(r.start_time) <= nowMin && toMin(r.end_time) > nowMin,
          );
          const order: AvailabilityStatus[] = ['busy', 'maybe', 'free'];
          own.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
          map[m.user_id] = own[0]?.status ?? 'unknown';
        }
        setStatusByUser(map);
      } catch {
        /* non-fatal — dashes render instead */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIdsKey]);

  const invite = async () => {
    if (!group) return;
    const link = `${window.location.origin}/onboarding/group?code=${group.invite_code}`;
    try {
      await navigator.clipboard.writeText(`Join ${group.name} on Sino G! Code: ${group.invite_code} — ${link}`);
      setCopied(true);
      toast('<b>Invite copied.</b> Drop it in the GC.');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast(`Code: <b>${group.invite_code}</b>`);
    }
  };

  if (groupQ.isLoading || membersQ.isLoading) return <LoadingRows rows={6} />;
  if (!group) {
    return (
      <div style={{ paddingTop: 30 }}>
        <EmptyState
          icon={<Users size={30} />}
          title="Can't open this group."
          body="You may have been removed, or the link is wrong."
          action={
            <Button variant="line" size="sm" onClick={() => navigate('/groups')}>
              Back to groups
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <Link className="backlink" to="/today" style={{ marginTop: 14 }}>
        <ArrowLeft size={16} /> TODAY
      </Link>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {group.avatar_url ? (
            <img src={group.avatar_url} alt="" className="gavatar big" style={{ objectFit: 'cover' }} />
          ) : (
            <span className="gavatar big">
              {group.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <p className="kicker">{members.length} MEMBERS</p>
            <h1 className="display md">{group.name}</h1>
            {group.description && <p className="small muted">{group.description}</p>}
            <p className="countline">
              CODE <b style={{ fontFamily: 'var(--font-d)', letterSpacing: '.08em' }}>{group.invite_code}</b>
            </p>
          </div>
        </div>
        {canManage && (
          <button className="btn btn-paper btn-sm" onClick={() => navigate(`/groups/${groupId}/settings`)} aria-label="Group settings">
            <Settings2 size={16} />
          </button>
        )}
      </div>

      <div className="row-between" style={{ marginTop: 20 }}>
        <span className="kicker">MEMBERS · {members.length}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="line" size="sm" onClick={invite}>
            {copied ? <Link2 size={15} /> : <UserPlus size={15} />} {copied ? 'Copied!' : 'Invite friends'}
          </Button>
        </div>
      </div>
      <div className="rows" style={{ marginTop: 8 }}>
        {members.map((m) => {
          const st = statusByUser[m.user_id];
          const isSelf = m.user_id === user?.id;
          const showMenu = manageable(m);
          const menuOpen = openMenu === m.user_id;
          return (
            <Fragment key={m.id}>
              <div className="member-row">
                <Avatar name={m.profile.display_name} src={m.profile.avatar_url} size="sm" />
                <span className="who">
                  <strong>
                    {m.profile.display_name}{' '}
                    {isSelf && <span className="muted small">(you)</span>}
                  </strong>
                  <small>
                    @{m.profile.username} ·{' '}
                    {m.role === 'owner' ? (
                      <span className="statusline free"><span className="dot free" /> OWNER</span>
                    ) : m.role === 'admin' ? (
                      <span className="statusline maybe"><span className="dot maybe" /> ADMIN</span>
                    ) : (
                      'member'
                    )}
                  </small>
                </span>
                <span className="right">
                  {st && st !== 'unknown' ? <StatusDot status={st} /> : <span className="small muted">—</span>}
                  {showMenu && (
                    <button
                      className="btn btn-paper btn-sm"
                      aria-label={`Manage ${m.profile.display_name}`}
                      aria-expanded={menuOpen}
                      onClick={() => setOpenMenu(menuOpen ? null : m.user_id)}
                      disabled={memberBusy}
                      style={{ minHeight: 36, padding: '0 10px' }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  )}
                </span>
              </div>
              {showMenu && menuOpen && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 2px 14px 57px' }}>
                  {isOwner && m.role === 'member' && (
                    <Button
                      variant="paper"
                      size="sm"
                      disabled={memberBusy}
                      onClick={() => onRoleChange(m.profile.display_name, m.user_id, 'admin')}
                    >
                      Make Admin
                    </Button>
                  )}
                  {isOwner && m.role === 'admin' && (
                    <Button
                      variant="paper"
                      size="sm"
                      disabled={memberBusy}
                      onClick={() => onRoleChange(m.profile.display_name, m.user_id, 'member')}
                    >
                      Remove Admin
                    </Button>
                  )}
                  <Button
                    variant="paper"
                    size="sm"
                    style={{ color: 'var(--busy)' }}
                    disabled={memberBusy}
                    onClick={() => onRemove(m.profile.display_name, m.user_id)}
                  >
                    {removeMut.isPending ? 'Removing…' : 'Remove from Group'}
                  </Button>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <Button variant="green" size="sm" onClick={() => navigate(`/groups/${groupId}/availability`)}>
          Find best time
        </Button>
        <Button variant="line" size="sm" onClick={() => navigate(`/g?group=${groupId}`)}>
          Ask who&apos;s down
        </Button>
        <Button variant="line" size="sm" onClick={() => navigate(`/groups/${groupId}/chat`)}>
          <MessageCircle size={15} /> Chat
          {groupId && unreadChat.has(groupId) && (
            <span className="dot free" role="img" aria-label="Unread messages" />
          )}
        </Button>
      </div>

      <hr className="rule" />
      <div className="row-between">
        <span className="kicker">RECENT HANGOUTS</span>
        {visibleHangouts.length > 0 && (
          <button className="small link-u muted" onClick={onClearRecent}>
            Clear
          </button>
        )}
      </div>
      {visibleHangouts.length > 0 ? (
        visibleHangouts.slice(0, 5).map((h) => (
          <button key={h.id} className="hangitem" onClick={() => navigate(`/g/${h.id}`)}>
            <Avatar name={h.creator?.display_name ?? '?'} src={h.creator?.avatar_url} size="sm" />
            <span className="small">
              <b>{h.title ?? 'Hangout'}</b> · {h.status}
              <br />
              <span className="muted">
                {h.creator?.display_name} · {new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </span>
          </button>
        ))
      ) : clearedAt ? (
        <p className="small muted" style={{ marginTop: 8 }}>
          Cleared — new hangouts will show up here.
        </p>
      ) : (
        <p className="small muted" style={{ marginTop: 8 }}>
          No hangouts yet. Start the first one.
        </p>
      )}

      <hr className="rule" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {isOwner ? (
          <span className="small muted">You&apos;re the owner — manage or delete the group in <Link className="link-u" to={`/groups/${groupId}/settings`}>settings</Link>.</span>
        ) : (
          <Button variant="paper" size="sm" onClick={onLeave} disabled={leaveMut.isPending}>
            {leaveMut.isPending ? 'Leaving…' : 'Leave group'}
          </Button>
        )}
      </div>
    </>
  );
}
