/**
 * SecurityCodeGate — ported from contracting-portal
 *
 * Verifies the agent's 6-digit security code before showing the intake form.
 * Calls the verify-security-code edge function for server-side validation —
 * security_code is never fetched by the anon client.
 * Styled for FYM App dark theme.
 */
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { PORTAL_URL, PORTAL_ANON_KEY } from '@/lib/crm';
import type { PortalAgent } from '@/lib/contracting/types';

interface SecurityCodeGateProps {
  onSuccess: (agent: PortalAgent) => void;
  formId: string;
}

export function SecurityCodeGate({ onSuccess, formId }: SecurityCodeGateProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!PORTAL_URL || !PORTAL_ANON_KEY) {
        setError('Portal connection not configured.');
        setLoading(false);
        return;
      }

      // Server-side validation via edge function — security_code is never
      // fetched from the agents table by the anon client.
      const res = await fetch(
        `${PORTAL_URL}/functions/v1/verify-security-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PORTAL_ANON_KEY}`,
          },
          body: JSON.stringify({ formId, securityCode: code }),
        },
      );
      const result = await res.json();

      if (!result.valid) {
        if (result.expired) {
          setError('This link has expired. Please contact Contracting@teamfym.com');
        } else {
          setError('Invalid security code. Please try again.');
        }
        setLoading(false);
        return;
      }

      onSuccess(result.agent as PortalAgent);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="glass-card p-8 w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <Lock className="w-8 h-8 text-primary mr-2" />
          <h2 className="text-2xl font-bold text-foreground">Enter Security Code</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-3 bg-secondary border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-center text-2xl font-mono tracking-wider text-foreground placeholder:text-muted-foreground"
              maxLength={6}
              required
            />
          </div>

          {error && (
            <div className="text-destructive text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
