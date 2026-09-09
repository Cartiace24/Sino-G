import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ImagePlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { profilesService } from '../../services/profiles.service';
import { storageService } from '../../services/storage.service';
import { friendlyError } from '../../utils/errors';
import { useToast } from '../../components/common/Toast';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label } from '../../components/ui/input';

export function OnboardingProfile() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [nameState, setNameState] = useState<'idle' | 'checking' | 'taken' | 'free'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      if (!displayName && profile.display_name && !profile.display_name.startsWith('user_')) {
        setDisplayName(profile.display_name);
      }
      if (!username && profile.username && !/^user_[0-9a-f]{8}/.test(profile.username)) {
        setUsername(profile.username);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Debounced username availability check
  useEffect(() => {
    const clean = username.trim();
    if (clean.length < 3) {
      setNameState('idle');
      return;
    }
    setNameState('checking');
    const t = window.setTimeout(async () => {
      try {
        const free = await profilesService.isUsernameAvailable(clean, user?.id);
        setNameState(free ? 'free' : 'taken');
      } catch {
        setNameState('idle');
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [username, user?.id]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(f);
    setPreview(previewUrl.current);
  };

  // Release the blob URL when the page unmounts.
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const onSubmit = async () => {
    if (!user) return;
    if (!displayName.trim()) {
      setError('Tell the barkada your name first.');
      return;
    }
    if (nameState === 'taken') {
      setError('That username is taken. Try another one.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      if (file) avatarUrl = await storageService.uploadProfileAvatar(user.id, file);
      await profilesService.completeOnboarding(user.id, {
        username: username.trim(),
        display_name: displayName.trim(),
        avatar_url: avatarUrl,
      });
      await refreshProfile();
      toast('<b>You\'re in.</b> Now find your people.');
      navigate('/onboarding/group', { replace: true });
    } catch (err) {
      setError(friendlyError(err, 'Could not save your profile.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <p className="kicker">STEP 1 OF 2</p>
      <h1 className="display lg">
        ALMOST
        <br />
        THERE.
      </h1>
      <p className="lede" style={{ margin: '8px 0 20px' }}>
        How should the barkada know you?
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        {preview || profile?.avatar_url ? (
          <img
            src={preview ?? profile!.avatar_url!}
            alt=""
            className="avatar xl"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <span className="avatar xl av-default" style={{ borderStyle: 'dashed' }}>
            {(displayName.trim()[0] ?? '?').toUpperCase()}
          </span>
        )}
        <div>
          <Button variant="paper" size="sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} /> Upload photo
          </Button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        </div>
      </div>
      <div className="field">
        <Label htmlFor="dn">Display name</Label>
        <Input
          id="dn"
          placeholder="e.g. Isaiah"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="field">
        <Label htmlFor="un">Username</Label>
        <Input
          id="un"
          placeholder="e.g. sai"
          autoCapitalize="off"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
        />
        {nameState === 'taken' && (
          <p className="small" style={{ color: 'var(--busy)', marginTop: 6, fontWeight: 600 }}>
            Taken — try another one.
          </p>
        )}
        {nameState === 'free' && (
          <p className="small" style={{ color: 'var(--free)', marginTop: 6, fontWeight: 600 }}>
            Nice, that one&apos;s free.
          </p>
        )}
      </div>
      <FieldError message={error} />
      <Button variant="dark" size="bigBlock" onClick={onSubmit} disabled={busy}>
        {busy ? 'Saving…' : 'Continue'} <ArrowRight size={18} />
      </Button>
    </div>
  );
}
