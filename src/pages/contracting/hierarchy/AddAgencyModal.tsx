import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { PortalCrmAgency } from '@/lib/contracting/types';

// ─── Add agency modal ──────────────────────────────────────────────────────

const AddAgencyHierarchyModal: React.FC<{
  agencies: PortalCrmAgency[];
  onClose: () => void;
  onAdd: (
    name: string,
    parentId: string,
    contracting: {
      agency_npn: string;
      agency_ein: string;
      principal_agent: string;
      principal_agent_npn: string;
      principal_agent_email: string;
      contracting_email: string;
      contracting_contact: string;
      comp_tier: string;
      variant: string;
    }
  ) => Promise<string | null>;
}> = ({ agencies, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [agencyNpn, setAgencyNpn] = useState('');
  const [agencyEin, setAgencyEin] = useState('');
  const [principalAgent, setPrincipalAgent] = useState('');
  const [principalAgentNpn, setPrincipalAgentNpn] = useState('');
  const [principalAgentEmail, setPrincipalAgentEmail] = useState('');
  const [compTier, setCompTier] = useState('75');
  const [variant, setVariant] = useState('fym_direct');
  const [contractingEmail, setContractingEmail] = useState('');
  const [contractingContact, setContractingContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const rootAgency = agencies.find((a) => a.agency_type === 'main');

  useEffect(() => {
    if (rootAgency && !parentId) {
      setParentId(rootAgency.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootAgency]);

  const buildFlatList = (): { agency: PortalCrmAgency; indent: number }[] => {
    const result: { agency: PortalCrmAgency; indent: number }[] = [];
    const addNode = (id: string, depth: number) => {
      const a = agencies.find((ag) => ag.id === id);
      if (!a) return;
      result.push({ agency: a, indent: depth });
      const children = agencies
        .filter((ag) => ag.parent_agency_id === id)
        .sort((x, y) => x.name.localeCompare(y.name));
      for (const child of children) {
        addNode(child.id, depth + 1);
      }
    };
    if (rootAgency) addNode(rootAgency.id, 0);
    return result;
  };

  const flatList = buildFlatList();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Agency name is required.');
      return;
    }
    if (!parentId) {
      setError('Select a parent agency.');
      return;
    }
    if (!agencyNpn.trim()) {
      setError('Agency NPN is required.');
      return;
    }
    if (!agencyEin.trim()) {
      setError('Agency EIN is required.');
      return;
    }
    if (!principalAgent.trim()) {
      setError('Principal Agent name is required.');
      return;
    }
    if (!principalAgentNpn.trim()) {
      setError('Principal Agent NPN is required.');
      return;
    }
    if (!contractingEmail.trim()) {
      setError('Contracting email is required.');
      return;
    }
    if (!emailRegex.test(contractingEmail.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!principalAgentEmail.trim()) {
      setError('Principal Agent email is required for the activation page.');
      return;
    }
    if (!emailRegex.test(principalAgentEmail.trim())) {
      setError('Please enter a valid Principal Agent email address.');
      return;
    }

    setSubmitting(true);
    setError('');
    const err = await onAdd(name.trim(), parentId, {
      agency_npn: agencyNpn,
      agency_ein: agencyEin,
      principal_agent: principalAgent,
      principal_agent_npn: principalAgentNpn,
      principal_agent_email: principalAgentEmail,
      contracting_email: contractingEmail,
      contracting_contact: contractingContact,
      comp_tier: compTier,
      variant: variant,
    });
    if (err) {
      setError(err.includes('23505') ? 'An agency with this name already exists.' : err);
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-foreground">Add New Agency</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary/30 rounded-lg">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Agency Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              placeholder="New agency name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Parent Agency</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
            >
              {flatList.map(({ agency, indent }) => (
                <option key={agency.id} value={agency.id}>
                  {'  '.repeat(indent)}
                  {indent > 0 ? '-- ' : ''}
                  {agency.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Contracting Details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground/80 mb-1">
                  Agency NPN <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={agencyNpn}
                  onChange={(e) => {
                    setAgencyNpn(e.target.value);
                    setError('');
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                  placeholder="e.g. 12345678"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/80 mb-1">
                  Agency EIN <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={agencyEin}
                  onChange={(e) => {
                    setAgencyEin(e.target.value);
                    setError('');
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                  placeholder="e.g. 12-3456789"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/80 mb-1">
                  Principal Agent <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={principalAgent}
                  onChange={(e) => {
                    setPrincipalAgent(e.target.value);
                    setError('');
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/80 mb-1">
                  Principal Agent NPN <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={principalAgentNpn}
                  onChange={(e) => {
                    setPrincipalAgentNpn(e.target.value);
                    setError('');
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                  placeholder="e.g. 87654321"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/80 mb-1">
                  Contracting Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={contractingEmail}
                  onChange={(e) => {
                    setContractingEmail(e.target.value);
                    setError('');
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/80 mb-1">
                  Contracting Contact
                </label>
                <input
                  type="text"
                  value={contractingContact}
                  onChange={(e) => {
                    setContractingContact(e.target.value);
                    setError('');
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                  placeholder="If applicable"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Compensation & Activation
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground/80 mb-1">
                  Comp Tier <span className="text-red-400">*</span>
                </label>
                <select
                  value={compTier}
                  onChange={(e) => setCompTier(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                >
                  <option value="75">75%</option>
                  <option value="70">70%</option>
                  <option value="65">65%</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/80 mb-1">
                  Variant
                </label>
                <input
                  type="text"
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                  placeholder="e.g. fym_direct"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-foreground/80 mb-1">
                  Principal Agent Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={principalAgentEmail}
                  onChange={(e) => {
                    setPrincipalAgentEmail(e.target.value);
                    setError('');
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                  placeholder="principal@agency.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Welcome email with activation page + portal login will be sent here
                </p>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-secondary/30"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2.5 text-sm font-medium gradient-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Agency'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export { AddAgencyHierarchyModal };
export default AddAgencyHierarchyModal;
