/**
 * TerminateAgentModal — Terminate agent, clear CRM seat, update pipeline
 *
 * Ported from contracting-portal/src/pages/AgentDatabase.tsx
 * Handles: roster seat cleanup (CSR backfill or clear), agent status
 * update, pipeline termination.
 */
import { useState } from 'react';
import { portalSupabase } from '@/lib/portal-supabase';
import { fireCrmOnboardingWebhook } from '@/lib/contracting/webhooks';
import type { PortalAgent } from '@/lib/contracting/types';

const MALE_PROFILE_IMAGE =
  'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d23303840127a970fb.png';
const FEMALE_PROFILE_IMAGE =
  'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d2f665866357dfd218.png';

interface TerminateAgentModalProps {
  agent: PortalAgent;
  onClose: () => void;
  onComplete: (agentId: string) => void;
}

export function TerminateAgentModal({
  agent,
  onClose,
  onComplete,
}: TerminateAgentModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleTerminate = async () => {
    if (!portalSupabase) return;
    setSubmitting(true);
    setError('');

    try {
      const agency = agent.agency;

      // Find roster upload for agency
      const { data: upload } = await portalSupabase
        .from('crm_roster_uploads')
        .select('id, headers')
        .eq('agency', agency)
        .maybeSingle();

      if (upload) {
        const { data: rosterRows } = await portalSupabase
          .from('crm_roster')
          .select('id, row_data')
          .eq('upload_id', upload.id);

        // Find the agent's seat
        const matchingRow = (rosterRows || []).find(
          (r) =>
            (r.row_data['First Name'] || '').toLowerCase() ===
              agent.first_name.toLowerCase() &&
            (r.row_data['Last Name'] || '').toLowerCase() ===
              agent.last_name.toLowerCase() &&
            (r.row_data['Email'] || '').toLowerCase() ===
              agent.email.toLowerCase()
        );

        if (matchingRow) {
          // Check if agency has CSR who can fill the seat
          const { data: agencyData } = await portalSupabase
            .from('hierarchy_agencies')
            .select(
              'csr_can_fill_seat, csr_first_name, csr_last_name, csr_phone, csr_email, csr_npn, csr_gender, zaps_paused'
            )
            .eq('name', agency)
            .maybeSingle();

          const csrCanFill =
            agencyData?.csr_can_fill_seat && agencyData?.csr_npn?.trim();

          if (csrCanFill) {
            // Fill seat with CSR placeholder
            const csrProfileImage =
              agencyData.csr_gender === 'Male'
                ? MALE_PROFILE_IMAGE
                : agencyData.csr_gender === 'Female'
                  ? FEMALE_PROFILE_IMAGE
                  : '';
            const csrRowData = {
              ...matchingRow.row_data,
              'First Name': agencyData.csr_first_name || '',
              'Last Name': agencyData.csr_last_name || '',
              Phone: agencyData.csr_phone || '',
              Email: agencyData.csr_email || '',
              'Agent NPN': agencyData.csr_npn || '',
              'All Templates | Agent Profile Image': csrProfileImage,
              'CSR Placeholder': 'true',
            };
            await portalSupabase
              .from('crm_roster')
              .update({ row_data: csrRowData })
              .eq('id', matchingRow.id);

            // Fire webhook for CSR replacement
            const numericRows = (rosterRows || []).filter((r) =>
              /^\d+$/.test(r.row_data['Seat Number'] || '')
            );
            const rowWithCrm = numericRows.find((r) =>
              r.row_data['All Templates | Agent CRM #']?.trim()
            );
            const crmNumber =
              rowWithCrm?.row_data['All Templates | Agent CRM #'] || '';

            if (!agencyData.zaps_paused) {
              await fireCrmOnboardingWebhook({
                seatNumber: matchingRow.row_data['Seat Number'] || '',
                agentNpn: agencyData.csr_npn || '',
                firstName: agencyData.csr_first_name || '',
                lastName: agencyData.csr_last_name || '',
                email: agencyData.csr_email || '',
                phone: agencyData.csr_phone || '',
                profileImage: csrProfileImage,
                crmNumber,
                agency,
              });
            }
          } else {
            // Clear the seat
            const clearedRowData = {
              ...matchingRow.row_data,
              'First Name': '',
              'Last Name': '',
              Phone: '',
              Email: '',
              'Agent NPN': '',
              'All Templates | Agent Profile Image': '',
              'CSR Placeholder': '',
            };
            await portalSupabase
              .from('crm_roster')
              .update({ row_data: clearedRowData })
              .eq('id', matchingRow.id);
          }
        }
      }

      const now = new Date().toISOString();

      // Update agent status
      await portalSupabase
        .from('agents')
        .update({
          status: 'terminated',
          crm_onboarded: false,
          terminated_at: now,
          updated_at: now,
        })
        .eq('id', agent.id);

      // Update pipeline
      await portalSupabase
        .from('crm_pipeline')
        .update({ terminated_at: now, updated_at: now })
        .eq('agent_id', agent.id);

      await portalSupabase
        .from('crm_pipeline_history')
        .update({ terminated_at: now, final_stage: 'terminated' })
        .eq('agent_id', agent.id);

      setSubmitting(false);
      onComplete(agent.id);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-red-600">Terminate Agent</h2>
        </div>
        <div className="px-6 py-5">
          <p className="text-gray-700">
            This will terminate{' '}
            <span className="font-semibold">
              {agent.first_name} {agent.last_name}
            </span>
            , clear their seat from the{' '}
            <span className="font-semibold">{agent.agency}</span> CRM roster,
            and mark them as terminated.
          </p>
          <p className="text-gray-500 text-sm mt-2">
            This action cannot be undone.
          </p>
          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>
        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTerminate}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Terminating...' : 'Terminate'}
          </button>
        </div>
      </div>
    </div>
  );
}
