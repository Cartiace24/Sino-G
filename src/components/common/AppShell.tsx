import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, MessageCircle, Sun, User, Users, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMyGroups } from '../../hooks/useGroups';
import { useRealtimeNotifications, useUnreadChatGroups } from '../../hooks/useNotifications';
import { NotificationBell } from './NotificationBell';
import { cn } from '../../lib/utils';

const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot', '/forgot-password', '/reset-password'];

/**
 * Approved app chrome: desktop sidebar / mobile bottom tab bar.
 * Hidden on public (auth) routes — same behavior as the original design.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { data: myGroups } = useMyGroups(user?.id);
  const unreadChat = useUnreadChatGroups(user?.id);
  const groupRows = (myGroups ?? []).slice(0, 4);
  const extraGroups = (myGroups ?? []).length - groupRows.length;
  // Single app-wide inbox subscription (self-guards when logged out).
  useRealtimeNotifications();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (isPublic) {
    return (
      <div className="main-col">
        <main className="view">
          <Outlet />
        </main>
      </div>
    );
  }

  const initial = profile?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div id="app">
      <aside className="sidebar" aria-label="Primary">
        <div className="row-between" style={{ alignItems: 'center' }}>
          <Link className="brand" to="/today">
            <span className="brand-mark">G?</span>
            <span className="brand-word">SINO&nbsp;G?</span>
          </Link>
          <NotificationBell />
        </div>
        <nav className="side-nav">
          <NavLink to="/today" className={({ isActive }) => (isActive ? 'active' : '')}>
            <Sun size={20} />
            <span>TODAY</span>
          </NavLink>
          <NavLink to="/plan" className={({ isActive }) => (isActive ? 'active' : '')}>
            <CalendarDays size={20} />
            <span>PLAN</span>
          </NavLink>
          <NavLink to="/g" className={({ isActive }) => cn('side-g', isActive && 'active')}>
            <Zap size={20} />
            <span>WHO&apos;S DOWN</span>
          </NavLink>
          <NavLink to="/groups" className={({ isActive }) => (isActive ? 'active' : '')}>
            <Users size={20} />
            <span>GROUPS</span>
          </NavLink>
          <NavLink to="/availability" className={({ isActive }) => (isActive ? 'active' : '')}>
            <Clock size={20} />
            <span>FREE?</span>
          </NavLink>
          <NavLink to="/me" className={({ isActive }) => (isActive ? 'active' : '')}>
            <User size={20} />
            <span>ME</span>
          </NavLink>
        </nav>
        {groupRows.length > 0 && (
          <nav className="side-chats" aria-label="Your groups">
            <span className="side-chats-kicker">GROUPS</span>
            {groupRows.map((g) => {
              const chatActive = pathname === `/groups/${g.id}/chat`;
              return (
                <div className="side-chat" key={g.id}>
                  <NavLink
                    to={`/groups/${g.id}`}
                    end
                    className={({ isActive }) => cn('side-chat-main', isActive && 'active')}
                  >
                    <span className="mini-avatar" aria-hidden>
                      {g.name.trim()[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="name">{g.name}</span>
                  </NavLink>
                  <button
                    className={cn('side-chat-go', chatActive && 'active')}
                    aria-label={unreadChat.has(g.id) ? `Open ${g.name} chat, unread messages` : `Open ${g.name} chat`}
                    onClick={() => navigate(`/groups/${g.id}/chat`)}
                  >
                    <MessageCircle size={15} />
                    {unreadChat.has(g.id) && <span className="dot free" aria-hidden />}
                  </button>
                </div>
              );
            })}
            {extraGroups > 0 && (
              <Link className="small muted" to="/groups" style={{ padding: '4px 12px' }}>
                +{extraGroups} more
              </Link>
            )}
          </nav>
        )}
        <div className="side-foot">
          <button className="btn btn-green btn-block" onClick={() => navigate('/g')}>
            + Start a hangout
          </button>
          <button className="side-user" onClick={() => navigate('/me')}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="avatar" style={{ objectFit: 'cover' }} />
            ) : (
              <span className="avatar av-a">{initial}</span>
            )}
            <span>
              <strong>{profile?.display_name ?? 'You'}</strong>
              <small>@{profile?.username ?? '…'}</small>
            </span>
          </button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <Link className="topbar-brand" to="/today">
            SINO&nbsp;G?
          </Link>
          <Link className="topbar-group" to="/groups" aria-label="Your groups">
            GROUPS ▾
          </Link>
          <NotificationBell />
          <button
            className="topbar-avatar avatar av-a"
            onClick={() => navigate('/me')}
            aria-label="Profile"
            style={profile?.avatar_url ? { overflow: 'hidden', padding: 0 } : undefined}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initial
            )}
          </button>
        </header>

        <main className="view">
          <Outlet />
        </main>

        <nav className="tabbar" aria-label="Primary mobile">
          <NavLink to="/today" className={({ isActive }) => (isActive ? 'active' : '')}>
            <Sun size={20} />
            <span>TODAY</span>
          </NavLink>
          <NavLink to="/plan" className={({ isActive }) => (isActive ? 'active' : '')}>
            <CalendarDays size={20} />
            <span>PLAN</span>
          </NavLink>
          <NavLink to="/g" className={({ isActive }) => cn(isActive && 'active', 'tab-g')}>
            <em>G?</em>
          </NavLink>
          <NavLink to="/availability" className={({ isActive }) => (isActive ? 'active' : '')}>
            <Clock size={20} />
            <span>FREE?</span>
          </NavLink>
          <NavLink to="/me" className={({ isActive }) => (isActive ? 'active' : '')}>
            <User size={20} />
            <span>ME</span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
