import { Link, Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Welcome() {
  const { user, loading, isRecoverySession } = useAuth();
  // Recovery sessions stay put: bouncing them to /today would strand a
  // password reset in the main app.
  if (!loading && user && !isRecoverySession) return <Navigate to="/today" replace />;

  return (
    <div className="welcome-hero">
      <p className="kicker">FOR FRIEND GROUPS · BARKADAS · CREWS</p>
      <h1 className="welcome-giant">
        SINO
        <br />
        <span>G?</span>
      </h1>
      <p className="lede" style={{ marginTop: 14, fontSize: 18, color: 'var(--ink)' }}>
        <strong>
          Stop asking the group chat.
          <br />
          See who&apos;s free.
        </strong>
      </p>
      <div className="ticker">
        <div>
          &nbsp;WHO&apos;S FREE TONIGHT? &nbsp;●&nbsp; SINO G? &nbsp;●&nbsp; FIND YOUR BEST TIME
          &nbsp;●&nbsp; ASK THE GROUP ⚡ &nbsp;●&nbsp; WHO&apos;S FREE TONIGHT? &nbsp;●&nbsp; SINO G?
          &nbsp;●&nbsp; FIND YOUR BEST TIME &nbsp;●&nbsp; ASK THE GROUP ⚡ &nbsp;●&nbsp;
        </div>
      </div>
      <Link className="btn btn-dark btn-block btn-big" to="/register">
        Get Started <ArrowRight size={18} />
      </Link>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 14 }}>
        Already have an account?{' '}
        <Link className="link-u" to="/login">
          Log in
        </Link>
      </p>
    </div>
  );
}
