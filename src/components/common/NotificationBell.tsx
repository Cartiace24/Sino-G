import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useUnreadCount } from '../../hooks/useNotifications';

/** Bell with a subtle unread badge. Same icon language as the tab bar. */
export function NotificationBell() {
  const { user } = useAuth();
  const { data: unread = 0 } = useUnreadCount(user?.id);
  const navigate = useNavigate();

  const label = unread <= 9 ? String(unread) : unread < 99 ? '10+' : '99+';

  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label={unread > 0 ? `${label} unread notifications` : 'Notifications'}
      style={{
        position: 'relative',
        width: 38,
        height: 38,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 10,
        color: 'var(--ink)',
        flexShrink: 0,
      }}
    >
      <Bell size={20} />
      {unread > 0 && (
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
          {label}
        </b>
      )}
    </button>
  );
}
