/**
 * Field intake form — ported from contracting-portal
 *
 * Public-facing form for Field agents. Includes CTM acknowledgment.
 * Uses portalSupabase for portal DB (akhojh…).
 * Styled for FYM App dark theme.
 */
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SecurityCodeGate } from '@/components/forms/SecurityCodeGate';
import { StateLicenseSelector } from '@/components/forms/StateLicenseSelector';
import { SSNInput } from '@/components/forms/SSNInput';
import { VerificationModal } from '@/components/forms/VerificationModal';
import { EditableAgentInfo } from '@/components/forms/EditableAgentInfo';
import { portalSupabase } from '@/lib/portal-supabase';
import { fireSubmissionWebhook } from '@/lib/contracting/form-webhooks';
import { generateHubToken } from '@/lib/contracting/hubToken';
import { formatPhoneDisplay } from '@/lib/contracting/helpers';
import { US_STATES } from '@/lib/contracting/types';
import type { PortalAgent } from '@/lib/contracting/types';

const inputClass = 'w-full px-4 py-2 bg-secondary border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground';
const labelClass = 'block text-sm font-medium text-muted-foreground mb-1';
const selectClass = inputClass;

export function Field() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const formId = searchParams.get('id');
  const [agent, setAgent] = useState<PortalAgent | null>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [formData, setFormData] = useState({
    dateOfBirth: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    ssn: '',
    residentLicenseNumber: '',
    npn: '',
    residentState: '',
    ctmAcknowledgment: '',
    releaseNeeded: '',
    stateLicenses: [] as string[],
  });
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  if (!formId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card p-8 text-center">
          <p className="text-destructive">Invalid form URL</p>
        </div>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    setShowVerificationModal(true);
  };

  const handleFinalSubmit = async () => {
    if (!agent || !portalSupabase) return;
    setLoading(true);

    try {
      const { error: submissionError } = await portalSupabase
        .from('agent_intake')
        .insert({
          agent_id: agent.id,
          date_of_birth: formData.dateOfBirth,
          gender: formData.gender,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          postal_code: formData.postalCode,
          ssn: formData.ssn,
          resident_license_number: formData.residentLicenseNumber,
          npn: formData.npn,
          resident_state: formData.residentState,
          ctm_acknowledgment: formData.ctmAcknowledgment,
          release_needed: formData.releaseNeeded,
          state_licenses: formData.stateLicenses,
        });
      if (submissionError) throw submissionError;

      for (const file of files) {
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        await portalSupabase.from('uploaded_files').insert({
          agent_id: agent.id,
          file_name: file.name,
          file_type: file.type,
          file_data: fileData,
        });
      }

      await portalSupabase
        .from('agents')
        .update({ status: 'completed', date_completed: new Date().toISOString() })
        .eq('id', agent.id);

      await portalSupabase.from('activity_log').insert({
        agent_id: agent.id,
        action: 'form_completed',
        details: `${agent.first_name} ${agent.last_name} completed the form`,
      });

      fireSubmissionWebhook({
        formType: 'field',
        agency: agent.agency,
        firstName: agent.first_name,
        lastName: agent.last_name,
        email: agent.email,
        phone: agent.phone,
        securityCode: agent.security_code,
        dob: formData.dateOfBirth,
        gender: formData.gender,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        postalCode: formData.postalCode,
        ssn: formData.ssn,
        residentLicenseNumber: formData.residentLicenseNumber,
        npn: formData.npn,
        residentState: formData.residentState,
        ctmAcknowledgment: formData.ctmAcknowledgment,
        releaseNeeded: formData.releaseNeeded,
        stateLicenses: formData.stateLicenses,
        uploadedFiles: files.map((f) => ({ name: f.name, type: f.type })),
      });

      await generateHubToken({
        agentId: agent.id,
        npn: formData.npn || null,
        firstName: agent.first_name,
        lastName: agent.last_name,
      });

      navigate('/thank-you');
    } catch (error) {
      alert('Error submitting form. Please try again.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!agent) {
    return <SecurityCodeGate formId={formId} onSuccess={(a) => setAgent(a)} />;
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">FYM Financial</h1>
          <p className="text-xs text-muted-foreground mt-1">where transparency & opportunity meet</p>
          <h2 className="text-2xl font-bold text-foreground mt-6">AGENT INTAKE FORM</h2>
          <p className="text-sm text-muted-foreground mt-4 max-w-2xl mx-auto">
            Please note that you are completing this form as a Field agent. If this is not correct,
            please request the correct intake form from your manager/recruiter. Please make sure all information is correct
            and matches your license information in NIPR.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <EditableAgentInfo agent={agent} onAgentUpdate={setAgent} />

            <div>
              <label className={labelClass}>Date of Birth</label>
              <input type="date" value={formData.dateOfBirth} onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Gender <span className="text-destructive">*</span></label>
              <div className="flex items-center gap-6 h-[42px]">
                {(['Male', 'Female'] as const).map((option) => (
                  <label key={option} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="gender" value={option} checked={formData.gender === option} onChange={(e) => setFormData({ ...formData, gender: e.target.value })} className="w-4 h-4 text-primary border-border focus:ring-primary" />
                    <span className="text-sm text-foreground">{option}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>Social Security Number <span className="text-destructive">*</span></label>
              <SSNInput value={formData.ssn} onChange={(value) => setFormData({ ...formData, ssn: value })} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Address</label>
              <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>City</label>
              <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>State</label>
              <select value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className={selectClass} required>
                <option value=""></option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Postal Code <span className="text-destructive">*</span></label>
              <input type="text" inputMode="numeric" value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value.replace(/\D/g, '').slice(0, 5) })} className={inputClass} maxLength={5} pattern="\d{5}" required />
            </div>

            <div>
              <label className={labelClass}>Resident License Number</label>
              <input type="text" value={formData.residentLicenseNumber} onChange={(e) => setFormData({ ...formData, residentLicenseNumber: e.target.value })} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>NPN</label>
              <input type="text" value={formData.npn} onChange={(e) => setFormData({ ...formData, npn: e.target.value })} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Your Resident State</label>
              <select value={formData.residentState} onChange={(e) => setFormData({ ...formData, residentState: e.target.value })} className={selectClass} required>
                <option value=""></option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>CTM Acknowledgment</label>
              <p className="text-sm text-muted-foreground mb-3">
                Please acknowledge below that you are aware that IFG will run a CTM (Complaint to Medicare) report through NIPR.
                If your CTM rate is higher than our threshold allows, it may impact your contracting.
              </p>
              <select value={formData.ctmAcknowledgment} onChange={(e) => setFormData({ ...formData, ctmAcknowledgment: e.target.value })} className={selectClass} required>
                <option value=""></option>
                <option value="I acknowledge">I acknowledge</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Release Needed</label>
              <select value={formData.releaseNeeded} onChange={(e) => setFormData({ ...formData, releaseNeeded: e.target.value })} className={selectClass} required>
                <option value=""></option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Upload Releases (Optional)</label>
              <input type="file" multiple onChange={handleFileChange} className="w-full px-4 py-2 bg-secondary border border-border rounded-lg text-foreground file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90" />
              {files.length > 0 && <p className="text-sm text-muted-foreground mt-1">{files.length} file(s) selected</p>}
            </div>

            <div className="md:col-span-2">
              <button type="button" onClick={() => setShowLicenseModal(true)} className="w-full px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors font-medium">
                Select State Licenses
              </button>
              {formData.stateLicenses.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Selected: {formData.stateLicenses.slice(0, 3).join(', ')}
                  {formData.stateLicenses.length > 3 && ` (+${formData.stateLicenses.length - 3} more)`}
                </p>
              )}
            </div>
          </div>

          <button type="submit" disabled={loading || formData.stateLicenses.length === 0} className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-lg hover:bg-primary/90 transition-colors font-bold text-lg disabled:opacity-50">
            {loading ? 'SUBMITTING...' : 'SUBMIT'}
          </button>
        </form>
      </div>

      <StateLicenseSelector isOpen={showLicenseModal} onClose={() => setShowLicenseModal(false)} selectedStates={formData.stateLicenses} onConfirm={(states) => setFormData({ ...formData, stateLicenses: states })} />

      {agent && (
        <VerificationModal
          isOpen={showVerificationModal}
          onClose={() => setShowVerificationModal(false)}
          onConfirm={handleFinalSubmit}
          loading={loading}
          fields={[
            { label: 'First Name', value: agent.first_name },
            { label: 'Last Name', value: agent.last_name },
            { label: 'Email', value: agent.email },
            { label: 'Mobile Phone', value: formatPhoneDisplay(agent.phone) },
            { label: 'Date of Birth', value: formData.dateOfBirth },
            { label: 'Gender', value: formData.gender },
            { label: 'Address', value: `${formData.address}, ${formData.city}, ${formData.state} ${formData.postalCode}` },
            { label: 'Resident State', value: formData.residentState },
            { label: 'License Number', value: formData.residentLicenseNumber },
            { label: 'NPN', value: formData.npn },
          ]}
        />
      )}
    </div>
  );
}
