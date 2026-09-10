import { useNavigate } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUnreadCount } from '../../hooks/useNotifications';
import { PREF_KEYS, usePreference } from '../../lib/preferences';

/** Bell with a subtle unread badge. Same icon language as the tab bar. */
export function NotificationBell() {
  const { user } = useAuth();
  const { data: unread = 0 } = useUnreadCount(user?.id);
  const [notifEnabled] = usePreference(PREF_KEYS.notif, true);
  const navigate = useNavigate();

  const showBadge = notifEnabled && unread > 0;
  const label = !notifEnabled
    ? 'Notifications paused (enable in Settings)'
    : unread <= 0
      ? 'Notifications'
      : `${unread <= 9 ? String(unread) : unread < 99 ? '10+' : '99+'} unread notifications`;

  const badge = unread <= 9 ? String(unread) : unread < 99 ? '10+' : '99+';

  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label={label}
      title={label}
      style={{
        position: 'relative',
        width: 38,
        height: 38,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 10,
        color: 'var(--ink)',
        flexShrink: 0,
        opacity: notifEnabled ? 1 : 0.45,
      }}
    >
      {notifEnabled ? <Bell size={20} /> : <BellOff size={20} />}
      {showBadge && (
        <b
          aria-hidden
          style={{
            position: 'absolute',
            top: 1,
            right: 0,
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 999,
            background: 'var(--ink)',
            color: 'var(--green)',
            fontSize: 10.5,
            fontWeight: 800,
            display: 'grid',
            placeItems: 'center',
            letterSpacing: '.02em',
          }}
        >
          {badge}
        </b>
      )}
    </button>
  );
}
