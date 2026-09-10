import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Bell, ChevronRight, ImagePlus, Lock, LogOut, Moon, Trash2, User, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { profilesService } from '../../services/profiles.service';
import { storageService } from '../../services/storage.service';
import { authService } from '../../services/auth.service';
import { getTheme, setTheme, type Theme } from '../../lib/theme';
import { useAlertsEnabled, useNotifEnabled } from '../../lib/preferences';
import { friendlyError } from '../../utils/errors';
import { useToast } from '../../components/common/Toast';
import { Avatar } from '../../components/common/Avatar';
import { Button } from '../../components/ui/button';
import { FieldError, Input, Label, PasswordInput } from '../../components/ui/input';

export function Settings() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [pwOk, setPwOk] = useState<string | null>(null);

  // Shared device prefs (same hooks AppShell/bell/toasts read — toggling
  // here updates everywhere instantly, same-tab + cross-tab).
  const [notif, toggleNotif] = useNotifEnabled();
  const [alerts, toggleAlerts] = useAlertsEnabled();
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  useEffect(() => {
    if (profile) {
      setDisplayName((d) => d || profile.display_name);
      setUsername((u) => u || profile.username);
    }
  }, [profile]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const f = fileRef.current?.files?.[0];
      const prevAvatar = profile?.avatar_url ?? null;
      let avatarUrl = prevAvatar;
      if (f && user) avatarUrl = await storageService.uploadProfileAvatar(user.id, f);
      const updated = await profilesService.updateProfile(user!.id, {
        display_name: displayName.trim(),
        username: username.trim(),
        avatar_url: avatarUrl ?? undefined,
      });
      // Row update won — now the old file is an orphan. Best-effort, never fails the save.
      if (prevAvatar && avatarUrl && prevAvatar !== avatarUrl) {
        void storageService.deleteProfileAvatarByUrl(prevAvatar);
      }
      if (fileRef.current) fileRef.current.value = '';
      return updated;
    },
    onSuccess: async () => {
      setError(null);
      await refreshProfile();
      toast('<b>Saved.</b> Looking good.');
    },
    onError: (err) => setError(friendlyError(err, 'Could not save changes.')),
  });

  const pwMut = useMutation({
    mutationFn: () => authService.updatePassword(pw),
    onSuccess: () => {
      setPw('');
      setPwOk('Password updated.');
    },
    onError: (err) => setError(friendlyError(err, 'Could not update password.')),
  });

  const delMut = useMutation({
    mutationFn: async () => {
      // Removes the profile; memberships, availability, and responses cascade.
      // Groups the user created keep existing with created_by set to NULL.
      const { error } = await supabase.from('profiles').delete().eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await signOut();
      navigate('/', { replace: true });
    },
    onError: (err) => setError(friendlyError(err, 'Could not delete the account.')),
  });

  const onAvatarPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) saveMut.mutate();
  };

  return (
    <>
      <Link className="backlink" to="/me" style={{ marginTop: 14 }}>
        <ArrowLeft size={16} /> PROFILE
      </Link>
      <h1 className="display lg">SETTINGS.</h1>

      <div className="setgroup" style={{ marginTop: 18 }}>
        <span className="kicker">PROFILE</span>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 2px' }}>
          <Avatar name={displayName || profile?.display_name || '?'} src={profile?.avatar_url} size="lg" />
          <div>
            <Button variant="paper" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={15} /> Change photo
            </Button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarPick} />
          </div>
        </div>
        <div className="field">
          <Label>Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <Label>Username</Label>
          <Input value={username} autoCapitalize="off" autoCorrect="off" onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} />
        </div>
        <FieldError message={error} />
        <Button variant="dark" size="block" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          <User size={16} /> {saveMut.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>

      <div className="setgroup">
        <span className="kicker">ACCOUNT</span>
        <div className="field" style={{ marginTop: 10 }}>
          <Label htmlFor="pw">New password</Label>
          <PasswordInput id="pw" autoComplete="new-password" placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {pwOk && <p className="small" style={{ color: 'var(--free)', fontWeight: 600, marginBottom: 8 }}>{pwOk}</p>}
        <button
          className="setrow"
          onClick={() => {
            if (pw.length < 8) {
              setError('Password needs to be at least 8 characters.');
              return;
            }
            setError(null);
            pwMut.mutate();
          }}
        >
          <Lock size={19} /> Change password <ChevronRight size={17} className="chev" />
        </button>
      </div>

      <div className="setgroup">
        <span className="kicker">PREFERENCES</span>
        <button
          type="button"
          className="setrow"
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label="Dark mode"
          onClick={toggleTheme}
        >
          <Moon size={19} /> Dark mode
          <span className="switch" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="setrow"
          role="switch"
          aria-checked={notif}
          aria-label="Notifications"
          onClick={toggleNotif}
        >
          <Bell size={19} /> Notifications
          <span className="switch" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="setrow"
          role="switch"
          aria-checked={alerts}
          aria-label="Hangout alerts"
          onClick={toggleAlerts}
        >
          <Zap size={19} /> Hangout alerts
          <span className="switch" aria-hidden="true" />
        </button>
        <p className="small muted" style={{ padding: '8px 2px' }}>
          Notifications pauses the live inbox badge + realtime refresh. Hangout alerts mutes the
          celebratory toasts (Asked!/Nudged!/You&apos;re down!) — errors still show. Both live on
          this device for now.
        </p>
      </div>

      <div className="setgroup">
        <span className="kicker" style={{ color: 'var(--busy)' }}>DANGER ZONE</span>
        <button
          className="setrow danger"
          onClick={() => {
            if (window.confirm('Delete your Sino G account and profile? Your groups keep going without you. This can\'t be undone.')) {
              delMut.mutate();
            }
          }}
          disabled={delMut.isPending}
        >
          <Trash2 size={19} /> {delMut.isPending ? 'Deleting…' : 'Delete account'}
        </button>
        <button
          className="setrow"
          onClick={async () => {
            await signOut();
            navigate('/', { replace: true });
          }}
        >
          <LogOut size={19} /> Log out
        </button>
      </div>
      <p className="small muted" style={{ textAlign: 'center', marginTop: 10 }}>
        SINO G · v1.0 · made for barkadas
      </p>
    </>
  );
}
