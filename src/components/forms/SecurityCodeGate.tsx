/**
 * SecurityCodeGate — ported from contracting-portal
 *
 * Verifies the agent's 6-digit security code before showing the intake form.
 * Uses portalSupabase to read/write the portal DB (akhojh…).
 */
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
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
      if (!portalSupabase) {
        setError('Portal connection not configured.');
        setLoading(false);
        return;
      }

      const { data: agent, error: fetchError } = await portalSupabase
        .from('agents')
        .select('*')
        .eq('id', formId)
        .eq('security_code', code)
        .single();

      if (fetchError || !agent) {
        setError('Invalid security code. Please try again.');
        setLoading(false);
        return;
      }

      const now = new Date();
      const expirationDate = new Date(agent.expiration_date);

      if (now > expirationDate) {
        setError('This link has expired. Please contact Contracting@teamfym.com');
        setLoading(false);
        return;
      }

      if (agent.status === 'pending') {
        await portalSupabase
          .from('agents')
          .update({ status: 'in-progress' })
          .eq('id', agent.id);

        await portalSupabase.from('activity_log').insert({
          agent_id: agent.id,
          action: 'form_accessed',
          details: `${agent.first_name} ${agent.last_name} accessed the form`,
        });

        agent.status = 'in-progress';
      }

      onSuccess(agent as PortalAgent);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <Lock className="w-8 h-8 text-navy-600 mr-2" />
          <h2 className="text-2xl font-bold text-navy-600">Enter Security Code</h2>
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
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-navy-500 focus:border-transparent text-center text-2xl font-mono tracking-wider"
              maxLength={6}
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-navy-600 text-white py-3 px-4 rounded-md hover:bg-navy-700 transition-colors font-medium disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
