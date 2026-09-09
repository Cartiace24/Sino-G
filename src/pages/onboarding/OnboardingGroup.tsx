import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { groupsService } from '../../services/groups.service';
import { friendlyError, errorMessage } from '../../utils/errors';
import { normalizeInviteCode } from '../../utils/invite-generator';
import { useToast } from '../../components/common/Toast';
import { qk } from '../../lib/queryClient';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';

export function OnboardingGroup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [params] = useSearchParams();
  // GroupDetail's invite link lands here as /onboarding/group?code=XXXXXX —
  // honor it by opening the join form with the code prefilled.
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>(params.get('code') ? 'join' : 'choose');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    if (user) qc.invalidateQueries({ queryKey: qk.groups(user.id) });
    navigate('/today', { replace: true });
  };

  const createMut = useMutation({
    mutationFn: () => groupsService.create(user!.id, { name: name.trim(), description }),
    onSuccess: (g) => {
      setError(null);
      toast(`<b>${g.name} is live.</b> Invite the barkada.`);
      done();
    },
    // Surface the REAL Supabase/PostgREST error so RLS or constraint
    // failures are diagnosable instead of masked by a generic message.
    // NOTE: Supabase throws plain {message, details, hint, code} objects, not
    // Error instances — errorMessage() handles both shapes.
    onError: (err) => {
      setError(`Couldn't create the group: ${errorMessage(err)}`);
    },
  });

  const joinMut = useMutation({
    mutationFn: () => groupsService.joinByCode(normalizeInviteCode(code)),
    onSuccess: () => {
      toast('<b>You\'re in.</b> Say hi to the group.');
      done();
    },
    onError: (err) => setError(friendlyError(err, 'Could not join that group.')),
  });

  // Single connected form handler: prevent default, validate, then mutate.
  // No nested forms, no programmatic .submit() — the submit button below
  // (type="submit") is the only submission path.
  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError('Give your group a name first.');
      return;
    }
    if (clean.length > 60) {
      setError('Keep the group name under 60 characters.');
      return;
    }
    setError(null);
    createMut.mutate();
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    joinMut.mutate();
  };

  return (
    <div className="auth-wrap" style={{ maxWidth: 520 }}>
      <p className="kicker">STEP 2 OF 2</p>
      <h1 className="display lg">WHAT BRINGS YOU HERE?</h1>
      <div style={{ height: 18 }} />

      {mode === 'choose' && (
        <>
          <button className="choice green" onClick={() => setMode('create')}>
            <span className="k">★ START FRESH</span>
            <h3>Create a group</h3>
            <p>Start your own barkada. Invite them in seconds.</p>
            <span className="go">
              <Plus size={19} />
            </span>
          </button>
          <button className="choice" onClick={() => setMode('join')}>
            <span className="k">✦ GOT A CODE?</span>
            <h3>Join a group</h3>
            <p>Enter the invite code from your friends.</p>
            <span className="go">
              <ArrowRight size={19} />
            </span>
          </button>
          <p className="small muted" style={{ textAlign: 'center', marginTop: 6 }}>
            <Link className="link-u" to="/today">
              I&apos;ll do this later
            </Link>
          </p>
        </>
      )}

      {mode === 'create' && (
        <form onSubmit={onCreate}>
          <div className="field">
            <Label htmlFor="gname">Group name</Label>
            <Input
              id="gname"
              placeholder="e.g. The Boys"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <Label htmlFor="gdesc">Description (optional)</Label>
            <Input
              id="gdesc"
              placeholder="What is this crew about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <FieldError message={error} />
          <Button type="submit" variant="green" size="bigBlock" disabled={createMut.isPending}>
            {createMut.isPending ? 'Creating…' : 'Create group'}
          </Button>
          {/* type="button": must NOT submit — it unmounts this form, and a
              submit racing an unmount is exactly what Chrome reports as
              "Form submission canceled because the form is not connected". */}
          <Button type="button" variant="paper" size="block" onClick={() => setMode('choose')} style={{ marginTop: 10 }}>
            Back
          </Button>
        </form>
      )}

      {mode === 'join' && (
        <form onSubmit={onJoin}>
          <div className="field">
            <Label htmlFor="code">Invite code</Label>
            <Input
              id="code"
              placeholder="e.g. TB8X2K"
              autoCapitalize="characters"
              autoCorrect="off"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoFocus
              style={{ fontFamily: 'var(--font-d)', fontWeight: 800, letterSpacing: '.1em' }}
            />
          </div>
          <FieldError message={error} />
          <Button type="submit" variant="dark" size="bigBlock" disabled={joinMut.isPending}>
            {joinMut.isPending ? 'Joining…' : 'Join group'}
          </Button>
          {/* type="button": same as above — never an implicit submit. */}
          <Button type="button" variant="paper" size="block" onClick={() => setMode('choose')} style={{ marginTop: 10 }}>
            Back
          </Button>
          <div className="empty" style={{ marginTop: 14 }}>
            <p className="small">
              <b style={{ color: 'var(--ink)' }}>No code yet?</b>
              <br />
              Ask anyone in the group — it&apos;s 6 characters, takes 5 seconds.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
