/**
 * ContractingHierarchyTab — Agency hierarchy tree, intake queue, and
 * per-agency detail panel (Onboarding / Roster / Carriers / CRM sub-tabs).
 *
 * Ported from contracting-portal/src/pages/Hierarchy.tsx +
 * contracting-portal/src/pages/hierarchy/*.tsx
 *
 * All data reads/writes go through portalSupabase (akhojh…).
 *
 * Sub-components live in ./hierarchy/ — this file contains only the
 * tree-building helpers and the top-level orchestration component.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GitBranch,
  Plus,
  Search,
  Link as LinkIcon,
  Check,
  Database,
  Building2,
  Monitor,
  AlertTriangle,
  Inbox,
  X,
  ChevronsUpDown,
  FileDown,
} from 'lucide-react';
import { HudFrame } from '@/components/ui/hud-frame';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import { portalSupabase } from '@/lib/portal-supabase';
import { createActivationRecord, sendOnboardingEmail } from '@/lib/contracting/onboarding-service';
import { triggerAgencySync } from '@/lib/sync-agencies';
import type {
  PortalCrmAgency,
  AgencyIntakeSubmission,
} from '@/lib/contracting/types';

import {
  TreeNode,
  DeleteConfirmModal,
  PendingIntakeTray,
  ApproveIntakeModal,
  AddAgencyHierarchyModal,
  AgencyDetailPanel,
} from './hierarchy';
import type { AgencyNode } from './hierarchy';

// ─── Tree building helpers ────────────────────────────────────────────────

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

function countDescendants(node: AgencyNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
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
  const [allCollapsed, setAllCollapsed] = useState(false);

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
    setAllCollapsed(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tree = React.useMemo(() => buildRecursiveTree(agencies, agentCounts), [agencies, agentCounts]);

  // KPI summary stats
  const kpiStats = useMemo(() => {
    const total = agencies.filter(a => a.agency_type !== 'main').length;
    const crmEnabled = agencies.filter(a => a.crm_enabled).length;
    const incomplete = agencies.filter(a => {
      const isFym = a.name.toLowerCase() === 'fym';
      const isRoot = a.agency_type === 'main';
      if (isFym || isRoot) return false;
      return !a.agency_npn?.trim() || !a.agency_ein?.trim() || !a.principal_agent?.trim() ||
        !a.principal_agent_npn?.trim() || !a.contracting_email?.trim();
    }).length;
    return { total, crmEnabled, incomplete, pendingIntakes: pendingIntakes.length };
  }, [agencies, pendingIntakes]);

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

  const toggleCollapseAll = () => {
    if (allCollapsed) {
      setExpandedNodes(new Set(agencies.map((a) => a.id)));
    } else {
      setExpandedNodes(new Set());
    }
    setAllCollapsed(!allCollapsed);
  };

  const handleExportCSV = () => {
    const rows = agencies
      .filter((a) => a.agency_type !== 'main')
      .sort((a, b) => a.name.localeCompare(b.name));
    const headers = ['Agency Name', 'Principal Agent', 'Agency NPN', 'Agency EIN', 'Contracting Email', 'CRM Enabled', 'Carriers', 'State', 'Date Created'];
    const csvRows = [
      headers.join(','),
      ...rows.map((a) => [
        `"${(a.name || '').replace(/"/g, '""')}"`,
        `"${(a.principal_agent || '').replace(/"/g, '""')}"`,
        a.agency_npn || '',
        a.agency_ein || '',
        a.contracting_email || '',
        a.crm_enabled ? 'Yes' : 'No',
        `"${(a.carriers || []).join(', ')}"`,
        a.agency_state || '',
        a.date_created || '',
      ].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fym-agency-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
        // portal_password removed — DB trigger auto-sets '{name}CRMPortal!'
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

      await createActivationRecord({
        slug,
        agencyName: name,
        principalName: contracting.principal_agent,
        principalEmail: contracting.principal_agent_email,
        compTier: contracting.comp_tier,
        variant: contracting.variant,
      });

      const activationUrl = `https://teamfym.com/activation/${slug}`;
      await sendOnboardingEmail({
        agencyName: name,
        principalName: contracting.principal_agent,
        principalEmail: contracting.principal_agent_email,
        activationUrl,
        portalSlug: slug,
        portalPassword: portalPassword,
      }).catch((e) => console.error('Failed to send onboarding email:', e));

      triggerAgencySync().catch((e) => console.error('Agency sync failed:', e));
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
          // portal_password removed — DB trigger auto-sets '{name}CRMPortal!'
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
      triggerAgencySync().catch((e) => console.error('Agency sync after delete failed:', e));
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
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary/20 animate-pulse" />
            <div>
              <div className="h-6 w-48 bg-secondary/20 rounded animate-pulse" />
              <div className="h-4 w-64 bg-secondary/20 rounded animate-pulse mt-1" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[0,1,2,3].map(i => (
            <div key={i} className="bg-card border border-border rounded-lg p-4">
              <div className="h-3 w-16 bg-secondary/20 rounded animate-pulse mb-2" />
              <div className="h-8 w-12 bg-secondary/20 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className="h-14 bg-card border border-border rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
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

      {/* KPI Summary Cards */}
      <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StaggerItem>
          <HudFrame accentColor="hsl(142 71% 45% / 0.5)">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Agencies</span>
              </div>
              <p className="text-3xl font-bold text-foreground tabular-nums">{kpiStats.total}</p>
            </div>
          </HudFrame>
        </StaggerItem>
        <StaggerItem>
          <HudFrame accentColor="hsl(142 71% 45% / 0.5)">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">CRM Enabled</span>
              </div>
              <p className="text-3xl font-bold text-emerald-400 tabular-nums">{kpiStats.crmEnabled}</p>
            </div>
          </HudFrame>
        </StaggerItem>
        <StaggerItem>
          <HudFrame accentColor="hsl(25 95% 53% / 0.5)">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Incomplete</span>
              </div>
              <p className="text-3xl font-bold text-orange-400 tabular-nums">{kpiStats.incomplete}</p>
            </div>
          </HudFrame>
        </StaggerItem>
        <StaggerItem>
          <HudFrame accentColor="hsl(45 93% 47% / 0.5)">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Inbox className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pending Intake</span>
              </div>
              <p className="text-3xl font-bold text-amber-400 tabular-nums">{kpiStats.pendingIntakes}</p>
            </div>
          </HudFrame>
        </StaggerItem>
      </StaggerContainer>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={toggleCollapseAll}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg text-foreground/80 hover:bg-secondary/30 transition-colors bg-card"
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
          {allCollapsed ? 'Expand All' : 'Collapse All'}
        </button>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg text-foreground/80 hover:bg-secondary/30 transition-colors bg-card"
        >
          <FileDown className="w-3.5 h-3.5" />
          Export CSV
        </button>
        {(search || principalSearch) && (
          <span className="text-xs text-muted-foreground ml-auto">
            Showing {displayTree.reduce((acc, n) => acc + 1 + countDescendants(n), 0)} of {kpiStats.total} agencies
          </span>
        )}
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by agency name..."
            className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-card text-foreground placeholder:text-muted-foreground"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-secondary/40 text-muted-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={principalSearch}
            onChange={(e) => setPrincipalSearch(e.target.value)}
            placeholder="Search by principal agent..."
            className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-transparent bg-card text-foreground placeholder:text-muted-foreground"
          />
          {principalSearch && (
            <button
              onClick={() => setPrincipalSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-secondary/40 text-muted-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
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
