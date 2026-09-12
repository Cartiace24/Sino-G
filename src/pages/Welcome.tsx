import { Navigate } from 'react-router-dom';
import { CalendarDays, MessageCircle, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LoginCard } from '../components/auth/LoginCard';

export function Welcome() {
  const { user, loading, isRecoverySession } = useAuth();
  // Recovery sessions stay put: bouncing them to /today would strand a
  // password reset in the main app.
  if (!loading && user && !isRecoverySession) return <Navigate to="/today" replace />;

  return (
    <div className="landing">
      <div className="landing-brand">
        <p className="kicker">FOR FRIEND GROUPS · BARKADAS · CREWS</p>
        <h1 className="welcome-giant">
          SINO
          <br />
          <span>G?</span>
        </h1>
        <p className="landing-tag">
          <strong>
            Stop asking the group chat.
            <br />
            See who&apos;s free.
          </strong>
        </p>
        <div className="landing-feats">
          <span>
            <Users size={19} aria-hidden />
            Plan hangouts
          </span>
          <span>
            <MessageCircle size={19} aria-hidden />
            Group chat
          </span>
          <span>
            <CalendarDays size={19} aria-hidden />
            Check availability
          </span>
        </div>
      </div>
      <div className="landing-card">
        <LoginCard idPrefix="welcome" />
      </div>
    </div>
  );
}
