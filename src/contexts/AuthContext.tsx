import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Check if user is an FYM admin. Accepts the session access_token so the
 * query runs as the authenticated user (RLS requires `authenticated` role).
 * Without the token, the Supabase client may still be using the anon key
 * if the internal GoTrueClient hasn't processed the session yet.
 */
async function checkFymAdmin(
  userId: string,
  accessToken?: string,
): Promise<boolean> {
  if (!supabase) return false;
  try {
    // Try the standard Supabase client query first (works when the client
    // has already attached the session JWT internally).
    const { data, error } = await (supabase as any)
      .from('fym_admins')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) return true;

    // Fallback: if the client query returned nothing and we have an
    // explicit access token, query PostgREST directly. This handles the
    // race where getSession() returned the session but the GoTrueClient
    // hasn't attached the JWT to the internal fetch headers yet.
    if (accessToken) {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (baseUrl && anonKey) {
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
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isFymAdmin, setIsFymAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string): Promise<void> {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, agency_id, full_name, npn, writing_number')
        .eq('id', userId)
        .maybeSingle();
      if (!error && data) setProfile(data as Profile);
    } catch {
      // Profile fetch failed — app still works, role-gated nav falls back to adminNav
    }
  }

  async function loadUserContext(
    userId: string,
    accessToken?: string,
  ): Promise<void> {
    await Promise.all([
      fetchProfile(userId),
      checkFymAdmin(userId, accessToken).then(setIsFymAdmin),
    ]);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserContext(
          session.user.id,
          session.access_token,
        ).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserContext(session.user.id, session.access_token);
      } else {
        setProfile(null);
        setIsFymAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setIsFymAdmin(false);
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
