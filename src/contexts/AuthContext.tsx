import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { rememberLogin } from '../lib/login-memory';
import { profilesService } from '../services/profiles.service';
import type { ProfileRow } from '../types/database.types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  loading: boolean;
  /** Profile row exists but username/display name were never personalized. */
  needsProfileSetup: boolean;
  /** True while a password-recovery session is active. Recovery sessions must
   *  never be bounced to /today or /onboarding like normal logins. */
  isRecoverySession: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const ONBOARDING_PLACEHOLDER = /^user_[0-9a-f]{8}/;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const [loading, setLoading] = useState(true);
  // Guards against out-of-order profile loads on rapid account switching.
  const loadSeq = useRef(0);

  const loadProfile = async (userId: string) => {
    const seq = ++loadSeq.current;
    try {
      // Trigger may need a beat right after signup — retry once.
      let row = await profilesService.getMyProfile(userId);
      if (!row) {
        await new Promise((r) => setTimeout(r, 800));
        if (loadSeq.current !== seq) return;
        row = await profilesService.getMyProfile(userId);
      }
      if (loadSeq.current !== seq) return;
      setProfile(row);
    } catch {
      if (loadSeq.current !== seq) return;
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Boot must never hang: a partitioned network or a malformed
        // recovery link can stall client initialization forever, which would
        // trap the app on skeletons. After 8s proceed unauthenticated; late
        // auth events below still self-heal the state if recovery succeeds.
        const s = await Promise.race([
          supabase.auth.getSession().then((r) => r.data.session),
          new Promise<null>((res) => setTimeout(() => res(null), 8000)),
        ]);
        if (!mounted) return;
        setSession(s);
        if (s?.user) await loadProfile(s.user.id);
        else setProfile(null);
      } catch {
        // Boot-time session read must never trap the app on skeletons:
        // a corrupt store or malformed recovery link lands unauthenticated
        // instead (ResetPassword then shows its expired-link state).
        if (!mounted) return;
        setSession(null);
        setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (evt, s) => {
      // Track recovery sessions separately: TOKEN_REFRESHED/USER_UPDATED must
      // NOT clear the flag (both fire mid-reset), only a fresh login or a
      // sign-out ends the recovery context.
      if (evt === 'PASSWORD_RECOVERY') setIsRecoverySession(true);
      else if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') setIsRecoverySession(false);
      setSession(s);
      if (s?.user) await loadProfile(s.user.id);
      else setProfile(null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Remember username -> email on this device so the next login accepts the
  // username. Covers password, registration, and OAuth logins uniformly.
  // Placeholder (pre-onboarding) usernames are skipped.
  const sessionEmail = session?.user?.email;
  const profileUsername = profile?.username;
  useEffect(() => {
    if (sessionEmail && profileUsername && !ONBOARDING_PLACEHOLDER.test(profileUsername)) {
      rememberLogin(profileUsername, sessionEmail);
    }
  }, [sessionEmail, profileUsername]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      needsProfileSetup:
        profile != null &&
        (ONBOARDING_PLACEHOLDER.test(profile.username) || !profile.display_name.trim()),
      isRecoverySession,
      refreshProfile: async () => {
        if (session?.user) await loadProfile(session.user.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        // Otherwise the next account to sign in on this device briefly sees
        // the previous user's cached groups, hangouts, and availability.
        queryClient.clear();
      },
    }),
    [session, profile, loading, isRecoverySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
