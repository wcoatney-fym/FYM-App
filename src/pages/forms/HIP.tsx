/**
 * HIP intake form — ported from contracting-portal
 *
 * Multi-step wizard for HIP agents. Supports route-based type detection.
 * Uses portalSupabase for portal DB (akhojh…).
 * Styled for FYM App dark theme.
 */
import { useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Briefcase, User, MapPin, FileText, CheckSquare, Check } from 'lucide-react';
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

const inputClass = 'w-full px-4 py-2.5 bg-secondary border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-foreground placeholder:text-muted-foreground';
const labelClass = 'block text-sm font-medium text-muted-foreground mb-1';
const selectClass = inputClass;

const STEPS_WITH_TYPE = [
  { id: 1, title: 'Agent Type', icon: Briefcase },
  { id: 2, title: 'Personal Info', icon: User },
  { id: 3, title: 'Address', icon: MapPin },
  { id: 4, title: 'License Info', icon: FileText },
  { id: 5, title: 'Final Details', icon: CheckSquare },
];

const STEPS_WITHOUT_TYPE = [
  { id: 1, title: 'Personal Info', icon: User },
  { id: 2, title: 'Address', icon: MapPin },
  { id: 3, title: 'License Info', icon: FileText },
  { id: 4, title: 'Final Details', icon: CheckSquare },
];

const ROUTE_TO_AGENT_TYPE: Record<string, 'HIP Broker' | 'HIP Career Agent'> = {
  '/hip-broker': 'HIP Broker',
  '/hip-career': 'HIP Career Agent',
};

const ROUTE_TO_FORM_TYPE: Record<string, string> = {
  '/hip-broker': 'hip-broker',
  '/hip-career': 'hip-career',
};

export function HIP() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const formId = searchParams.get('id');

  const predeterminedType = ROUTE_TO_AGENT_TYPE[location.pathname] || '';
  const formTypeFromRoute = ROUTE_TO_FORM_TYPE[location.pathname] || 'hip';
  const skipTypeSelection = !!predeterminedType;
  const STEPS = skipTypeSelection ? STEPS_WITHOUT_TYPE : STEPS_WITH_TYPE;

  const [agent, setAgent] = useState<PortalAgent | null>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [agentType, setAgentType] = useState<'HIP Broker' | 'HIP Career Agent' | ''>(predeterminedType);
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

  const stepOffset = skipTypeSelection ? 1 : 0;

  const canAdvance = (): boolean => {
    const logicalStep = currentStep + stepOffset;
    if (logicalStep === 1) return agentType !== '';
    if (logicalStep === 2) return !!(formData.dateOfBirth && formData.gender && formData.ssn);
    if (logicalStep === 3) return !!(formData.address && formData.city && formData.state && formData.postalCode);
    if (logicalStep === 4) return !!(formData.residentLicenseNumber && formData.npn && formData.residentState);
    if (logicalStep === 5) return !!(formData.releaseNeeded && formData.stateLicenses.length > 0);
    return false;
  };

  const handleNext = () => {
    if (canAdvance() && currentStep < STEPS.length) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent || !agentType) return;
    setShowVerificationModal(true);
  };

  const handleFinalSubmit = async () => {
    if (!agent || !agentType || !portalSupabase) return;
    setLoading(true);

    try {
      const { error: submissionError } = await portalSupabase
        .from('agent_intake')
        .insert({
          agent_id: agent.id,
          agent_type: agentType,
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
        details: `${agent.first_name} ${agent.last_name} completed the HIP form as ${agentType}`,
      });

      fireSubmissionWebhook({
        formType: formTypeFromRoute,
        agentType,
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

  const progressPercent = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">FYM Financial</h1>
          <p className="text-xs text-muted-foreground mt-1">where transparency &amp; opportunity meet</p>
          <h2 className="text-2xl font-bold text-foreground mt-6">
            {predeterminedType === 'HIP Broker' ? 'HIP BROKER' : predeterminedType === 'HIP Career Agent' ? 'HIP CAREER AGENT' : 'HIP AGENT'} INTAKE FORM
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Hello, <span className="font-semibold text-foreground">{agent.first_name} {agent.last_name}</span>. Please complete all sections accurately.
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isCompleted = step.id < currentStep;
              const isActive = step.id === currentStep;
              return (
                <div key={step.id} className="flex flex-col items-center flex-1">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isCompleted ? 'bg-primary border-primary' : isActive ? 'bg-card border-primary' : 'bg-card border-border'}`}>
                    {isCompleted ? <Check className="w-4 h-4 text-primary-foreground" /> : <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />}
                  </div>
                  <span className={`text-xs mt-1 hidden sm:block ${isActive ? 'text-primary font-semibold' : isCompleted ? 'text-primary' : 'text-muted-foreground'}`}>{step.title}</span>
                </div>
              );
            })}
          </div>
          <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
            <div className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right mt-1">Step {currentStep} of {STEPS.length}</p>
        </div>

        <div className="glass-card p-6 md:p-8">
          {/* Step 1 (type selection) — only when not predetermined */}
          {currentStep + stepOffset === 1 && (
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">Select Your Agent Type</h3>
              <p className="text-sm text-muted-foreground mb-6">Choose the category that best describes your role.</p>
              <div className="grid grid-cols-1 gap-4">
                {(['HIP Broker', 'HIP Career Agent'] as const).map((type) => (
                  <button key={type} type="button" onClick={() => setAgentType(type)} className={`relative w-full text-left p-5 rounded-xl border-2 transition-all duration-200 ${agentType === type ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-muted-foreground hover:bg-secondary'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-semibold text-lg ${agentType === type ? 'text-primary' : 'text-foreground'}`}>{type}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {type === 'HIP Broker'
                            ? <><span className="font-bold">60% contract (You Own Your Book of Business)</span> — Independent broker selling HIP products</>
                            : <><span className="font-bold">30% contract (Free Leads)</span> — Career agent contracted through the agency</>}
                        </p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-4 ${agentType === type ? 'border-primary bg-primary' : 'border-border'}`}>
                        {agentType === type && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — Personal Info */}
          {currentStep + stepOffset === 2 && (
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">Personal Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <EditableAgentInfo agent={agent} onAgentUpdate={setAgent} variant="hip" />
                <div>
                  <label className={labelClass}>Date of Birth <span className="text-destructive">*</span></label>
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
              </div>
            </div>
          )}

          {/* Step 3 — Address */}
          {currentStep + stepOffset === 3 && (
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">Home Address</h3>
              <p className="text-sm text-muted-foreground mb-6">Enter your current residential address.</p>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelClass}>Street Address <span className="text-destructive">*</span></label>
                  <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Main St" className={inputClass} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-1">
                    <label className={labelClass}>City <span className="text-destructive">*</span></label>
                    <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className={inputClass} required />
                  </div>
                  <div>
                    <label className={labelClass}>State <span className="text-destructive">*</span></label>
                    <select value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className={selectClass} required>
                      <option value=""></option>
                      {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Postal Code <span className="text-destructive">*</span></label>
                    <input type="text" inputMode="numeric" value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value.replace(/\D/g, '').slice(0, 5) })} className={inputClass} maxLength={5} pattern="\d{5}" required />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4 — License Info */}
          {currentStep + stepOffset === 4 && (
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">License Information</h3>
              <p className="text-sm text-muted-foreground mb-6">Ensure all details match exactly what is listed in NIPR.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Resident License Number <span className="text-destructive">*</span></label>
                  <input type="text" value={formData.residentLicenseNumber} onChange={(e) => setFormData({ ...formData, residentLicenseNumber: e.target.value })} className={inputClass} required />
                </div>
                <div>
                  <label className={labelClass}>NPN <span className="text-destructive">*</span></label>
                  <input type="text" value={formData.npn} onChange={(e) => setFormData({ ...formData, npn: e.target.value })} className={inputClass} required />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Resident State <span className="text-destructive">*</span></label>
                  <select value={formData.residentState} onChange={(e) => setFormData({ ...formData, residentState: e.target.value })} className={selectClass} required>
                    <option value=""></option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 5 — Final Details */}
          {currentStep + stepOffset === 5 && (
            <form onSubmit={handleSubmit}>
              <h3 className="text-xl font-bold text-foreground mb-2">Final Details</h3>
              <p className="text-sm text-muted-foreground mb-6">Complete your state licenses and any release documentation.</p>
              <div className="space-y-5">
                <div>
                  <label className={labelClass}>Release Needed <span className="text-destructive">*</span></label>
                  <select value={formData.releaseNeeded} onChange={(e) => setFormData({ ...formData, releaseNeeded: e.target.value })} className={selectClass} required>
                    <option value=""></option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Upload Releases <span className="text-muted-foreground font-normal">(Optional)</span></label>
                  <input type="file" multiple onChange={handleFileChange} className="w-full px-4 py-2.5 bg-secondary border border-border rounded-lg text-foreground text-sm file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90" />
                  {files.length > 0 && <p className="text-sm text-muted-foreground mt-1">{files.length} file(s) selected</p>}
                </div>
                <div>
                  <label className={labelClass}>State Licenses <span className="text-destructive">*</span></label>
                  <button type="button" onClick={() => setShowLicenseModal(true)} className={`w-full px-4 py-2.5 rounded-lg border-2 font-medium transition-colors ${formData.stateLicenses.length > 0 ? 'bg-accent border-accent text-accent-foreground hover:bg-accent/90' : 'bg-card border-accent text-accent hover:bg-secondary'}`}>
                    {formData.stateLicenses.length > 0 ? `${formData.stateLicenses.length} State(s) Selected - Click to Edit` : 'Select State Licenses'}
                  </button>
                  {formData.stateLicenses.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {formData.stateLicenses.slice(0, 4).join(', ')}
                      {formData.stateLicenses.length > 4 && ` +${formData.stateLicenses.length - 4} more`}
                    </p>
                  )}
                </div>
                <div className="pt-2">
                  <button type="submit" disabled={loading || !canAdvance()} className="w-full bg-primary text-primary-foreground py-3.5 px-4 rounded-lg hover:bg-primary/90 transition-colors font-bold text-lg disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? 'SUBMITTING...' : 'SUBMIT FORM'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Navigation buttons */}
          {currentStep + stepOffset < 5 && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <button type="button" onClick={handleBack} disabled={currentStep === 1} className="flex items-center gap-2 px-5 py-2.5 text-muted-foreground border border-border rounded-lg hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button type="button" onClick={handleNext} disabled={!canAdvance()} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium">
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {currentStep + stepOffset === 5 && (
            <div className="mt-6 pt-4 border-t border-border">
              <button type="button" onClick={handleBack} className="flex items-center gap-2 px-5 py-2.5 text-muted-foreground border border-border rounded-lg hover:bg-secondary transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">Your information is encrypted and securely transmitted.</p>
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
            { label: 'Agent Type', value: agentType },
          ]}
        />
      )}
    </div>
  );
}
