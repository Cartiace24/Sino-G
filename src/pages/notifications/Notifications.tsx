import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, Check, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  useClearNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from '../../hooks/useNotifications';
import { friendlyError } from '../../utils/errors';
import { timeAgo } from '../../utils/time';
import { Avatar } from '../../components/common/Avatar';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { useConfirm } from '../../components/common/ConfirmSheet';
import { Button } from '../../components/ui/button';
import type { NotificationWithActor } from '../../types/app.types';

/** Deep-link target per type; every branch has a safe fallback because the
 *  linked group/hangout may be deleted or inaccessible by open time. */
export function notificationTarget(n: NotificationWithActor): string {
  switch (n.type) {
    case 'member_joined':
    case 'promoted_to_admin':
    case 'demoted_to_member':
      return n.group_id ? `/groups/${n.group_id}` : '/groups';
    case 'member_removed':
      return '/groups';
    case 'new_message':
      return n.group_id ? `/groups/${n.group_id}/chat` : '/groups';
    case 'hangout_created':
    case 'hangout_response':
    case 'hangout_cancelled':
    case 'hangout_closed':
    case 'hangout_nudge':
    case 'hangout_updated':
      if (n.hangout_id) return `/g/${n.hangout_id}`;
      if (n.group_id) return `/groups/${n.group_id}`;
      return '/g';
  }
}

export function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const listQ = useNotifications(user?.id);
  const unreadQ = useUnreadCount(user?.id);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const clearAll = useClearNotifications();
  const confirm = useConfirm();

  const items = listQ.data ?? [];
  const unread = unreadQ.data ?? 0;

  const open = (n: NotificationWithActor) => {
    // Fire-and-forget: navigation must never wait on the read mutation.
    if (!n.read_at) markRead.mutate(n.id);
    navigate(notificationTarget(n));
  };

  const onClear = async () => {
    const ok = await confirm({
      title: 'CLEAR INBOX?',
      body: "This can't be undone. New activity will still notify you.",
      confirmLabel: 'Clear all',
      danger: true,
    });
    if (ok) clearAll.mutate();
  };

  return (
    <>
      <div className="row-between" style={{ marginTop: 14, alignItems: 'flex-end' }}>
        <div>
          <p className="kicker">INBOX{unread > 0 ? ` · ${unread} UNREAD` : ''}</p>
          <h1 className="display lg">WHAT&apos;S NEW.</h1>
        </div>
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
            <button
              className="small link-u muted"
              disabled={clearAll.isPending}
              onClick={onClear}
            >
              {clearAll.isPending ? 'Clearing…' : 'Clear'}
            </button>
            {unread > 0 && (
              <Button
                variant="paper"
                size="sm"
                disabled={markAll.isPending}
                onClick={() => markAll.mutate()}
              >
                <Check size={15} /> {markAll.isPending ? 'Clearing…' : 'Mark all read'}
              </Button>
            )}
          </div>
        )}
      </div>

      {listQ.isLoading ? (
        <LoadingRows rows={5} />
      ) : listQ.isError ? (
        <div style={{ marginTop: 16 }}>
          <EmptyState
            icon={<Bell size={30} />}
            title="Couldn't load notifications."
            body={friendlyError(listQ.error, 'Try again in a bit.')}
            action={
              <Button variant="line" size="sm" onClick={() => listQ.refetch()}>
                Retry
              </Button>
            }
          />
        </div>
      ) : items.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <EmptyState
            icon={<BellOff size={30} />}
            title="No notifications yet."
            body="When the barkada moves — joins, hangouts, responses — you'll see it here."
          />
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {items.map((n) => {
            const fresh = !n.read_at;
            const actorName = n.actor?.display_name ?? 'Sino G';
            return (
              <button key={n.id} className="hangitem" onClick={() => open(n)}>
                {fresh && <span className="dot free" style={{ marginTop: 7 }} />}
                <Avatar name={actorName} src={n.actor?.avatar_url} />
                <span>
                  <strong style={fresh ? undefined : { fontWeight: 500 }}>{n.title}</strong>
                  <br />
                  <span className="small muted">
                    {n.body ? `${n.body} · ` : ''}
                    {timeAgo(n.created_at)}
                  </span>
                </span>
                {fresh ? (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Mark as read"
                    onClick={(e) => {
                      e.stopPropagation();
                      markRead.mutate(n.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        markRead.mutate(n.id);
                      }
                    }}
                    style={{ marginLeft: 'auto', color: 'var(--muted)', display: 'grid', placeItems: 'center', padding: 6 }}
                  >
                    <Check size={17} />
                  </span>
                ) : (
                  <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--muted)', flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
