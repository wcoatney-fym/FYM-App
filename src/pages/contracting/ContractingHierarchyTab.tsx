/**
 * ContractingHierarchyTab — Agency hierarchy tree, intake queue, and
 * per-agency detail panel (Onboarding / Roster / Carriers / CRM sub-tabs).
 *
 * Ported from contracting-portal/src/pages/Hierarchy.tsx +
 * contracting-portal/src/pages/hierarchy/*.tsx
 *
 * All data reads/writes go through portalSupabase (akhojh…). Kept as a
 * single file per Stage 4b scope — all sub-tab components are inlined.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GitBranch,
  Plus,
  Search,
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  Monitor,
  X,
  Trash2,
  AlertTriangle,
  Inbox,
  Check,
  Copy,
  Link as LinkIcon,
  FileText,
  Shield,
  CheckCircle2,
  Circle,
  Phone,
  Mail,
  Calendar,
  Globe,
  Save,
  Hash,
  User,
  AlertCircle,
  MapPin,
  StickyNote,
  Eye,
  EyeOff,
  Check as CheckIcon,
  ExternalLink,
  Link2,
  Send,
  Upload,
  UserPlus,
  Database,
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import { parseCSV } from '@/lib/contracting/csvParser';
import { normalizeRosterRows } from '@/lib/contracting/rosterNormalizer';
import { createActivationRecord, sendOnboardingEmail } from '@/lib/contracting/onboarding-service';
import type {
  PortalCrmAgency,
  AgencyIntakeSubmission,
  AgencyContact,
  AgencyNote,
} from '@/lib/contracting/types';
import { US_STATES } from '@/lib/contracting/types';

// ─── Tree building helpers ────────────────────────────────────────────────

type AgencyNode = PortalCrmAgency & {
  children: AgencyNode[];
  agentCount: number;
};

function buildRecursiveTree(
  agencies: PortalCrmAgency[],
  agentCounts: Record<string, number>
): AgencyNode[] {
  const map = new Map<string, AgencyNode>();
  for (const a of agencies) {
    map.set(a.id, { ...a, children: [], agentCount: agentCounts[a.name] || 0 });
  }
  const roots: AgencyNode[] = [];
  for (const node of map.values()) {
    if (node.parent_agency_id && map.has(node.parent_agency_id)) {
      map.get(node.parent_agency_id)!.children.push(node);
    } else if (!node.parent_agency_id) {
      roots.push(node);
    }
  }
  const sortChildren = (nodes: AgencyNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);
  return roots;
}

function getDescendantIds(node: AgencyNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(child));
  }
  return ids;
}

function collectAllAncestorIds(agencyId: string, agencies: PortalCrmAgency[]): string[] {
  const ids: string[] = [];
  let current = agencies.find((a) => a.id === agencyId);
  while (current?.parent_agency_id) {
    ids.push(current.parent_agency_id);
    current = agencies.find((a) => a.id === current!.parent_agency_id);
  }
  return ids;
}

// ─── Main component ───────────────────────────────────────────────────────

export function ContractingHierarchyTab() {
  const [agencies, setAgencies] = useState<PortalCrmAgency[]>([]);
  const [agentCounts, setAgentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [principalSearch, setPrincipalSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedAgency, setSelectedAgency] = useState<PortalCrmAgency | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgencyNode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingIntakes, setPendingIntakes] = useState<AgencyIntakeSubmission[]>([]);
  const [processingIntakeId, setProcessingIntakeId] = useState<string | null>(null);
  const [intakeError, setIntakeError] = useState('');
  const [pendingApproval, setPendingApproval] = useState<AgencyIntakeSubmission | null>(null);
  const [pendingApprovalParentId, setPendingApprovalParentId] = useState<string>('');
  const [intakeLinkCopied, setIntakeLinkCopied] = useState(false);

  const handleCopyIntakeLink = async () => {
    const url = `${window.location.origin}/agency-intake`;
    try {
      await navigator.clipboard.writeText(url);
      setIntakeLinkCopied(true);
      setTimeout(() => setIntakeLinkCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setIntakeLinkCopied(true);
      setTimeout(() => setIntakeLinkCopied(false), 2000);
    }
  };

  const loadData = useCallback(async () => {
    if (!portalSupabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [agencyRes, rosterRes, intakeRes] = await Promise.all([
      (portalSupabase as any).from('hierarchy_agencies').select('*').order('name'),
      (portalSupabase as any)
        .from('crm_roster_uploads')
        .select('agency, row_count')
        .order('uploaded_at', { ascending: false }),
      (portalSupabase as any)
        .from('agency_intake_submissions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    setPendingIntakes((intakeRes.data as AgencyIntakeSubmission[]) || []);

    const allAgencies = ((agencyRes.data as PortalCrmAgency[]) || []).filter((a) => !a.is_test);
    setAgencies(allAgencies);

    const counts: Record<string, number> = {};
    for (const upload of rosterRes.data || []) {
      if (!counts[upload.agency]) {
        counts[upload.agency] = upload.row_count || 0;
      }
    }
    setAgentCounts(counts);

    const allIds = allAgencies.map((a) => a.id);
    setExpandedNodes(new Set(allIds));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tree = React.useMemo(() => buildRecursiveTree(agencies, agentCounts), [agencies, agentCounts]);

  const isNodeVisible = (node: AgencyNode, visibleIds: Set<string>): boolean => {
    if (visibleIds.has(node.id)) return true;
    return node.children.some((child) => isNodeVisible(child, visibleIds));
  };

  const filteredTree = (): AgencyNode[] => {
    const nameTerm = search.trim().toLowerCase();
    const principalTerm = principalSearch.trim().toLowerCase();
    if (!nameTerm && !principalTerm) return tree;

    const matchingIds = new Set(
      agencies
        .filter((a) => {
          const nameMatch = !nameTerm || a.name.toLowerCase().includes(nameTerm);
          const principalMatch =
            !principalTerm || (a.principal_agent ?? '').toLowerCase().includes(principalTerm);
          return nameMatch && principalMatch;
        })
        .map((a) => a.id)
    );
    const ancestorIds = new Set<string>();
    for (const id of matchingIds) {
      for (const aid of collectAllAncestorIds(id, agencies)) {
        ancestorIds.add(aid);
      }
    }
    const visibleIds = new Set([...matchingIds, ...ancestorIds]);
    const filterNodes = (nodes: AgencyNode[]): AgencyNode[] =>
      nodes
        .filter((n) => isNodeVisible(n, visibleIds))
        .map((n) => ({ ...n, children: filterNodes(n.children) }));
    return filterNodes(tree);
  };

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAgencyUpdated = (updated: PortalCrmAgency) => {
    setAgencies((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setSelectedAgency(updated);
  };

  const handleAddAgency = async (
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
  ) => {
    if (!portalSupabase) return 'Portal connection not configured.';
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const portalPassword = `${name}CRMPortal!`;

    const { data, error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .insert({
        name,
        agency_type: 'sub',
        parent_agency_id: parentId,
        onboarding_status: 'pending_csr_assignment',
        is_active: true,
        crm_enabled: false,
        slug,
        portal_password: portalPassword,
        date_created: new Date().toISOString().slice(0, 10),
        agency_npn: contracting.agency_npn.trim() || null,
        agency_ein: contracting.agency_ein.trim() || null,
        principal_agent: contracting.principal_agent.trim() || null,
        principal_agent_npn: contracting.principal_agent_npn.trim() || null,
        contracting_email: contracting.contracting_email.trim() || null,
        contracting_contact: contracting.contracting_contact.trim() || null,
        comp_tier: contracting.comp_tier || null,
        variant: contracting.variant || 'fym_direct',
        principal_agent_email: contracting.principal_agent_email.trim() || null,
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      setAgencies((prev) => [...prev, data]);
      setExpandedNodes((prev) => new Set([...prev, data.id, parentId]));
      setShowAddModal(false);

      // Create activation landing page
      await createActivationRecord({
        slug,
        agencyName: name,
        principalName: contracting.principal_agent,
        principalEmail: contracting.principal_agent_email,
        compTier: contracting.comp_tier,
        variant: contracting.variant,
      });

      // Send welcome email (best-effort — don't block on failure)
      const activationUrl = `https://teamfym.com/activation/${slug}`;
      await sendOnboardingEmail({
        agencyName: name,
        principalName: contracting.principal_agent,
        principalEmail: contracting.principal_agent_email,
        activationUrl,
        portalSlug: slug,
        portalPassword: portalPassword,
      }).catch((e) => console.error('Failed to send onboarding email:', e));
    }
    return error?.message || null;
  };

  const handleApproveIntakeClick = (submission: AgencyIntakeSubmission) => {
    setPendingApproval(submission);
    setPendingApprovalParentId('');
    setIntakeError('');
  };

  const handleApproveIntake = async (submission: AgencyIntakeSubmission) => {
    if (!portalSupabase) return;
    setPendingApproval(null);
    setProcessingIntakeId(submission.id);
    setIntakeError('');

    const name = submission.agency_name.trim();
    const parentId = pendingApprovalParentId || null;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const portalPassword = `${name}CRMPortal!`;

    const { data, error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .upsert(
        {
          name,
          agency_type: parentId ? 'sub' : 'main',
          parent_agency_id: parentId || null,
          onboarding_status: 'pending_csr_assignment',
          is_active: true,
          crm_enabled: false,
          slug,
          portal_password: portalPassword,
          date_created: new Date().toISOString().slice(0, 10),
          agency_npn: submission.agency_npn?.trim() || null,
          agency_ein: submission.agency_ein?.trim() || null,
          principal_agent: submission.principal_agent?.trim() || null,
          principal_agent_npn: submission.principal_agent_npn?.trim() || null,
          contracting_email: submission.contracting_email?.trim() || null,
          contracting_contact: submission.contracting_contact?.trim() || null,
          street_address: submission.street_address?.trim() || null,
          city: submission.city?.trim() || null,
          agency_state: submission.state?.trim() || null,
          zip: submission.zip?.trim() || null,
          additional_contacts: submission.additional_contacts ?? [],
          comp_tier: '75',
          variant: 'fym_direct',
        },
        { onConflict: 'slug' }
      )
      .select()
      .maybeSingle();

    if (error || !data) {
      setIntakeError(error?.message || 'Failed to create agency from intake.');
      setProcessingIntakeId(null);
      return;
    }

    const { error: updateError } = await (portalSupabase as any)
      .from('agency_intake_submissions')
      .update({ status: 'approved', approved_agency_id: data.id, reviewed_at: new Date().toISOString() })
      .eq('id', submission.id);

    if (updateError) {
      setIntakeError(`Agency created, but marking the intake approved failed: ${updateError.message}`);
    }

    setAgencies((prev) => [...prev, data]);
    setExpandedNodes((prev) =>
      new Set(parentId ? [...prev, data.id, parentId] : [...prev, data.id])
    );
    setPendingIntakes((prev) => prev.filter((s) => s.id !== submission.id));
    setProcessingIntakeId(null);
  };

  const handleRejectIntake = async (submission: AgencyIntakeSubmission) => {
    if (!portalSupabase) return;
    setProcessingIntakeId(submission.id);
    setIntakeError('');
    const { error } = await (portalSupabase as any)
      .from('agency_intake_submissions')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', submission.id);
    if (error) {
      setIntakeError(`Failed to reject intake: ${error.message}`);
    } else {
      setPendingIntakes((prev) => prev.filter((s) => s.id !== submission.id));
    }
    setProcessingIntakeId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !portalSupabase) return;
    setDeleting(true);
    const { error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .delete()
      .eq('id', deleteTarget.id);

    if (!error) {
      const removedIds = new Set([deleteTarget.id, ...getDescendantIds(deleteTarget)]);
      setAgencies((prev) => prev.filter((a) => !removedIds.has(a.id)));
      if (selectedAgency && removedIds.has(selectedAgency.id)) {
        setSelectedAgency(null);
      }
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  if (!portalSupabase) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Database className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium">Portal connection not configured</p>
        <p className="text-sm mt-1">
          Set VITE_PORTAL_SUPABASE_URL and VITE_PORTAL_SUPABASE_KEY to enable.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  const displayTree = filteredTree();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center border border-border">
            <GitBranch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Agency Hierarchy</h1>
            <p className="text-sm text-muted-foreground">
              Manage agencies, onboarding, and CRM enablement
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyIntakeLink}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg transition-colors font-medium text-sm ${
              intakeLinkCopied
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-card border-border text-foreground/80 hover:bg-secondary/30'
            }`}
          >
            {intakeLinkCopied ? (
              <>
                <Check className="w-4 h-4" /> Copied!
              </>
            ) : (
              <>
                <LinkIcon className="w-4 h-4" /> Copy Agency Intake Form Link
              </>
            )}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 gradient-primary text-primary-foreground rounded-lg transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Agency
          </button>
        </div>
      </div>

      {pendingIntakes.length > 0 && (
        <PendingIntakeTray
          submissions={pendingIntakes}
          processingId={processingIntakeId}
          error={intakeError}
          agencies={agencies}
          onApprove={handleApproveIntakeClick}
          onReject={handleRejectIntake}
        />
      )}

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by agency name..."
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-card text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={principalSearch}
            onChange={(e) => setPrincipalSearch(e.target.value)}
            placeholder="Search by principal agent..."
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-card text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="space-y-2">
        {displayTree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            expandedNodes={expandedNodes}
            onToggle={toggleExpand}
            onSelect={setSelectedAgency}
            onDelete={setDeleteTarget}
          />
        ))}
        {displayTree.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {search ? 'No agencies match your search.' : 'No agencies found.'}
          </div>
        )}
      </div>

      {selectedAgency && (
        <AgencyDetailPanel
          agency={selectedAgency}
          onClose={() => setSelectedAgency(null)}
          onAgencyUpdated={handleAgencyUpdated}
          onRefresh={loadData}
        />
      )}

      {showAddModal && (
        <AddAgencyHierarchyModal
          agencies={agencies}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddAgency}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          node={deleteTarget}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {pendingApproval && (
        <ApproveIntakeModal
          submission={pendingApproval}
          agencies={agencies}
          parentId={pendingApprovalParentId}
          onParentChange={setPendingApprovalParentId}
          onConfirm={() => handleApproveIntake(pendingApproval)}
          onCancel={() => setPendingApproval(null)}
        />
      )}
    </div>
  );
}

// ─── Tree node ─────────────────────────────────────────────────────────────

const TreeNode: React.FC<{
  node: AgencyNode;
  depth: number;
  expandedNodes: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (agency: PortalCrmAgency) => void;
  onDelete: (node: AgencyNode) => void;
}> = ({ node, depth, expandedNodes, onToggle, onSelect, onDelete }) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isRoot = node.agency_type === 'main';
  const isFym = node.name.toLowerCase() === 'fym';
  const isContractingIncomplete =
    !isFym &&
    !isRoot &&
    (!node.agency_npn?.trim() ||
      !node.agency_ein?.trim() ||
      !node.principal_agent?.trim() ||
      !node.principal_agent_npn?.trim() ||
      !node.contracting_email?.trim());

  const depthColors = [
    'bg-blue-500/10 text-blue-400',
    'bg-emerald-500/10 text-emerald-400',
    'bg-amber-500/10 text-amber-400',
    'bg-sky-500/10 text-sky-400',
    'bg-rose-500/10 text-rose-400',
  ];

  return (
    <div className="relative">
      <div
        className={`group flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer ${
          node.crm_enabled
            ? 'bg-card border-border hover:border-primary/40'
            : 'bg-secondary/20 border-border hover:border-border'
        }`}
        style={{ marginLeft: depth * 24 }}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="p-1 rounded-md hover:bg-secondary/40 text-muted-foreground transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
        {!hasChildren && <div className="w-6" />}

        <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => onSelect(node)}>
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${depthColors[depth % depthColors.length]}`}
          >
            <Building2 className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm truncate">{node.name}</span>
              {node.crm_enabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 uppercase tracking-wider">
                  <Monitor className="w-2.5 h-2.5" />
                  CRM
                </span>
              )}
              {node.is_test && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 uppercase tracking-wider">
                  Test
                </span>
              )}
              {isContractingIncomplete && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 uppercase tracking-wider">
                  Incomplete
                </span>
              )}
              {(node.carriers || []).map((c) => (
                <span
                  key={c}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-400 uppercase tracking-wider"
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" />
                {node.agentCount} agent{node.agentCount !== 1 ? 's' : ''}
              </span>
              {isRoot && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary/30 text-primary">Root</span>
              )}
            </div>
          </div>
        </div>

        {node.principal_agent && (
          <div className="hidden sm:flex flex-col items-end text-right mr-2 flex-shrink-0">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Principal Agent
            </span>
            <span className="text-xs font-semibold text-foreground/80 mt-0.5">{node.principal_agent}</span>
            {node.principal_agent_npn && (
              <span className="text-[10px] text-muted-foreground font-mono">
                NPN {node.principal_agent_npn}
              </span>
            )}
          </div>
        )}

        {!isRoot && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
            className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Delete agency"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1 relative">
          <div
            className="absolute top-0 bottom-0 border-l-2 border-border rounded-bl"
            style={{ left: depth * 24 + 20 }}
          />
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Delete confirm modal ──────────────────────────────────────────────────

const DeleteConfirmModal: React.FC<{
  node: AgencyNode;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ node, deleting, onConfirm, onCancel }) => {
  const descendantCount = getDescendantIds(node).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-card border border-border rounded-lg max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Delete Agency</h3>
            <p className="text-sm text-foreground/80 mt-1">
              Are you sure you want to delete <strong>{node.name}</strong>?
            </p>
          </div>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
          <p className="text-red-400 font-medium">This action cannot be undone.</p>
          <ul className="list-disc list-inside space-y-1 text-xs text-red-400/80">
            {descendantCount > 0 && (
              <li>
                {descendantCount} child agenc{descendantCount === 1 ? 'y' : 'ies'} will also be deleted
              </li>
            )}
            {node.crm_enabled && <li>This agency is CRM-enabled and will be removed from CRM Team</li>}
            <li>All associated deals, GHL configs, KPIs, and tickets will be removed</li>
          </ul>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-secondary/30"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Agency'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Pending intake tray ───────────────────────────────────────────────────

const PendingIntakeTray: React.FC<{
  submissions: AgencyIntakeSubmission[];
  processingId: string | null;
  error: string;
  agencies: PortalCrmAgency[];
  onApprove: (submission: AgencyIntakeSubmission) => void;
  onReject: (submission: AgencyIntakeSubmission) => void;
}> = ({ submissions, processingId, error, onApprove, onReject }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Inbox className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Pending Intake
              <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-400">
                {submissions.length}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Submitted via the public agency intake link — review to create the agency.
            </p>
          </div>
        </div>
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {submissions.map((s) => {
            const busy = processingId === s.id;
            return (
              <div key={s.id} className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{s.agency_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.invited_by_agency_name
                        ? `Invited by: ${s.invited_by_agency_name}`
                        : 'Direct intake'}
                      {' · '}
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground italic">
                      Parent assigned during approval
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => onReject(s)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-secondary/30 transition-colors disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      onClick={() => onApprove(s)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary-foreground gradient-primary rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {busy ? 'Working...' : 'Approve'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <IntakeField label="Agency NPN" value={s.agency_npn} />
                  <IntakeField label="Agency EIN" value={s.agency_ein || '—'} />
                  <IntakeField label="Principal Agent" value={s.principal_agent} />
                  <IntakeField label="Principal Agent NPN" value={s.principal_agent_npn || '—'} />
                  <IntakeField label="Contracting Email" value={s.contracting_email} />
                  <IntakeField label="Contracting Contact" value={s.contracting_contact || '—'} />
                  {(s.street_address || s.city || s.state) && (
                    <IntakeField
                      label="Address"
                      value={[s.street_address, s.city, s.state, s.zip].filter(Boolean).join(', ')}
                    />
                  )}
                </div>
                {(s.additional_contacts ?? []).length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                      Additional Contacts
                    </p>
                    <div className="space-y-1">
                      {(s.additional_contacts ?? []).map((c, ci) => (
                        <p key={ci} className="text-xs text-foreground/80">
                          <span className="font-medium">{c.name}</span>
                          {c.title && ` · ${c.title}`}
                          {c.department && ` (${c.department})`}
                          {c.email && ` · ${c.email}`}
                          {c.phone && ` · ${c.phone}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ApproveIntakeModal: React.FC<{
  submission: AgencyIntakeSubmission;
  agencies: PortalCrmAgency[];
  parentId: string;
  onParentChange: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ submission, agencies, parentId, onParentChange, onConfirm, onCancel }) => {
  const sortedAgencies = [...agencies].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md">
        <div className="px-6 py-5 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">Approve Intake</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Assign a parent agency before creating{' '}
            <span className="font-semibold">{submission.agency_name}</span>.
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Parent Agency</label>
            <select
              value={parentId}
              onChange={(e) => onParentChange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-card text-foreground"
            >
              <option value="">Select a parent agency…</option>
              {sortedAgencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Required — every new agency must map to a parent.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-foreground/80 bg-card border border-border rounded-lg hover:bg-secondary/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!parentId}
            className="px-4 py-2 text-sm font-medium text-primary-foreground gradient-primary rounded-lg transition-colors disabled:opacity-50"
          >
            Approve &amp; Create
          </button>
        </div>
      </div>
    </div>
  );
};

const IntakeField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center gap-2">
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-medium text-foreground/80 truncate">{value}</span>
  </div>
);

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

// ─── Agency detail side panel ──────────────────────────────────────────────

type DetailTab = 'onboarding' | 'roster' | 'crm' | 'carriers';

const AgencyDetailPanel: React.FC<{
  agency: PortalCrmAgency;
  onClose: () => void;
  onAgencyUpdated: (updated: PortalCrmAgency) => void;
  onRefresh: () => void;
}> = ({ agency, onClose, onAgencyUpdated, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('onboarding');

  const tabs: { key: DetailTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { key: 'onboarding', label: 'Onboarding', icon: FileText },
    { key: 'roster', label: 'Roster', icon: Users },
    { key: 'carriers', label: 'Carriers', icon: Shield },
    { key: 'crm', label: 'CRM', icon: Monitor },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <div className="w-full max-w-3xl bg-card border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/20">
          <div>
            <h2 className="text-lg font-bold text-foreground">{agency.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  agency.agency_type === 'main'
                    ? 'bg-secondary/30 text-primary'
                    : 'bg-secondary/40 text-foreground/80'
                }`}
              >
                {agency.agency_type === 'main' ? 'Main Agency' : 'Sub-Agency'}
              </span>
              {agency.crm_enabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400">
                  <Monitor className="w-3 h-3" />
                  CRM Enabled
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary/30 rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary bg-secondary/20'
                  : 'border-transparent text-muted-foreground hover:text-foreground/80 hover:bg-secondary/10'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'onboarding' && (
            <ContractingOnboardingSubTab agency={agency} onAgencyUpdated={onAgencyUpdated} />
          )}
          {activeTab === 'roster' && <HierarchyRosterSubTab agency={agency} />}
          {activeTab === 'crm' && (
            <CrmToggleSubTab agency={agency} onAgencyUpdated={onAgencyUpdated} onRefresh={onRefresh} />
          )}
          {activeTab === 'carriers' && (
            <CarriersSubTab agency={agency} onAgencyUpdated={onAgencyUpdated} />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Onboarding sub-tab ─────────────────────────────────────────────────────

const ContractingOnboardingSubTab: React.FC<{
  agency: PortalCrmAgency;
  onAgencyUpdated: (updated: PortalCrmAgency) => void;
}> = ({ agency, onAgencyUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notes, setNotes] = useState<AgencyNote[]>(
    Array.isArray(agency.internal_notes) ? agency.internal_notes : []
  );
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [hasRoster, setHasRoster] = useState(false);
  const [form, setForm] = useState({
    agency_phone: agency.agency_phone || '',
    business_name: agency.business_name || '',
    agency_npn: agency.agency_npn || '',
    agency_ein: agency.agency_ein || '',
    principal_agent: agency.principal_agent || '',
    principal_agent_npn: agency.principal_agent_npn || '',
    contracting_email: agency.contracting_email || '',
    contracting_contact: agency.contracting_contact || '',
    street_address: agency.street_address || '',
    city: agency.city || '',
    agency_state: agency.agency_state || '',
    zip: agency.zip || '',
  });
  const [additionalContacts, setAdditionalContacts] = useState<AgencyContact[]>(
    agency.additional_contacts ?? []
  );

  const isFym = agency.name.toLowerCase() === 'fym';
  const isRoot = agency.agency_type === 'main';
  const showContractingRequired = !isFym && !isRoot;

  useEffect(() => {
    checkRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.name]);

  const checkRoster = async () => {
    if (!portalSupabase) return;
    const { data } = await (portalSupabase as any)
      .from('crm_roster_uploads')
      .select('id')
      .eq('agency', agency.name)
      .limit(1);
    setHasRoster((data || []).length > 0);
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleCopyPassword = () => {
    if (!agency.portal_password) return;
    navigator.clipboard.writeText(agency.portal_password).then(() => {
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    });
  };

  const handleSave = async () => {
    if (!portalSupabase) return;
    if (form.contracting_email.trim() && !emailRegex.test(form.contracting_email.trim())) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError('');
    setSaving(true);
    const cleanedContacts = additionalContacts.filter((c) => c.name.trim());
    const { error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .update({
        agency_phone: form.agency_phone.trim() || null,
        business_name: form.business_name.trim() || null,
        agency_npn: form.agency_npn.trim() || null,
        agency_ein: form.agency_ein.trim() || null,
        principal_agent: form.principal_agent.trim() || null,
        principal_agent_npn: form.principal_agent_npn.trim() || null,
        contracting_email: form.contracting_email.trim() || null,
        contracting_contact: form.contracting_contact.trim() || null,
        street_address: form.street_address.trim() || null,
        city: form.city.trim() || null,
        agency_state: form.agency_state.trim() || null,
        zip: form.zip.trim() || null,
        additional_contacts: cleanedContacts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agency.id);

    if (!error) {
      onAgencyUpdated({
        ...agency,
        agency_phone: form.agency_phone.trim() || null,
        business_name: form.business_name.trim() || null,
        agency_npn: form.agency_npn.trim() || null,
        agency_ein: form.agency_ein.trim() || null,
        principal_agent: form.principal_agent.trim() || null,
        principal_agent_npn: form.principal_agent_npn.trim() || null,
        contracting_email: form.contracting_email.trim() || null,
        contracting_contact: form.contracting_contact.trim() || null,
        street_address: form.street_address.trim() || null,
        city: form.city.trim() || null,
        agency_state: form.agency_state.trim() || null,
        zip: form.zip.trim() || null,
        additional_contacts: cleanedContacts,
      });
      setAdditionalContacts(cleanedContacts);
      setEditing(false);
    }
    setSaving(false);
  };

  const contractingDetailsFilled = !!(
    agency.agency_npn?.trim() &&
    agency.agency_ein?.trim() &&
    agency.principal_agent?.trim() &&
    agency.principal_agent_npn?.trim() &&
    agency.contracting_email?.trim()
  );

  const steps = [
    {
      label: 'Agency Information Collected',
      done: true,
      detail: `Created on ${agency.date_created || agency.created_at?.slice(0, 10) || 'Unknown'}`,
    },
    ...(showContractingRequired
      ? [
          {
            label: 'Contracting Details Provided',
            done: contractingDetailsFilled,
            detail: contractingDetailsFilled
              ? `NPN: ${agency.agency_npn} | Principal: ${agency.principal_agent}`
              : 'Missing required contracting fields -- click Edit below to complete',
          },
        ]
      : []),
    {
      label: 'Contact Details Provided',
      done: !!agency.agency_phone?.trim(),
      detail: agency.agency_phone ? `Phone: ${agency.agency_phone}` : 'Phone number not yet provided',
    },
    {
      label: 'Agent Roster Uploaded',
      done: hasRoster,
      detail: hasRoster ? 'Roster file uploaded' : 'No roster uploaded yet',
    },
    {
      label: 'Ready for Production',
      done: hasRoster && !!agency.agency_phone?.trim() && (contractingDetailsFilled || !showContractingRequired),
      detail:
        hasRoster && agency.agency_phone?.trim() && (contractingDetailsFilled || !showContractingRequired)
          ? 'All prerequisites met'
          : 'Complete above steps first',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Contracting Onboarding</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {completedCount}/{steps.length} steps completed
          </p>
        </div>
        <div className="w-12 h-12 rounded-full border-4 border-secondary/30 flex items-center justify-center relative">
          <svg className="absolute inset-0 w-12 h-12 -rotate-90">
            <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" className="text-secondary/30" strokeWidth="4" />
            <circle
              cx="24"
              cy="24"
              r="18"
              fill="none"
              stroke="currentColor"
              className="text-primary"
              strokeWidth="4"
              strokeDasharray={`${(completedCount / steps.length) * 113} 113`}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-xs font-bold text-primary">
            {Math.round((completedCount / steps.length) * 100)}%
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              step.done ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-card border-border'
            }`}
          >
            {step.done ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className={`text-sm font-medium ${step.done ? 'text-emerald-400' : 'text-foreground/80'}`}>
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-foreground text-sm">Agency Details</h4>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="text-xs text-primary hover:text-primary/80 font-medium">
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditing(false);
                  setEmailError('');
                }}
                className="text-xs text-muted-foreground hover:text-foreground/80"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50"
              >
                <Save className="w-3 h-3" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {emailError && (
          <div className="mb-4 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {emailError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Agency Name
            </label>
            <p className="text-sm font-medium text-foreground">{agency.name}</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Date Created
            </label>
            <p className="text-sm font-medium text-foreground">
              {agency.date_created || agency.created_at?.slice(0, 10) || '--'}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />
              Agency Phone
            </label>
            {editing ? (
              <input
                type="tel"
                value={form.agency_phone}
                onChange={(e) => setForm((f) => ({ ...f, agency_phone: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="(555) 123-4567"
              />
            ) : (
              <p className="text-sm font-medium text-foreground">{agency.agency_phone || '--'}</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="w-3 h-3" />
              Business Name (DBA)
            </label>
            {editing ? (
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="Business name"
              />
            ) : (
              <p className="text-sm font-medium text-foreground">{agency.business_name || '--'}</p>
            )}
          </div>
        </div>
      </div>

      {/* Contracting Portal Access */}
      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="w-4 h-4 text-muted-foreground" />
          <h4 className="font-semibold text-foreground text-sm">Contracting Portal Access</h4>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Portal URL</label>
            {agency.slug ? (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground font-mono">
                  contracting.teamfym.com/agency/<span className="text-primary">{agency.slug}</span>
                </p>
                <a
                  href={`https://contracting.teamfym.com/agency/${agency.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-muted-foreground hover:text-primary transition-colors"
                  title="Open contracting portal"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Not assigned</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Portal Password</label>
            {agency.portal_password ? (
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground font-mono tracking-wide select-all">
                  {showPassword ? agency.portal_password : '••••••••••••'}
                </p>
                <button
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1 text-muted-foreground hover:text-foreground/80 transition-colors"
                  title={showPassword ? 'Hide password' : 'Reveal password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleCopyPassword}
                  className="p-1 text-muted-foreground hover:text-primary transition-colors"
                  title="Copy password"
                >
                  {passwordCopied ? (
                    <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Not set</p>
            )}
          </div>
        </div>
      </div>

      {(agency.agency_state || agency.unl_writing_number || agency.unl_status) && (
        <div className="border-t border-border pt-6">
          <h4 className="font-semibold text-foreground text-sm mb-4">UNL Reference Data</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">State</label>
              <p className="text-sm font-medium text-foreground">{agency.agency_state || '--'}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">UNL Writing Number</label>
              <p className="text-sm font-medium text-foreground font-mono">
                {agency.unl_writing_number || '--'}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">UNL Status</label>
              <p
                className={`text-sm font-medium ${
                  agency.unl_status === 'Active'
                    ? 'text-emerald-400'
                    : agency.unl_status === 'Terminated'
                      ? 'text-red-400'
                      : 'text-amber-400'
                }`}
              >
                {agency.unl_status || '--'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2 mb-4">
          <h4 className="font-semibold text-foreground text-sm">Contracting Details</h4>
          {showContractingRequired && !contractingDetailsFilled && (
            <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full uppercase">
              Incomplete
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Agency NPN {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="text"
                value={form.agency_npn}
                onChange={(e) => setForm((f) => ({ ...f, agency_npn: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="e.g. 12345678"
              />
            ) : (
              <p className={`text-sm font-medium ${agency.agency_npn ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {agency.agency_npn || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Agency EIN {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="text"
                value={form.agency_ein}
                onChange={(e) => setForm((f) => ({ ...f, agency_ein: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="e.g. 12-3456789"
              />
            ) : (
              <p className={`text-sm font-medium ${agency.agency_ein ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {agency.agency_ein || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />
              Principal Agent {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="text"
                value={form.principal_agent}
                onChange={(e) => setForm((f) => ({ ...f, principal_agent: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="Full name"
              />
            ) : (
              <p className={`text-sm font-medium ${agency.principal_agent ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {agency.principal_agent || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Principal Agent NPN {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="text"
                value={form.principal_agent_npn}
                onChange={(e) => setForm((f) => ({ ...f, principal_agent_npn: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="e.g. 87654321"
              />
            ) : (
              <p
                className={`text-sm font-medium ${agency.principal_agent_npn ? 'text-foreground' : 'text-muted-foreground italic'}`}
              >
                {agency.principal_agent_npn || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="w-3 h-3" />
              Contracting Email {showContractingRequired && <span className="text-red-400">*</span>}
            </label>
            {editing ? (
              <input
                type="email"
                value={form.contracting_email}
                onChange={(e) => {
                  setForm((f) => ({ ...f, contracting_email: e.target.value }));
                  setEmailError('');
                }}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="email@example.com"
              />
            ) : (
              <p
                className={`text-sm font-medium ${agency.contracting_email ? 'text-foreground' : 'text-muted-foreground italic'}`}
              >
                {agency.contracting_email || 'Not provided'}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />
              Contracting Contact
            </label>
            {editing ? (
              <input
                type="text"
                value={form.contracting_contact}
                onChange={(e) => setForm((f) => ({ ...f, contracting_contact: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="If applicable"
              />
            ) : (
              <p
                className={`text-sm font-medium ${agency.contracting_contact ? 'text-foreground' : 'text-muted-foreground italic'}`}
              >
                {agency.contracting_contact || 'Not provided'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <h4 className="font-semibold text-foreground text-sm">Agency Address</h4>
        </div>
        {editing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={form.street_address}
              onChange={(e) => setForm((f) => ({ ...f, street_address: e.target.value }))}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              placeholder="Street Address"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="col-span-1 px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="City"
              />
              <select
                value={form.agency_state}
                onChange={(e) => setForm((f) => ({ ...f, agency_state: e.target.value }))}
                className="px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              >
                <option value="">State</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                className="px-3 py-1.5 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                placeholder="ZIP"
                maxLength={10}
              />
            </div>
          </div>
        ) : (
          <p className={`text-sm ${agency.street_address || agency.city ? 'text-foreground' : 'text-muted-foreground italic'}`}>
            {[agency.street_address, agency.city, agency.agency_state, agency.zip].filter(Boolean).join(', ') ||
              'Not provided'}
          </p>
        )}
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h4 className="font-semibold text-foreground text-sm">Additional Contacts</h4>
          </div>
          {editing && (
            <button
              type="button"
              onClick={() =>
                setAdditionalContacts((prev) => [
                  ...prev,
                  { name: '', title: '', department: '', email: '', phone: '' },
                ])
              }
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>

        {!editing && additionalContacts.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No additional contacts on file.</p>
        )}

        {editing ? (
          <div className="space-y-3">
            {additionalContacts.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No contacts — click Add above.</p>
            )}
            {additionalContacts.map((c, i) => (
              <div key={i} className="relative border border-border rounded-lg p-3 bg-secondary/10">
                <button
                  type="button"
                  onClick={() => setAdditionalContacts((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
                  Contact {i + 1}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['name', 'title', 'department', 'email', 'phone'] as (keyof AgencyContact)[]).map(
                    (field) => (
                      <input
                        key={field}
                        type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                        value={c[field]}
                        onChange={(e) =>
                          setAdditionalContacts((prev) =>
                            prev.map((ct, idx) => (idx === i ? { ...ct, [field]: e.target.value } : ct))
                          )
                        }
                        placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                        className="px-2.5 py-1.5 text-xs border border-border rounded-md focus:ring-1 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
                      />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {additionalContacts.map((c, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-foreground">{c.name}</span>
                {c.title && <span className="text-muted-foreground"> · {c.title}</span>}
                {c.department && <span className="text-muted-foreground"> ({c.department})</span>}
                {c.email && <span className="text-muted-foreground"> · {c.email}</span>}
                {c.phone && <span className="text-muted-foreground"> · {c.phone}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <InternalNotesSection
        agencyId={agency.id}
        notes={notes}
        onNotesChange={(updated) => {
          setNotes(updated);
          onAgencyUpdated({ ...agency, internal_notes: updated });
        }}
        noteInput={noteInput}
        setNoteInput={setNoteInput}
        notesSaving={notesSaving}
        setNotesSaving={setNotesSaving}
        noteInputRef={noteInputRef}
      />
    </div>
  );
};

function formatNoteTimestamp(iso: string): string {
  try {
    return (
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(iso)) + ' CT'
    );
  } catch {
    return iso;
  }
}

const InternalNotesSection: React.FC<{
  agencyId: string;
  notes: AgencyNote[];
  onNotesChange: (updated: AgencyNote[]) => void;
  noteInput: string;
  setNoteInput: (v: string) => void;
  notesSaving: boolean;
  setNotesSaving: (v: boolean) => void;
  noteInputRef: React.RefObject<HTMLTextAreaElement>;
}> = ({ agencyId, notes, onNotesChange, noteInput, setNoteInput, notesSaving, setNotesSaving, noteInputRef }) => {
  const [focused, setFocused] = useState(false);

  const handleAddNote = async () => {
    if (!portalSupabase) return;
    const text = noteInput.trim();
    if (!text) return;
    setNotesSaving(true);
    const newNote: AgencyNote = {
      text,
      created_at: new Date().toISOString(),
    };
    const updated = [newNote, ...notes];
    const { error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .update({ internal_notes: updated, updated_at: new Date().toISOString() })
      .eq('id', agencyId);
    if (!error) {
      onNotesChange(updated);
      setNoteInput('');
      setFocused(false);
    }
    setNotesSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddNote();
    }
    if (e.key === 'Escape') {
      setNoteInput('');
      setFocused(false);
      noteInputRef.current?.blur();
    }
  };

  return (
    <div className="border-t border-border pt-6">
      <div className="flex items-center gap-2 mb-4">
        <StickyNote className="w-4 h-4 text-muted-foreground" />
        <h4 className="font-semibold text-foreground text-sm">Internal Notes</h4>
        <span className="text-xs text-muted-foreground ml-auto">
          {notes.length > 0 ? `${notes.length} entr${notes.length === 1 ? 'y' : 'ies'}` : ''}
        </span>
      </div>

      <div
        className={`mb-4 rounded-lg border transition-all ${
          focused ? 'border-primary/40 ring-2 ring-primary/10 bg-card' : 'border-border bg-secondary/10 hover:border-border'
        }`}
      >
        <textarea
          ref={noteInputRef}
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            if (!noteInput.trim()) setFocused(false);
          }}
          onKeyDown={handleKeyDown}
          rows={focused ? 3 : 1}
          placeholder="Add a note… (Cmd+Enter to save)"
          className="w-full px-3 py-2 text-sm bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground text-foreground"
        />
        {focused && (
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-[10px] text-muted-foreground">Cmd+Enter to save · Esc to cancel</span>
            <button
              onClick={handleAddNote}
              disabled={notesSaving || !noteInput.trim()}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-3 h-3" />
              {notesSaving ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        )}
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note, i) => (
            <div key={i} className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
              <p className="text-xs text-amber-400 font-medium mb-1">{formatNoteTimestamp(note.created_at)}</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{note.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Roster sub-tab ─────────────────────────────────────────────────────────

const MALE_PROFILE_IMAGE =
  'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d23303840127a970fb.png';
const FEMALE_PROFILE_IMAGE =
  'https://storage.googleapis.com/msgsndr/YM9XmCanfO6p28b1sQOH/media/6882b3d2f665866357dfd218.png';

type RosterRow = {
  id: string;
  row_data: Record<string, string>;
};

const HierarchyRosterSubTab: React.FC<{ agency: PortalCrmAgency }> = ({ agency }) => {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.name]);

  const loadRoster = async () => {
    if (!portalSupabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: uploads } = await (portalSupabase as any)
      .from('crm_roster_uploads')
      .select('id, headers')
      .eq('agency', agency.name)
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (uploads && uploads.length > 0) {
      setUploadId(uploads[0].id);
      const { data: rosterRows } = await (portalSupabase as any)
        .from('crm_roster')
        .select('id, row_data')
        .eq('upload_id', uploads[0].id);

      const sorted = (rosterRows || []).sort((a: RosterRow, b: RosterRow) => {
        const aNum = parseInt(a.row_data['Seat Number'] || '', 10);
        const bNum = parseInt(b.row_data['Seat Number'] || '', 10);
        if (isNaN(aNum) && isNaN(bNum)) return 0;
        if (isNaN(aNum)) return 1;
        if (isNaN(bNum)) return -1;
        return aNum - bNum;
      });
      setRows(sorted);
    } else {
      setUploadId(null);
      setRows([]);
    }
    setLoading(false);
  };

  const handleUpload = async (file: File) => {
    if (!portalSupabase) return;
    setUploading(true);
    try {
      const text = await file.text();
      const { rows: rawRows } = parseCSV(text);
      if (rawRows.length === 0) {
        alert('CSV file appears to be empty or invalid.');
        setUploading(false);
        return;
      }

      const { data: agencyRecord } = await (portalSupabase as any)
        .from('hierarchy_agencies')
        .select('crm_number, csr_npn, calendar_embed_code, agency_url_prefix')
        .eq('name', agency.name)
        .maybeSingle();

      const crmNumber = agencyRecord?.crm_number || '';
      const { headers: canonicalHeaders, rows: normalizedRows } = normalizeRosterRows(
        rawRows,
        crmNumber,
        agencyRecord?.csr_npn || undefined
      );

      if (uploadId) {
        await (portalSupabase as any).from('crm_roster_uploads').delete().eq('id', uploadId);
      }

      const { data: uploadRecord, error: uploadError } = await (portalSupabase as any)
        .from('crm_roster_uploads')
        .insert({
          file_name: file.name,
          row_count: normalizedRows.length,
          headers: canonicalHeaders,
          agency: agency.name,
        })
        .select()
        .maybeSingle();

      if (uploadError || !uploadRecord) {
        throw uploadError || new Error('Failed to create upload record');
      }

      const BATCH_SIZE = 500;
      for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
        const batch = normalizedRows.slice(i, i + BATCH_SIZE).map((row) => ({
          upload_id: uploadRecord.id,
          row_data: row,
        }));
        await (portalSupabase as any).from('crm_roster').insert(batch);
      }

      await padRosterTo200(uploadRecord.id, canonicalHeaders, agencyRecord);
      await loadRoster();
    } catch (err) {
      console.error(err);
      alert('Error uploading CSV. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const padRosterTo200 = async (uploadIdVal: string, headers: string[], agencyRecord: any) => {
    if (!portalSupabase) return;
    const { data: existingRows } = await (portalSupabase as any)
      .from('crm_roster')
      .select('id, row_data')
      .eq('upload_id', uploadIdVal);

    const numericRows = (existingRows || []).filter((r: RosterRow) => /^\d+$/.test(r.row_data['Seat Number'] || ''));
    const occupiedSeats = new Set(numericRows.map((r: RosterRow) => Number(r.row_data['Seat Number'])));

    let crmNumber = '';
    const rowWithCrm = numericRows.find((r: RosterRow) => r.row_data['All Templates | Agent CRM #']?.trim());
    if (rowWithCrm) crmNumber = rowWithCrm.row_data['All Templates | Agent CRM #'];

    const calendarEmbed = agencyRecord?.calendar_embed_code?.trim() || '';
    const urlPrefix = agencyRecord?.agency_url_prefix?.trim() || '';

    const rowsToInsert: { upload_id: string; row_data: Record<string, string> }[] = [];
    for (let seat = 1; seat <= 200; seat++) {
      if (!occupiedSeats.has(seat)) {
        const row: Record<string, string> = {};
        for (const h of headers) row[h] = '';
        row['Seat Number'] = String(seat);
        if (crmNumber) row['All Templates | Agent CRM #'] = crmNumber;
        if (calendarEmbed) row['Calendar Embed Code'] = calendarEmbed;
        if (urlPrefix) {
          row['Digital Business Card Home Page'] = `${urlPrefix}.my-agent-appt.com/r${seat}-click-to-schedule`;
          row['Appt Booked Confirmation Page'] = `${urlPrefix}.my-agent-appt.com/r${seat}-youre-confirmed`;
        }
        rowsToInsert.push({ upload_id: uploadIdVal, row_data: row });
      }
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
      await (portalSupabase as any).from('crm_roster').insert(rowsToInsert.slice(i, i + BATCH_SIZE));
    }
  };

  const handleAddAgent = async (form: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    npn: string;
    gender: string;
  }) => {
    if (!portalSupabase) return 'Portal connection not configured.';
    if (!uploadId) return 'No roster exists. Upload a CSV first.';

    const openSeat = rows.find((r) => !r.row_data['First Name']?.trim() && r.row_data['Seat Number']?.trim());
    if (!openSeat) return 'No open seats available.';

    const profileImage = form.gender === 'Male' ? MALE_PROFILE_IMAGE : FEMALE_PROFILE_IMAGE;
    const crmNumber =
      rows.find((r) => r.row_data['All Templates | Agent CRM #']?.trim())?.row_data[
        'All Templates | Agent CRM #'
      ] || '';

    const updatedRowData = {
      ...openSeat.row_data,
      'First Name': form.firstName.trim(),
      'Last Name': form.lastName.trim(),
      Phone: form.phone.trim(),
      phone: form.phone.trim(),
      Email: form.email.trim(),
      email: form.email.trim(),
      'Agent NPN': form.npn.trim(),
      'All Templates | Agent CRM #': crmNumber,
      'All Templates | Agent Profile Image': profileImage,
      'CSR Placeholder': '',
    };

    const { error } = await (portalSupabase as any)
      .from('crm_roster')
      .update({ row_data: updatedRowData })
      .eq('id', openSeat.id);

    if (error) return 'Failed to assign seat.';
    await loadRoster();
    return null;
  };

  const populatedRows = rows.filter((r) => r.row_data['First Name']?.trim());
  const filteredRows = search
    ? populatedRows.filter((r) => {
        const name = `${r.row_data['First Name']} ${r.row_data['Last Name']}`.toLowerCase();
        return name.includes(search.toLowerCase());
      })
    : populatedRows;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Agent Roster</h3>
          <p className="text-sm text-muted-foreground">{populatedRows.length}/200 seats filled</p>
        </div>
        <div className="flex gap-2">
          {uploadId && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium gradient-primary text-primary-foreground rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add Agent
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border text-foreground/80 rounded-lg hover:bg-secondary/30 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : uploadId ? 'Replace CSV' : 'Upload CSV'}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />

      {!uploadId ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">No roster uploaded for this agency</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 gradient-primary text-primary-foreground text-sm font-medium rounded-lg disabled:opacity-50"
          >
            Upload CSV
          </button>
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
            />
          </div>

          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {filteredRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/20 border border-transparent hover:border-border transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-secondary/30 flex items-center justify-center text-xs font-bold text-foreground/80">
                  {row.row_data['Seat Number']}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {row.row_data['First Name']} {row.row_data['Last Name']}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {row.row_data['Email'] || row.row_data['email'] || '--'}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{row.row_data['Agent NPN'] || ''}</span>
              </div>
            ))}
            {filteredRows.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                {search ? 'No agents match your search.' : 'No agents on roster yet.'}
              </p>
            )}
          </div>
        </>
      )}

      {showAddModal && <AddAgentToRosterModal onClose={() => setShowAddModal(false)} onAdd={handleAddAgent} />}
    </div>
  );
};

const AddAgentToRosterModal: React.FC<{
  onClose: () => void;
  onAdd: (form: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    npn: string;
    gender: string;
  }) => Promise<string | null>;
}> = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', npn: '', gender: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.gender) {
      setError('First name, last name, phone, and gender are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    const err = await onAdd(form);
    if (err) setError(err);
    else onClose();
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-card border border-border rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Add Agent to Roster</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-secondary/30 rounded-lg">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">First Name *</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, firstName: e.target.value }));
                  setError('');
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">Last Name *</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, lastName: e.target.value }));
                  setError('');
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">Phone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => {
                  setForm((f) => ({ ...f, phone: e.target.value }));
                  setError('');
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/80 mb-1">NPN</label>
              <input
                type="text"
                value={form.npn}
                onChange={(e) => setForm((f) => ({ ...f, npn: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-secondary/20 text-foreground"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-2">Gender *</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, gender: 'Male' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  form.gender === 'Male'
                    ? 'bg-secondary/30 border-primary/40 text-primary ring-2 ring-primary/20'
                    : 'border-border text-foreground/80 hover:bg-secondary/20'
                }`}
              >
                Male
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, gender: 'Female' }))}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  form.gender === 'Female'
                    ? 'bg-secondary/30 border-primary/40 text-primary ring-2 ring-primary/20'
                    : 'border-border text-foreground/80 hover:bg-secondary/20'
                }`}
              >
                Female
              </button>
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
              className="px-4 py-2 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-secondary/30"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium gradient-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Carriers sub-tab ───────────────────────────────────────────────────────

const ALL_CARRIERS = ['UNL', 'GTL', 'AHL', 'Manhattan', 'Heartland'] as const;

const CarriersSubTab: React.FC<{
  agency: PortalCrmAgency;
  onAgencyUpdated: (updated: PortalCrmAgency) => void;
}> = ({ agency, onAgencyUpdated }) => {
  const [saving, setSaving] = useState<string | null>(null);
  const current = agency.carriers || [];

  const toggle = async (carrier: string) => {
    if (!portalSupabase) return;
    setSaving(carrier);
    const updated = current.includes(carrier) ? current.filter((c) => c !== carrier) : [...current, carrier];

    const { error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .update({ carriers: updated, updated_at: new Date().toISOString() })
      .eq('id', agency.id);

    if (!error) {
      onAgencyUpdated({ ...agency, carriers: updated });
    }
    setSaving(null);
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Carrier Assignments</h3>
          <p className="text-sm text-muted-foreground">Toggle which carriers this agency is contracted with</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {ALL_CARRIERS.map((carrier) => {
          const active = current.includes(carrier);
          const isSaving = saving === carrier;
          return (
            <button
              key={carrier}
              onClick={() => toggle(carrier)}
              disabled={isSaving}
              className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all ${
                active ? 'border-sky-500/30 bg-sky-500/10' : 'border-border bg-card hover:border-border'
              } ${isSaving ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <span className={`text-sm font-semibold ${active ? 'text-sky-400' : 'text-foreground/80'}`}>
                {carrier}
              </span>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  active ? 'bg-sky-500 text-white' : 'bg-secondary/30 text-muted-foreground'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
              </div>
            </button>
          );
        })}
      </div>

      {current.length > 0 && (
        <div className="mt-6 p-4 rounded-lg bg-secondary/20 border border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Active Carriers
          </p>
          <div className="flex flex-wrap gap-2">
            {current.map((c) => (
              <span
                key={c}
                className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 uppercase tracking-wider"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── CRM toggle sub-tab ─────────────────────────────────────────────────────

const CRM_ONBOARDING_LABELS: Record<string, string> = {
  pending_csr_assignment: 'Pending CSR Assignment',
  awaiting_agency_phone: 'Awaiting Phone & Setup',
  awaiting_subaccount_setup: 'Awaiting Subaccount Setup',
  awaiting_roster_upload: 'Awaiting Roster Upload',
  awaiting_dba_upload: 'Awaiting DBA Upload',
  onboarding_complete: 'Onboarding Complete',
};

const CrmToggleSubTab: React.FC<{
  agency: PortalCrmAgency;
  onAgencyUpdated: (updated: PortalCrmAgency) => void;
  onRefresh: () => void;
}> = ({ agency, onAgencyUpdated, onRefresh }) => {
  const [hasRoster, setHasRoster] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPrerequisites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency.name]);

  const checkPrerequisites = async () => {
    if (!portalSupabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await (portalSupabase as any)
      .from('crm_roster_uploads')
      .select('id')
      .eq('agency', agency.name)
      .limit(1);
    setHasRoster((data || []).length > 0);
    setLoading(false);
  };

  const handleEnable = async () => {
    if (!portalSupabase) return;
    setEnabling(true);
    const { error } = await (portalSupabase as any)
      .from('hierarchy_agencies')
      .update({
        crm_enabled: true,
        onboarding_status: 'pending_csr_assignment',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agency.id);

    if (!error) {
      const updated = {
        ...agency,
        crm_enabled: true,
        onboarding_status: 'pending_csr_assignment' as const,
        is_active: true,
      };
      onAgencyUpdated(updated);
      onRefresh();
    }
    setEnabling(false);
    setShowConfirm(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (agency.crm_enabled) {
    return (
      <div className="p-6">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-emerald-400">CRM Onboarding Enabled</h3>
              <p className="text-sm text-emerald-400/80 mt-1">
                This agency is visible in the CRM Team tab and is being onboarded through the CRM workflow.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-emerald-500/20">
            <h4 className="text-sm font-semibold text-emerald-400 mb-2">CRM Onboarding Status</h4>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium ${
                  agency.onboarding_status === 'onboarding_complete'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                {CRM_ONBOARDING_LABELS[agency.onboarding_status] || agency.onboarding_status}
              </span>
            </div>
          </div>

          <div className="mt-4 p-3 bg-emerald-500/5 rounded-lg">
            <p className="text-xs text-emerald-400/80 flex items-start gap-2">
              <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              CRM enablement cannot be disabled from here. Contact the CRM team if changes are needed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const prerequisites = [
    { label: 'Agency is active', done: agency.is_active },
    { label: 'Roster has been uploaded', done: hasRoster },
    { label: 'Agency phone provided', done: !!agency.agency_phone?.trim() },
  ];

  const allPrereqsMet = agency.is_test || prerequisites.every((p) => p.done);

  return (
    <div className="p-6">
      <div className="bg-secondary/10 border border-border rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-secondary/30 flex items-center justify-center">
            <Monitor className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Enable CRM Onboarding</h3>
            <p className="text-sm text-foreground/80 mt-1">
              Enabling CRM will make this agency visible in the CRM Team tab and begin the CRM onboarding
              workflow (CSR assignment, subaccount setup, etc.).
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-foreground/80 mb-3">Prerequisites</h4>
          <div className="space-y-2">
            {prerequisites.map((prereq, i) => (
              <div key={i} className="flex items-center gap-2.5">
                {prereq.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={`text-sm ${prereq.done ? 'text-foreground/80' : 'text-muted-foreground'}`}>
                  {prereq.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!allPrereqsMet}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-sm transition-all ${
              allPrereqsMet
                ? 'gradient-primary text-primary-foreground'
                : 'bg-secondary/30 text-muted-foreground cursor-not-allowed'
            }`}
          >
            <Monitor className="w-4 h-4" />
            {allPrereqsMet ? 'Enable CRM Onboarding' : 'Complete prerequisites to enable'}
          </button>
          {!allPrereqsMet && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              All prerequisites must be met before enabling CRM.
            </p>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-card border border-border rounded-lg max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Confirm CRM Enablement</h3>
                <p className="text-sm text-foreground/80 mt-1">
                  This will make <strong>{agency.name}</strong> visible in the CRM Team tab.
                </p>
              </div>
            </div>

            <div className="bg-secondary/20 rounded-lg p-3 mb-4 space-y-1.5 text-sm text-foreground/80">
              <p>What will happen:</p>
              <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                <li>Agency will appear in CRM Team for onboarding</li>
                <li>CRM team begins CSR assignment, subaccount setup, etc.</li>
                <li>Existing roster will be used for CRM workflows</li>
                <li>This action cannot be undone from here</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2.5 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-secondary/30"
              >
                Cancel
              </button>
              <button
                onClick={handleEnable}
                disabled={enabling}
                className="px-4 py-2.5 text-sm font-medium gradient-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {enabling ? 'Enabling...' : 'Yes, Enable CRM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
