import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/auth.service';
import { friendlyError } from '../../utils/errors';
import { useToast } from '../../components/common/Toast';
import { LoadingRows } from '../../components/common/Feedback';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label, PasswordInput } from '../../components/ui/input';

function suggestUsername(email: string): string {
  const base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 20);
  return base.length >= 3 ? base : `user_${base}`;
}

export function Register() {
  const { user, loading, isRecoverySession } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  if (!loading && user && !isRecoverySession) return <Navigate to="/today" replace />;

  // Boot gate like Login: don't flash the signup form during session restore.
  if (loading) {
    return (
      <div className="auth-wrap">
        <LoadingRows rows={3} />
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password needs to be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match. Try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const local = suggestUsername(email.trim());
      await authService.signUp(email.trim(), password, {
        username: local,
        display_name: local,
      });
      navigate('/onboarding/profile', { replace: true });
    } catch (err) {
      setError(friendlyError(err, 'Could not create your account. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setGoogleBusy(true);
    try {
      await authService.signInWithGoogle();
    } catch (err) {
      toast(friendlyError(err, 'Google signup failed.'));
      setGoogleBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <Link className="backlink" to="/">
        <ArrowLeft size={16} /> BACK
      </Link>
      <p className="kicker">30 SECONDS, PROMISE</p>
      <h1 className="display lg">
        JOIN
        <br />
        SINO G.
      </h1>
      <div style={{ height: 20 }} />
      <form onSubmit={onSubmit}>
        <div className="field">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="confirm">Confirm password</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder="Repeat it"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <FieldError message={error} />
        <Button type="submit" variant="green" size="bigBlock" disabled={busy}>
          {busy ? 'Creating…' : 'Create Account'}
        </Button>
      </form>
      <div className="divider-or">OR</div>
      <Button variant="paper" size="block" onClick={onGoogle} disabled={googleBusy}>
        {googleBusy ? 'Opening Google…' : 'Continue with Google'}
      </Button>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 18 }}>
        Already in?{' '}
        <Link className="link-u" to="/login">
          Log in
        </Link>
      </p>
    </div>
  );
}
