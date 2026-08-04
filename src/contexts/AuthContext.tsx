import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export type UserRole = 'agent' | 'manager' | 'admin';

interface Profile {
  id: string;
  role: UserRole;
  agency_id: string | null;
  full_name: string | null;
  npn: string | null;
  writing_number: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  agencyId: string | null;
  isFymAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Check fym_admins table. Uses explicit fetch to guarantee the JWT is sent. */
async function checkFymAdminTable(
  userId: string,
  accessToken: string,
): Promise<boolean> {
  try {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!baseUrl || !anonKey) return false;
    const url = `${baseUrl}/rest/v1/fym_admins?select=id&user_id=eq.${userId}`;
    const res = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (res.ok) {
      const rows = await res.json();
      return Array.isArray(rows) && rows.length > 0;
    }
    console.warn('[FYM Auth] fym_admins fetch failed:', res.status);
    return false;
  } catch (err) {
    console.warn('[FYM Auth] fym_admins fetch error:', err);
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isFymAdmin, setIsFymAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  // Guard: once loadUserContext has resolved at least once, don't let a
  // stale onAuthStateChange event with null session reset isFymAdmin.
  const contextLoadedRef = useRef(false);
  // Deduplicate: track in-flight loadUserContext to avoid parallel runs.
  const loadingRef = useRef<Promise<void> | null>(null);
  // Track which user ID the in-flight load is for.
  const loadingUserRef = useRef<string | null>(null);

  async function loadUserContext(
    userId: string,
    accessToken: string,
  ): Promise<void> {
    console.log('[FYM Auth] loadUserContext start', { userId: userId.slice(0, 8) });

    // Fetch profile
    let fetchedProfile: Profile | null = null;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, role, agency_id, full_name, npn, writing_number')
          .eq('id', userId)
          .maybeSingle();
        if (!error && data) {
          fetchedProfile = data as Profile;
          setProfile(fetchedProfile);
        } else {
          console.warn('[FYM Auth] profile fetch:', error?.message ?? 'no data');
        }
      } catch (err) {
        console.warn('[FYM Auth] profile fetch error:', err);
      }
    }

    // Check fym_admins table (explicit fetch — no Supabase client timing dependency)
    const inTable = await checkFymAdminTable(userId, accessToken);
    console.log('[FYM Auth] fym_admins table check:', inTable);

    // Derive admin status: in fym_admins table OR profile.role === 'admin'
    // The profile.role fallback handles cases where the fym_admins query
    // fails for any reason (RLS timing, network, etc.)
    const isAdmin = inTable || (fetchedProfile?.role === 'admin');
    console.log('[FYM Auth] final isFymAdmin:', isAdmin, {
      inTable,
      profileRole: fetchedProfile?.role ?? 'null',
    });

    setIsFymAdmin(isAdmin);
    contextLoadedRef.current = true;
  }

  // Safety net: if loading is still true after 8 seconds, force it false.
  // This prevents infinite spinners from any auth edge case.
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('[FYM Auth] loading timeout — forcing loading=false after 8s');
        }
        return false;
      });
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Use onAuthStateChange as the SOLE trigger for loading user context.
    // In Supabase JS v2, it fires INITIAL_SESSION before getSession resolves,
    // so we don't need getSession at all for the initial load.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[FYM Auth] onAuthStateChange:', event, session ? 'has session' : 'no session');

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user && session.access_token) {
        // Deduplicate: if a load is already in flight for the SAME user, skip.
        // Clear the ref if the user changed (e.g. sign-out + sign-in as different user).
        if (loadingRef.current) {
          if (loadingUserRef.current === session.user.id) {
            console.log('[FYM Auth] skipping duplicate loadUserContext');
            return;
          }
          // Different user — allow new load
          loadingRef.current = null;
        }
        loadingUserRef.current = session.user.id;
        const p = loadUserContext(session.user.id, session.access_token).finally(() => {
          loadingRef.current = null;
          setLoading(false);
        });
        loadingRef.current = p;
      } else if (event === 'SIGNED_OUT') {
        // Only reset on explicit sign-out, not on transient null-session events
        console.log('[FYM Auth] SIGNED_OUT — resetting');
        setProfile(null);
        setIsFymAdmin(false);
        contextLoadedRef.current = false;
        setLoading(false);
      } else if (!contextLoadedRef.current) {
        // No session and context never loaded — genuinely not logged in
        console.log('[FYM Auth] no session, never loaded — setting loading=false');
        setLoading(false);
      } else {
        // Context was loaded before but we got a null-session event (e.g., token
        // refresh hiccup). DON'T reset isFymAdmin — keep the last known state.
        console.log('[FYM Auth] ignoring null-session event (context already loaded)');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function resetPassword(email: string) {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    // State reset handled by onAuthStateChange SIGNED_OUT event
  }

  return (
    <AuthContext.Provider value={{
      session,
      user,
      profile,
      role: profile?.role ?? null,
      agencyId: profile?.agency_id ?? null,
      isFymAdmin,
      loading,
      signIn,
      resetPassword,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
