/**
 * LobAssignment — Lines of Business assignment component
 *
 * Ported from contracting-portal/src/components/LobAssignment.tsx
 * Reads/writes agent_lob_assignments via portal Supabase (akhojh…).
 * Fires HIP writing webhook when assignments change.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Save,
  AlertCircle,
  CheckCircle,
  Briefcase,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import { fireHipWritingWebhook } from '@/lib/contracting/webhooks';
import { HIP_CARRIERS } from '@/lib/contracting/types';

interface CarrierState {
  selected: boolean;
  writingNumber: string;
}

interface LobAssignmentProps {
  agentId: string;
  agentFirstName: string;
  agentLastName: string;
  agentNpn: string;
}

export function LobAssignment({
  agentId,
  agentFirstName,
  agentLastName,
  agentNpn,
}: LobAssignmentProps) {
  const [hipEnabled, setHipEnabled] = useState(false);
  const [carriers, setCarriers] = useState<Record<string, CarrierState>>(
    Object.fromEntries(
      HIP_CARRIERS.map((c) => [c, { selected: false, writingNumber: '' }])
    )
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  const [npnWarning, setNpnWarning] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const loadAssignments = useCallback(async () => {
    if (!portalSupabase) return;
    const { data } = await portalSupabase
      .from('agent_lob_assignments')
      .select('*')
      .eq('agent_id', agentId);

    if (data && data.length > 0) {
      setHipEnabled(true);
      const updated = { ...carriers };
      data.forEach((row) => {
        if (updated[row.carrier] !== undefined) {
          updated[row.carrier] = {
            selected: true,
            writingNumber: row.writing_number,
          };
        }
      });
      setCarriers(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!hipEnabled) return errs;

    const anySelected = Object.values(carriers).some((c) => c.selected);
    if (!anySelected) {
      errs.push('At least one carrier must be selected when HIP is enabled.');
    }

    Object.entries(carriers).forEach(([name, state]) => {
      if (state.selected && !state.writingNumber.trim()) {
        errs.push(`${name} writing number is required.`);
      }
    });

    return errs;
  };

  const handleSave = async () => {
    if (!portalSupabase) return;
    setSuccess(false);
    setNpnWarning(false);
    const validationErrors = validate();
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    setSaving(true);
    try {
      const { data: existingRows } = await portalSupabase
        .from('agent_lob_assignments')
        .select('carrier, writing_number')
        .eq('agent_id', agentId);

      const previousData = new Map(
        (existingRows || []).map(
          (r: { carrier: string; writing_number: string }) => [
            r.carrier,
            r.writing_number,
          ]
        )
      );

      await portalSupabase
        .from('agent_lob_assignments')
        .delete()
        .eq('agent_id', agentId);

      if (hipEnabled) {
        const rows = Object.entries(carriers)
          .filter(([, state]) => state.selected)
          .map(([name, state]) => ({
            agent_id: agentId,
            line_of_business: 'HIP',
            carrier: name,
            writing_number: state.writingNumber.trim(),
          }));

        if (rows.length > 0) {
          const { error } = await portalSupabase
            .from('agent_lob_assignments')
            .insert(rows);
          if (error) throw error;

          const hasChange = rows.some(
            (r) =>
              !previousData.has(r.carrier) ||
              previousData.get(r.carrier) !== r.writing_number
          );

          if (hasChange || previousData.size === 0) {
            let resolvedNpn = agentNpn.trim();
            if (!resolvedNpn) {
              const { data: sub } = await portalSupabase
                .from('agent_intake')
                .select('npn')
                .eq('agent_id', agentId)
                .maybeSingle();
              resolvedNpn = (sub?.npn || '').trim();
            }

            if (!resolvedNpn) {
              setNpnWarning(true);
            } else {
              const { data: agent } = await portalSupabase
                .from('agents')
                .select('agency')
                .eq('id', agentId)
                .maybeSingle();

              fireHipWritingWebhook({
                firstName: agentFirstName,
                lastName: agentLastName,
                npn: resolvedNpn,
                agency: agent?.agency || '',
                unlWritingNumber: carriers['UNL']?.selected
                  ? carriers['UNL'].writingNumber.trim()
                  : '',
                gtlWritingNumber: carriers['GTL']?.selected
                  ? carriers['GTL'].writingNumber.trim()
                  : '',
              });
            }
          }
        }
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setErrors(['Failed to save. Please try again.']);
    } finally {
      setSaving(false);
    }
  };

  const toggleCarrier = (name: string) => {
    setErrors([]);
    setCarriers((prev) => ({
      ...prev,
      [name]: { ...prev[name], selected: !prev[name].selected },
    }));
  };

  const updateWritingNumber = (name: string, value: string) => {
    setErrors([]);
    setCarriers((prev) => ({
      ...prev,
      [name]: { ...prev[name], writingNumber: value },
    }));
  };

  const toggleHip = () => {
    setErrors([]);
    if (hipEnabled) {
      setCarriers(
        Object.fromEntries(
          HIP_CARRIERS.map((c) => [c, { selected: false, writingNumber: '' }])
        )
      );
    }
    setHipEnabled(!hipEnabled);
  };

  return (
    <div className="bg-secondary rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-navy-600" />
          </div>
          <div>
            <h3 className="font-semibold text-navy-600 text-lg leading-tight">
              Lines of Business
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hipEnabled
                ? `HIP - ${Object.values(carriers).filter((c) => c.selected).length} carrier(s)`
                : 'No lines assigned'}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground/70" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground/70" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className="border border-border rounded-lg bg-card p-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hipEnabled}
                onChange={toggleHip}
                className="w-5 h-5 rounded border-border text-navy-600 focus:ring-navy-500 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-foreground">HIP</span>
                <span className="text-sm text-muted-foreground ml-2">
                  Health Insurance Products
                </span>
              </div>
            </label>

            {hipEnabled && (
              <div className="mt-4 ml-8 space-y-3">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Select carriers and enter writing numbers:
                </p>
                {HIP_CARRIERS.map((carrier) => (
                  <div key={carrier} className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={carriers[carrier].selected}
                        onChange={() => toggleCarrier(carrier)}
                        className="w-4 h-4 rounded border-border text-gold-600 focus:ring-gold-500 cursor-pointer"
                      />
                      <span className="font-medium text-foreground">
                        {carrier}
                      </span>
                    </label>

                    {carriers[carrier].selected && (
                      <div className="ml-7">
                        <label className="block text-sm text-muted-foreground mb-1">
                          {carrier} Agent Writing Number{' '}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={carriers[carrier].writingNumber}
                          onChange={(e) =>
                            updateWritingNumber(carrier, e.target.value)
                          }
                          placeholder={`Enter ${carrier} writing number`}
                          className={`w-full max-w-sm px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-transparent ${
                            errors.some((e) => e.includes(carrier))
                              ? 'border-red-400 bg-red-500/10'
                              : 'border-border'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-400 space-y-1">
                {errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <p className="text-sm text-emerald-400 font-medium">
                Lines of business saved.
              </p>
            </div>
          )}

          {npnWarning && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-400">
                Saved, but the HIP writing-number sync was skipped: no NPN on
                file for this agent. Add the agent&apos;s NPN, then re-save to
                trigger the sync.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy-600 text-white rounded-lg font-semibold hover:bg-navy-700 transition-colors disabled:opacity-50 text-sm glow-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Lines of Business'}
          </button>
        </div>
      )}
    </div>
  );
}
