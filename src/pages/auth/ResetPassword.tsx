import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/auth.service';
import { friendlyError } from '../../utils/errors';
import { useToast } from '../../components/common/Toast';
import { LoadingRows } from '../../components/common/Feedback';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';

export function ResetPassword() {
  const { user, loading, isRecoverySession, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A recovery link is only valid with a live recovery session. The context
  // flag covers events observed while mounted; the URL-hash check covers
  // links processed during app boot before any listener attached. A normal
  // login alone is deliberately NOT enough (presence-only check — no tokens
  // are parsed, stored, or logged).
  const [hashRecovery] = useState(() => window.location.hash.includes('type=recovery'));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password needs to be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authService.updatePassword(password);
      setPassword('');
      setConfirm('');
      toast('<b>PASSWORD UPDATED</b><br/>Please sign in with your new password.');
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(friendlyError(err, 'Could not update your password. The link may have expired.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-wrap">
        <LoadingRows rows={3} />
      </div>
    );
  }

  if (!isRecoverySession && !(hashRecovery && user)) {
    return (
      <div className="auth-wrap">
        <p className="kicker">SINO G</p>
        <h1 className="display lg">
          THIS LINK
          <br />
          HAS EXPIRED
        </h1>
        <p className="lede" style={{ margin: '8px 0 20px' }}>
          Request a new password reset link.
        </p>
        <Button variant="dark" size="bigBlock" onClick={() => navigate('/forgot-password')}>
          REQUEST NEW LINK
        </Button>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 18 }}>
          <Link className="link-u" to="/login">
            Back to login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <p className="kicker">SINO G</p>
      <h1 className="display lg">
        RESET YOUR
        <br />
        PASSWORD
      </h1>
      <p className="lede" style={{ margin: '8px 0 20px' }}>
        Choose a new password for your account.
      </p>
      <form onSubmit={onSubmit}>
        <div className="field">
          <Label htmlFor="password">New Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="confirm">Confirm Password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <FieldError message={error} />
        <Button type="submit" variant="dark" size="bigBlock" disabled={busy}>
          {busy ? 'Saving…' : 'UPDATE PASSWORD'}
        </Button>
      </form>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 18 }}>
        <Link className="link-u" to="/login">
          Back to login
        </Link>
      </p>
    </div>
  );
}
