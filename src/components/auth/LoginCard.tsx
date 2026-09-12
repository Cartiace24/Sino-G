import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Chrome, Lock, User } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { getLastUsername, resolveLoginEmail } from '../../lib/login-memory';
import { friendlyError } from '../../utils/errors';
import { useToast } from '../../components/common/Toast';
import { Button } from '../../components/ui/button';
import { FieldError, Input, PasswordInput } from '../../components/ui/input';

/**
 * Reference panel 1 login card, shared by Welcome (split) and /login.
 * Pure form — parents own the authed-user redirect.
 */
export function LoginCard({ idPrefix = 'login' }: { idPrefix?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [identifier, setIdentifier] = useState(() => getLastUsername() ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = identifier.trim();
    if (!clean || !password) {
      setError('Enter your email or username, plus your password.');
      return;
    }
    // A leading @handle is a username; an @ anywhere else means email.
    const isEmail = clean.includes('@', 1);
    let email = clean;
    if (!isEmail) {
      if (clean.length < 3) {
        setError('Usernames need at least 3 characters — or use your email.');
        return;
      }
      const mapped = resolveLoginEmail(clean);
      if (!mapped) {
        setError("First time on this device? Use your email — we'll remember your @username after.");
        return;
      }
      email = mapped;
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authService.signIn(email, password);
      const from = (location.state as { from?: string } | null)?.from ?? '/today';
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyError(err, 'Could not log you in. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setGoogleBusy(true);
    try {
      await authService.signInWithGoogle();
    } catch (err) {
      toast(friendlyError(err, 'Google login failed.'));
      setGoogleBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <p className="auth-title">Welcome back</p>
      <p className="auth-sub">Log in to continue to SINO G?</p>
      <form onSubmit={onSubmit}>
        <div className="auth-field">
          <User size={16} aria-hidden />
          <Input
            id={`${idPrefix}-identifier`}
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Email or username"
            aria-label="Email or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <Lock size={16} aria-hidden />
          <PasswordInput
            id={`${idPrefix}-password`}
            autoComplete="current-password"
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="auth-row">
          <span />
          <Link className="auth-forgot" to="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <FieldError message={error} />
        <Button type="submit" variant="green" size="block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log In'}
        </Button>
      </form>
      <div className="divider-or">or</div>
      <button type="button" className="auth-google" onClick={onGoogle} disabled={googleBusy}>
        <Chrome size={17} aria-hidden />
        {googleBusy ? 'Opening Google…' : 'Continue with Google'}
      </button>
      <p className="auth-swap">
        Don&apos;t have an account? <Link to="/register">Sign up</Link>
      </p>
    </div>
  );
}
