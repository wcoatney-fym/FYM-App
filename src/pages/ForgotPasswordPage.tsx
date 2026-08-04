import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await resetPassword(email);
    if (error) {
      // Don't reveal whether the email exists — always show success
      console.warn('[FYM Auth] password reset error:', error);
    }
    // Always show success to prevent email enumeration
    setSent(true);
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-glow-drift" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-accent/5 rounded-full blur-3xl animate-glow-drift-reverse" />

      <div className="w-full max-w-sm space-y-6 relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-primary">
            <ShieldCheck size={26} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text">FYM</h1>
            <p className="text-xs text-muted-foreground mt-1">FYM Financial — Agency Platform</p>
          </div>
        </div>

        <Card className="glass-card glow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-foreground">Reset Password</CardTitle>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <CheckCircle2 size={40} className="text-accent" />
                <div className="text-center space-y-2">
                  <p className="text-sm text-foreground font-medium">Check your email</p>
                  <p className="text-xs text-muted-foreground">
                    If an account exists for {email}, you'll receive a password reset link shortly.
                  </p>
                </div>
                <Link to="/login">
                  <Button variant="ghost" className="text-primary hover:text-primary/80">
                    <ArrowLeft size={14} className="mr-2" />
                    Back to sign in
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter your email and we'll send you a link to reset your password.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email" className="text-muted-foreground">Email</Label>
                  <Input
                    id="reset-email"
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
                {error && (
                  <p
                    className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                    role="alert"
                    aria-live="polite"
                  >
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full gradient-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity glow-primary"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" />
                      Sending…
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
                <div className="text-center">
                  <Link
                    to="/login"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    <ArrowLeft size={12} />
                    Back to sign in
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
