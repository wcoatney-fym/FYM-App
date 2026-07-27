/**
 * CrmOnboardingModal — Gender selection + CRM seat assignment confirmation
 *
 * Ported from contracting-portal/src/pages/AgentDatabase.tsx
 * Handles: gender prompt (if missing), seat assignment, roster update,
 * CRM onboarding webhook, pipeline record creation.
 */
import { useState } from 'react';
import { portalSupabase } from '@/lib/portal-supabase';
import { fireCrmOnboardingWebhook } from '@/lib/contracting/webhooks';
import type { PortalAgent, PortalIntakeRecord } from '@/lib/contracting/types';

const MALE_PROFILE_IMAGE =
  'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d23303840127a970fb.png';
const FEMALE_PROFILE_IMAGE =
  'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d2f665866357dfd218.png';

interface CrmOnboardingModalProps {
  agent: PortalAgent;
  submission: PortalIntakeRecord | null;
  onClose: () => void;
  onComplete: (agentId: string) => void;
}

export function CrmOnboardingModal({
  agent,
  submission,
  onClose,
  onComplete,
}: CrmOnboardingModalProps) {
  const gender = submission?.gender;
  const [step, setStep] = useState<'gender' | 'confirm'>(
    gender ? 'confirm' : 'gender'
  );
  const [selectedGender, setSelectedGender] = useState(gender || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleGenderSelected = (g: string) => {
    setSelectedGender(g);
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!portalSupabase) return;
    setSubmitting(true);
    setError('');

    try {
      const agency = agent.agency;
      const profileImage =
        selectedGender === 'Male' ? MALE_PROFILE_IMAGE : FEMALE_PROFILE_IMAGE;

      // Find roster upload for agency
      const { data: upload } = await portalSupabase
        .from('crm_roster_uploads')
        .select('id, headers')
        .eq('agency', agency)
        .maybeSingle();

      if (!upload) {
        setError(
          `No CRM roster found for ${agency}. Please upload a roster first.`
        );
        setSubmitting(false);
        return;
      }

      // Find open seats
      const { data: openSeats } = await portalSupabase
        .from('crm_roster')
        .select('id, row_data')
        .eq('upload_id', upload.id);

      const numericRows = (openSeats || []).filter((r) =>
        /^\d+$/.test(r.row_data['Seat Number'] || '')
      );

      const openSeat = numericRows
        .filter(
          (r) =>
            !r.row_data['First Name']?.trim() ||
            r.row_data['CSR Placeholder'] === 'true'
        )
        .sort(
          (a, b) =>
            Number(a.row_data['Seat Number']) -
            Number(b.row_data['Seat Number'])
        )[0];

      let crmNumber = '';
      const rowWithCrm = numericRows.find((r) =>
        r.row_data['All Templates | Agent CRM #']?.trim()
      );
      if (rowWithCrm) {
        crmNumber = rowWithCrm.row_data['All Templates | Agent CRM #'];
      }

      let seatNumber: string;

      if (openSeat) {
        seatNumber = openSeat.row_data['Seat Number'];
        const updatedRowData = {
          ...openSeat.row_data,
          'First Name': agent.first_name,
          'Last Name': agent.last_name,
          Phone: agent.phone,
          Email: agent.email,
          'Agent NPN': submission?.npn || '',
          'All Templates | Agent Profile Image': profileImage,
          'All Templates | Agent CRM #': crmNumber,
          'CSR Placeholder': '',
        };

        const { data: updatedRows, error: updateError } = await portalSupabase
          .from('crm_roster')
          .update({ row_data: updatedRowData })
          .eq('id', openSeat.id)
          .select();

        if (updateError || !updatedRows || updatedRows.length === 0) {
          setError('Failed to update roster seat. Please try again.');
          setSubmitting(false);
          return;
        }
      } else {
        const maxSeat = numericRows.reduce(
          (max, r) => Math.max(max, Number(r.row_data['Seat Number'])),
          0
        );
        seatNumber = String(maxSeat + 1);

        const newRowData: Record<string, string> = {
          'Seat Number': seatNumber,
          'First Name': agent.first_name,
          'Last Name': agent.last_name,
          Phone: agent.phone,
          Email: agent.email,
          'Agent NPN': submission?.npn || '',
          'All Templates | Agent Profile Image': profileImage,
          'All Templates | Agent CRM #': crmNumber,
        };

        const { error: insertError } = await portalSupabase
          .from('crm_roster')
          .insert({ upload_id: upload.id, row_data: newRowData });

        if (insertError) {
          setError('Failed to create roster seat. Please try again.');
          setSubmitting(false);
          return;
        }
      }

      // Fire webhook unless zaps are paused
      const { data: zapCheck } = await portalSupabase
        .from('hierarchy_agencies')
        .select('zaps_paused')
        .eq('name', agency)
        .maybeSingle();

      if (!zapCheck?.zaps_paused) {
        const webhookSuccess = await fireCrmOnboardingWebhook({
          seatNumber,
          agentNpn: submission?.npn || '',
          firstName: agent.first_name,
          lastName: agent.last_name,
          email: agent.email,
          phone: agent.phone,
          profileImage,
          crmNumber,
          agency,
        });

        if (!webhookSuccess) {
          setError(
            'Seat assigned but webhook failed. Please contact support.'
          );
        }
      }

      // Mark agent as CRM onboarded
      await portalSupabase
        .from('agents')
        .update({ crm_onboarded: true })
        .eq('id', agent.id);

      // Create pipeline record
      const now = new Date().toISOString();
      const autoAdvanceAt = new Date(
        Date.now() + 5 * 60 * 1000
      ).toISOString();
      const { data: pipelineData } = await portalSupabase
        .from('crm_pipeline')
        .insert({
          agent_id: agent.id,
          agency,
          first_name: agent.first_name,
          last_name: agent.last_name,
          email: agent.email,
          phone: agent.phone,
          seat_number: seatNumber,
          crm_number: crmNumber,
          agent_npn: submission?.npn || '',
          stage: 'processing',
          zap_sent_at: now,
          user_created_at: now,
          seat_filled_at: now,
          auto_advance_at: autoAdvanceAt,
        })
        .select('id')
        .maybeSingle();

      if (pipelineData) {
        await portalSupabase.from('crm_pipeline_history').insert({
          pipeline_record_id: pipelineData.id,
          agent_id: agent.id,
          agency,
          first_name: agent.first_name,
          last_name: agent.last_name,
          email: agent.email,
          phone: agent.phone,
          seat_number: seatNumber,
          crm_number: crmNumber,
          agent_npn: submission?.npn || '',
          final_stage: 'processing',
          zap_sent_at: now,
          user_created_at: now,
          seat_filled_at: now,
          entered_at: now,
        });
      }

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
          <h2 className="text-lg font-bold text-navy-600">
            {step === 'gender'
              ? 'Select Gender'
              : 'CRM Onboarding Confirmation'}
          </h2>
        </div>

        {step === 'gender' ? (
          <>
            <div className="px-6 py-5">
              <p className="text-gray-700 mb-4">
                Gender is required for{' '}
                <span className="font-semibold">
                  {agent.first_name} {agent.last_name}
                </span>
                . Please select their gender to continue.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleGenderSelected('Male')}
                  className="flex-1 px-4 py-3 text-sm font-medium border-2 border-gray-200 rounded-lg hover:border-navy-600 hover:bg-blue-50 transition-colors"
                >
                  Male
                </button>
                <button
                  onClick={() => handleGenderSelected('Female')}
                  className="flex-1 px-4 py-3 text-sm font-medium border-2 border-gray-200 rounded-lg hover:border-navy-600 hover:bg-blue-50 transition-colors"
                >
                  Female
                </button>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 py-5">
              <p className="text-gray-700">
                This will assign a CRM seat and send{' '}
                <span className="font-semibold">
                  {agent.first_name} {agent.last_name}
                </span>
                &apos;s information to the Onboarding team for CRM processing.
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
                onClick={handleConfirm}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-navy-600 rounded-md hover:bg-navy-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Assigning Seat...' : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
