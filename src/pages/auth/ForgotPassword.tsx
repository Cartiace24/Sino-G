import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { friendlyError } from '../../utils/errors';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authService.requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(friendlyError(err, 'Could not send the reset email.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <Link className="backlink" to="/login">
        <ArrowLeft size={16} /> BACK
      </Link>
      <p className="kicker">SINO G</p>
      <h1 className="display lg">
        FORGOT YOUR
        <br />
        PASSWORD?
      </h1>
      <p className="lede" style={{ margin: '8px 0 20px' }}>
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      {sent ? (
        <div className="empty">
          <p className="small">
            <b style={{ color: 'var(--ink)' }}>CHECK YOUR EMAIL</b>
            <br />
            If an account exists for that email, we&apos;ve sent password reset instructions.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="field">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <FieldError message={error} />
          <Button type="submit" variant="dark" size="bigBlock" disabled={busy}>
            {busy ? 'Sending…' : 'SEND RESET LINK'}
          </Button>
        </form>
      )}
      <p className="small muted" style={{ textAlign: 'center', marginTop: 18 }}>
        <Link className="link-u" to="/login">
          Back to login
        </Link>
      </p>
    </div>
  );
}
