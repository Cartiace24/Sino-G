import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/auth.service';
import { getLastUsername, resolveLoginEmail } from '../../lib/login-memory';
import { friendlyError } from '../../utils/errors';
import { useToast } from '../../components/common/Toast';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label, PasswordInput } from '../../components/ui/input';

export function Login() {
  const { user, loading, isRecoverySession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [identifier, setIdentifier] = useState(() => getLastUsername() ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  if (!loading && user && !isRecoverySession) return <Navigate to="/today" replace />;

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
        setError('First time on this device? Use your email — we\'ll remember your @username after.');
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
    <div className="auth-wrap">
      <Link className="backlink" to="/">
        <ArrowLeft size={16} /> BACK
      </Link>
      <p className="kicker">SINO G</p>
      <h1 className="display lg">
        LOG
        <br />
        IN.
      </h1>
      <div style={{ height: 20 }} />
      <form onSubmit={onSubmit}>
        <div className="field">
          <Label htmlFor="identifier">Email or username</Label>
          <Input
            id="identifier"
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="you@email.com or @sai"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="row-between" style={{ margin: '2px 0 18px' }}>
          <span />
          <Link className="small link-u" to="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <FieldError message={error} />
        <Button type="submit" variant="dark" size="bigBlock" disabled={busy}>
          {busy ? 'Logging in…' : 'Log In'}
        </Button>
      </form>
      <div className="divider-or">OR</div>
      <Button variant="paper" size="block" onClick={onGoogle} disabled={googleBusy}>
        {googleBusy ? 'Opening Google…' : 'Continue with Google'}
      </Button>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 18 }}>
        New here?{' '}
        <Link className="link-u" to="/register">
          Create an account
        </Link>
      </p>
    </div>
  );
}
