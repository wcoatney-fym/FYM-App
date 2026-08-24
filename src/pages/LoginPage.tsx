import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Eye, EyeOff, Loader2, User, Mail } from 'lucide-react';

type LoginMode = 'email' | 'lastname';

export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const [mode, setMode] = useState<LoginMode>('lastname');
  const [email, setEmail] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // For last-name disambiguation when multiple agents share a last name
  const [disambiguation, setDisambiguation] = useState<
    Array<{ id: string; first_name: string; last_name: string; role: string; auth_email: string }>
  >([]);

  if (session && !loading) return <Navigate to="/" replace />;

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) setError('Invalid email or password');
    setSubmitting(false);
  }

  async function handleLastNameLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDisambiguation([]);
    setSubmitting(true);

    try {
      // Look up the synthetic email via the edge function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/provision-roster-logins`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'lookup',
            last_name: lastName.trim(),
            // Use FYM agency_id as default; in the future this could be
            // a dropdown or auto-detected from a subdomain
            agency_id: '338230f2-2058-407c-9507-5aa88d6d5e14',
          }),
        },
      );

      const json = await res.json();

      if (!res.ok) {
        setError(json.error === 'No active agent found with that last name'
          ? 'No agent found with that last name'
          : 'Login failed — please try again');
        setSubmitting(false);
        return;
      }

      const matches: typeof disambiguation = json.matches ?? [];

      if (matches.length === 0) {
        setError('No agent found with that last name');
        setSubmitting(false);
        return;
      }

      // If exactly one match, sign in directly
      if (matches.length === 1) {
        const authEmail = matches[0].auth_email;
        if (!authEmail) {
          setError('Login not provisioned for this agent — contact your admin');
          setSubmitting(false);
          return;
        }
        const { error: signInErr } = await signIn(authEmail, password);
        if (signInErr) setError('Invalid last name or password');
        setSubmitting(false);
        return;
      }

      // Multiple matches — show disambiguation
      setDisambiguation(matches);
      setSubmitting(false);
    } catch {
      setError('Login failed — please try again');
      setSubmitting(false);
    }
  }

  async function handleDisambiguationPick(authEmail: string) {
    setError(null);
    setSubmitting(true);
    setDisambiguation([]);
    const { error: signInErr } = await signIn(authEmail, password);
    if (signInErr) setError('Invalid credentials');
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-glow-drift" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-accent/5 rounded-full blur-3xl animate-glow-drift-reverse" />

      <div className="w-full max-w-sm space-y-6 relative z-10">
        {/* Logo + branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-primary">
            <ShieldCheck size={26} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text">FYM</h1>
            <p className="text-xs text-muted-foreground mt-1">FYM Financial — Agency Platform</p>
          </div>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <Card className="glass-card glow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-foreground">Sign In</CardTitle>

            {/* Login mode toggle */}
            <div className="flex mt-3 bg-secondary/50 rounded-lg p-1 gap-1">
              <button
                type="button"
                onClick={() => { setMode('lastname'); setError(null); setDisambiguation([]); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                  mode === 'lastname'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground/70'
                }`}
              >
                <User size={13} />
                Last Name
              </button>
              <button
                type="button"
                onClick={() => { setMode('email'); setError(null); setDisambiguation([]); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                  mode === 'email'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground/70'
                }`}
              >
                <Mail size={13} />
                Email
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 size={28} className="text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Checking session…</p>
              </div>
            ) : mode === 'email' ? (
              /* ── Email login (Admin) ── */
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@teamfym.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                    className="bg-secondary/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password-email" className="text-muted-foreground">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password-email"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="bg-secondary/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full gradient-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity glow-primary"
                  disabled={submitting}
                >
                  {submitting ? (
                    <><Loader2 size={16} className="animate-spin mr-2" />Signing in…</>
                  ) : (
                    'Sign In'
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Use this for admin accounts. Agents &amp; managers: use <button type="button" onClick={() => setMode('lastname')} className="text-primary hover:underline">Last Name</button> login.
                </p>
              </form>
            ) : (
              /* ── Last Name login (Agent / Manager) ── */
              <form onSubmit={handleLastNameLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="lastname" className="text-muted-foreground">Last Name</Label>
                  <Input
                    id="lastname"
                    type="text"
                    placeholder="Enter your last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoFocus
                    autoComplete="off"
                    className="bg-secondary/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-ln" className="text-muted-foreground">Password</Label>
                  <div className="relative">
                    <Input
                      id="password-ln"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="NPN or manager password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="bg-secondary/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Agents: use your NPN. Managers: use your manager password.</p>
                </div>

                {/* Disambiguation: multiple agents share a last name */}
                {disambiguation.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-foreground/80 font-medium">Multiple agents found — select yours:</p>
                    <div className="space-y-1.5">
                      {disambiguation.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleDisambiguationPick(m.auth_email)}
                          disabled={submitting}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors text-left disabled:opacity-50"
                        >
                          <span className="text-sm text-foreground font-medium">
                            {m.first_name} {m.last_name}
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            m.role === 'admin' ? 'bg-amber-500/15 text-amber-400' :
                            m.role === 'manager' ? 'bg-blue-500/15 text-blue-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {m.role}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2" role="alert">
                    {error}
                  </p>
                )}

                {disambiguation.length === 0 && (
                  <Button
                    type="submit"
                    className="w-full gradient-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity glow-primary"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <><Loader2 size={16} className="animate-spin mr-2" />Signing in…</>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                )}
                <p className="text-xs text-center text-muted-foreground">
                  Admins: use <button type="button" onClick={() => setMode('email')} className="text-primary hover:underline">Email</button> login instead.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
