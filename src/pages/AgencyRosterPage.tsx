import { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  X,
  AlertTriangle,
  ShieldCheck,
  Activity,
  User,
  Phone,
  Mail,
  Hash,
  Users,
  UserPlus,
  Pencil,
  Save,
  Crown,
  Shield,
  Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { parseCSV } from '@/lib/contracting/csvParser';
import { RosterReconcilePanel } from '@/components/roster/RosterReconcilePanel';
import {
  normalizeRosterRows,
  generateTemplateCSV,
  type RosterValidationError,
} from '@/lib/roster-normalizer';
import { fetchAgencyRosterData, type RosterAgentData } from '@/lib/prod-api';
import { fmt$ } from '@/lib/formatUtils';

/* ── Types ──────────────────────────────────────────────────────────── */

interface Agency {
  id: string;
  name: string;
}

interface RosterUpload {
  id: string;
  agency_id: string;
  file_name: string;
  row_count: number;
  uploaded_at: string;
  status: string;
}

type AgentRole = 'agent' | 'manager' | 'admin';

interface RosterAgent {
  id: string;
  upload_id: string;
  agency_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  agent_npn: string;
  gender: string;
  unl_writing_number: string | null;
  gtl_writing_number: string | null;
  ahl_writing_number: string | null;
  heartland_writing_number: string | null;
  manhattan_writing_number: string | null;
  is_manager: boolean;
  role: AgentRole;
  status: string;
  created_at: string;
  updated_at: string;
  // From roster_agent_summary view
  total_policies: number;
  active_policies: number;
  at_risk_policies: number;
  total_annual_premium: number;
  active_annual_premium: number;
}

const ROLE_CONFIG: Record<AgentRole, { label: string; color: string; bg: string; icon: typeof User }> = {
  admin: { label: 'Admin', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30', icon: Crown },
  manager: { label: 'Manager', color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/30', icon: Shield },
  agent: { label: 'Agent', color: 'text-muted-foreground', bg: 'bg-muted border-border', icon: User },
};

const PAGE_SIZE = 25;

/* ── Main Page ──────────────────────────────────────────────────────── */

export function AgencyRosterPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>('');
  const [uploads, setUploads] = useState<RosterUpload[]>([]);
  const [agents, setAgents] = useState<RosterAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<RosterValidationError[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<RosterAgent | null>(null);
  const [agentPolicies, setAgentPolicies] = useState<PolicyRow[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<RosterAgent | null>(null);

  const { isFymAdmin } = useEffectiveAuth();

  // Load agencies on mount
  useEffect(() => {
    loadAgencies();
  }, []);

  // Load roster data when agency changes
  useEffect(() => {
    if (selectedAgencyId) {
      loadRosterData(selectedAgencyId);
    } else {
      setUploads([]);
      setAgents([]);
    }
  }, [selectedAgencyId]);

  const loadAgencies = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('agencies')
      .select('id, name')
      .order('name');
    const list = data || [];
    setAgencies(list);
    // Auto-select FYM for FYM admins
    if (isFymAdmin && !selectedAgencyId) {
      const fym = list.find((a) => a.name === 'FYM');
      if (fym) setSelectedAgencyId(fym.id);
    }
    setLoading(false);
  };

  const loadRosterData = async (agencyId: string) => {
    if (!supabase) return;
    setLoading(true);

    const [uploadsRes, agentsRes] = await Promise.all([
      supabase
        .from('agency_roster_uploads')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('status', 'active')
        .order('uploaded_at', { ascending: false }),
      (async () => {
        // Paginate agency_rosters (Supabase default cap is 1000)
        const PAGE = 1000;
        let offset = 0;
        let all: any[] = [];
        while (true) {
          const { data } = await supabase
            .from('agency_rosters')
            .select('*')
            .eq('agency_id', agencyId)
            .eq('status', 'active')
            .range(offset, offset + PAGE - 1);
          const rows = data || [];
          all = all.concat(rows);
          if (rows.length < PAGE) break;
          offset += PAGE;
        }
        return { data: all };
      })(),
    ]);

    setUploads((uploadsRes.data as RosterUpload[] | null) || []);

    // Enrich roster agents with production metrics from prod DB
    const rosterRows = (agentsRes.data || []) as RosterAgent[];
    const wns = rosterRows
      .map((r) => r.unl_writing_number)
      .filter((w): w is string => !!w);

    if (wns.length > 0) {
      try {
        const prodRes = await fetchAgencyRosterData({ writing_numbers: wns.join(',') });
        const prodMap = new Map<string, RosterAgentData>();
        for (const agent of prodRes.data) {
          prodMap.set(agent.writing_number, agent);
        }
        for (const row of rosterRows) {
          const metrics = row.unl_writing_number ? prodMap.get(row.unl_writing_number) : undefined;
          row.total_policies = metrics?.total_policies ?? 0;
          row.active_policies = metrics?.active_policies ?? 0;
          row.at_risk_policies = metrics?.at_risk_policies ?? 0;
          row.total_annual_premium = metrics?.total_annual_premium ?? 0;
          row.active_annual_premium = metrics?.active_annual_premium ?? 0;
        }
      } catch (err) {
        console.error('Failed to enrich roster with prod data:', err);
        // Still show roster — just without production metrics
        for (const row of rosterRows) {
          row.total_policies = 0;
          row.active_policies = 0;
          row.at_risk_policies = 0;
          row.total_annual_premium = 0;
          row.active_annual_premium = 0;
        }
      }
    } else {
      for (const row of rosterRows) {
        row.total_policies = 0;
        row.active_policies = 0;
        row.at_risk_policies = 0;
        row.total_annual_premium = 0;
        row.active_annual_premium = 0;
      }
    }

    setAgents(rosterRows);
    setLoading(false);
    setPage(0);
    setSearchTerm('');
  };

  const handleUpload = async (file: File) => {
    if (!supabase || !selectedAgencyId) return;
    setUploading(true);
    setUploadErrors([]);

    try {
      const text = await file.text();
      const { rows: rawRows } = parseCSV(text);

      if (rawRows.length === 0) {
        setUploadErrors([{ row: 0, field: '', message: 'CSV file is empty or invalid' }]);
        setUploading(false);
        return;
      }

      const { rows: normalizedRows, errors } = normalizeRosterRows(rawRows);

      if (errors.length > 0 && normalizedRows.length === 0) {
        setUploadErrors(errors);
        setUploading(false);
        return;
      }

      // Mark previous uploads as replaced
      const existingUploads = uploads.filter((u) => u.status === 'active');
      for (const u of existingUploads) {
        await supabase
          .from('agency_roster_uploads')
          .update({ status: 'replaced' })
          .eq('id', u.id);
      }

      // Delete old roster entries for this agency
      await supabase
        .from('agency_rosters')
        .delete()
        .eq('agency_id', selectedAgencyId);

      // Create upload record
      const { data: uploadData, error: uploadError } = await supabase
        .from('agency_roster_uploads')
        .insert({
          agency_id: selectedAgencyId,
          file_name: file.name,
          row_count: normalizedRows.length,
        } as any)
        .select()
        .single();

      if (uploadError || !uploadData) throw uploadError || new Error('Failed to create upload');
      const uploadRecord = uploadData as unknown as RosterUpload;

      // Insert roster entries in batches
      const BATCH = 200;
      for (let i = 0; i < normalizedRows.length; i += BATCH) {
        const batch = normalizedRows.slice(i, i + BATCH).map((row) => ({
          upload_id: uploadRecord.id,
          agency_id: selectedAgencyId,
          first_name: row['First Name'],
          last_name: row['Last Name'],
          email: row['Email'],
          phone: row['Phone'],
          agent_npn: row['Agent NPN'],
          gender: row['Gender'],
          unl_writing_number: row['UNL Writing Number'] || null,
          gtl_writing_number: row['GTL Writing Number'] || null,
          ahl_writing_number: row['AHL Writing Number'] || null,
          heartland_writing_number: row['Heartland Writing Number'] || null,
          manhattan_writing_number: row['Manhattan Writing Number'] || null,
        }));

        const { error: insertError } = await supabase.from('agency_rosters').insert(batch);
        if (insertError) throw insertError;
      }

      if (errors.length > 0) {
        setUploadErrors(errors);
      }

      await loadRosterData(selectedAgencyId);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadErrors([{ row: 0, field: '', message: 'Upload failed. Please check the file and try again.' }]);
    } finally {
      setUploading(false);
    }
  };

  const handleAddAgent = async (data: AddAgentFormData) => {
    if (!supabase || !selectedAgencyId) return;

    // Get the current active upload to link to
    const currentUpload = uploads.find((u) => u.status === 'active');

    const { error } = await supabase.from('agency_rosters').insert({
      upload_id: currentUpload?.id || null,
      agency_id: selectedAgencyId,
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      agent_npn: data.agent_npn.trim(),
      gender: data.gender || null,
      unl_writing_number: data.unl_writing_number?.trim() || null,
      gtl_writing_number: data.gtl_writing_number?.trim() || null,
      ahl_writing_number: data.ahl_writing_number?.trim() || null,
      heartland_writing_number: data.heartland_writing_number?.trim() || null,
      manhattan_writing_number: data.manhattan_writing_number?.trim() || null,
      role: data.role || 'agent',
      is_manager: data.role === 'manager' || data.role === 'admin',
      status: 'active',
    } as any);

    if (error) throw error;

    // Update upload row count
    if (currentUpload) {
      await supabase
        .from('agency_roster_uploads')
        .update({ row_count: (currentUpload.row_count || 0) + 1 })
        .eq('id', currentUpload.id);
    }

    await loadRosterData(selectedAgencyId);
    setAddAgentOpen(false);
  };

  const handleEditAgent = async (id: string, data: Partial<AddAgentFormData>) => {
    if (!supabase) return;

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (data.first_name !== undefined) updatePayload.first_name = data.first_name.trim();
    if (data.last_name !== undefined) updatePayload.last_name = data.last_name.trim();
    if (data.email !== undefined) updatePayload.email = data.email.trim();
    if (data.phone !== undefined) updatePayload.phone = data.phone.trim();
    if (data.agent_npn !== undefined) updatePayload.agent_npn = data.agent_npn.trim();
    if (data.gender !== undefined) updatePayload.gender = data.gender || null;
    if (data.unl_writing_number !== undefined) updatePayload.unl_writing_number = data.unl_writing_number?.trim() || null;
    if (data.gtl_writing_number !== undefined) updatePayload.gtl_writing_number = data.gtl_writing_number?.trim() || null;
    if (data.ahl_writing_number !== undefined) updatePayload.ahl_writing_number = data.ahl_writing_number?.trim() || null;
    if (data.heartland_writing_number !== undefined) updatePayload.heartland_writing_number = data.heartland_writing_number?.trim() || null;
    if (data.manhattan_writing_number !== undefined) updatePayload.manhattan_writing_number = data.manhattan_writing_number?.trim() || null;
    if (data.role !== undefined) {
      updatePayload.role = data.role;
      updatePayload.is_manager = data.role === 'manager' || data.role === 'admin';
    }

    const { error } = await supabase
      .from('agency_rosters')
      .update(updatePayload)
      .eq('id', id);

    if (error) throw error;

    await loadRosterData(selectedAgencyId);
    setEditingAgent(null);
  };

  const handleRoleChange = async (agentId: string, newRole: AgentRole) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('agency_rosters')
      .update({
        role: newRole,
        is_manager: newRole === 'manager' || newRole === 'admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId);

    if (error) {
      console.error('Failed to update role:', error);
      return;
    }

    // Update local state without full reload
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? { ...a, role: newRole, is_manager: newRole === 'manager' || newRole === 'admin' }
          : a
      )
    );
  };

  const handleDownloadTemplate = () => {
    const csv = generateTemplateCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'roster_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAgentClick = async (agent: RosterAgent) => {
    setSelectedAgent(agent);
    setLoadingPolicies(true);
    setAgentPolicies([]);

    if (!supabase) return;

    // Collect all writing numbers for this agent
    const wns = [
      agent.unl_writing_number,
      agent.gtl_writing_number,
      agent.ahl_writing_number,
      agent.heartland_writing_number,
      agent.manhattan_writing_number,
    ].filter((w): w is string => !!w);

    if (wns.length > 0) {
      try {
        const res = await fetchAgencyRosterData({ writing_numbers: wns.join(',') });
        // Flatten all agent policies into a single list for this agent
        const allPolicies: PolicyRow[] = [];
        for (const agentData of res.data) {
          for (const p of agentData.policies) {
            allPolicies.push({
              policy_number: p.policy_number,
              product_type: (p.product_type as 'HI' | 'HHC' | null),
              status: p.status,
              plan_premium: p.plan_premium,
              is_at_risk: p.is_at_risk,
              draft_count: p.draft_count,
              policy_effective_date: p.policy_effective_date,
              paid_to_date: p.paid_to_date,
              writing_number: agentData.writing_number,
            });
          }
        }
        // Sort by effective date descending
        allPolicies.sort((a, b) => (b.policy_effective_date || '').localeCompare(a.policy_effective_date || ''));
        setAgentPolicies(allPolicies);
      } catch (err) {
        console.error('Error loading agent policies from prod:', err);
        setAgentPolicies([]);
      }
    }
    setLoadingPolicies(false);
  };

  // Filtered + paginated agents
  const filteredAgents = useMemo(() => {
    if (!searchTerm) return agents;
    const q = searchTerm.toLowerCase();
    return agents.filter(
      (a) =>
        a.first_name.toLowerCase().includes(q) ||
        a.last_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.phone.includes(q) ||
        a.agent_npn.includes(q)
    );
  }, [agents, searchTerm]);

  const totalPages = Math.ceil(filteredAgents.length / PAGE_SIZE);
  const paginatedAgents = filteredAgents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const activeUpload = uploads.find((u) => u.status === 'active');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Agency Rosters</h1>
            <p className="text-sm text-muted-foreground">Upload and manage agent rosters for CRM onboarding</p>
          </div>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-card border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
        >
          <Download className="w-4 h-4" />
          Download Template
        </button>
      </div>

      {/* ── Reconciliation Panel (admin only) ── */}
      {isFymAdmin && (
        <div className="bg-card rounded-xl border border-border p-5">
          <RosterReconcilePanel />
        </div>
      )}

      {/* Agency selector */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-foreground/80 whitespace-nowrap">Select Agency</label>
          <select
            value={selectedAgencyId}
            onChange={(e) => { setSelectedAgencyId(e.target.value); setUploadErrors([]); }}
            className="flex-1 max-w-md px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:ring-2 focus:ring-ring"
          >
            <option value="">Choose an agency...</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          {selectedAgencyId && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAddAgentOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add Agent
              </button>
              <label className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50">
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Upload CSV'}
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Upload info */}
        {activeUpload && (
          <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
            <span>Current roster: <span className="font-medium text-foreground">{activeUpload.file_name}</span></span>
            <span>•</span>
            <span>{activeUpload.row_count} agents</span>
            <span>•</span>
            <span>Uploaded {new Date(activeUpload.uploaded_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}</span>
          </div>
        )}
      </div>

      {/* Validation errors */}
      {uploadErrors.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-semibold text-red-400">Upload Validation Errors</h3>
            <button onClick={() => setUploadErrors([])} className="ml-auto p-1 hover:bg-red-500/20 rounded">
              <X className="w-4 h-4 text-red-400" />
            </button>
          </div>
          <ul className="space-y-1 text-sm text-red-300 max-h-40 overflow-y-auto">
            {uploadErrors.slice(0, 20).map((err, i) => (
              <li key={i}>
                {err.row > 0 ? `Row ${err.row}` : 'File'}{err.field ? ` — ${err.field}` : ''}: {err.message}
              </li>
            ))}
            {uploadErrors.length > 20 && (
              <li className="text-red-400 font-medium">...and {uploadErrors.length - 20} more errors</li>
            )}
          </ul>
        </div>
      )}

      {/* Agent table */}
      {selectedAgencyId && !loading && (
        <>
          {/* Search + count */}
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, email, phone, NPN..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring text-sm bg-background text-foreground"
                />
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    {['First Name', 'Last Name', 'Email', 'Phone', 'Agent NPN'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Policies
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      At Risk
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedAgents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                        {agents.length === 0
                          ? 'No roster uploaded yet. Upload a CSV to get started.'
                          : 'No agents match your search.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedAgents.map((agent) => {
                      return (
                        <tr
                          key={agent.id}
                          onClick={() => handleAgentClick(agent)}
                          className="hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-foreground font-medium">{agent.first_name}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{agent.last_name}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{agent.email}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{agent.phone}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{agent.agent_npn}</td>
                          <td className="px-4 py-3 text-sm">
                            <RoleBadge
                              role={agent.role || 'agent'}
                              agentId={agent.id}
                              onRoleChange={handleRoleChange}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                            {agent.active_policies}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {agent.at_risk_policies > 0 ? (
                              <span className="inline-flex items-center gap-1 text-red-400 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {agent.at_risk_policies}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAgent(agent);
                              }}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                              title="Edit agent"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted">
                <p className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-foreground"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-foreground"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Loading state */}
      {loading && selectedAgencyId && (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading roster data...</p>
        </div>
      )}

      {/* Agent Detail Dialog */}
      {selectedAgent && (
        <AgentDetailDialog
          agent={selectedAgent}
          policies={agentPolicies}
          loadingPolicies={loadingPolicies}
          onClose={() => { setSelectedAgent(null); setAgentPolicies([]); }}
        />
      )}

      {/* Add Agent Modal */}
      {addAgentOpen && (
        <AddAgentModal
          onClose={() => setAddAgentOpen(false)}
          onSave={handleAddAgent}
        />
      )}

      {/* Edit Agent Modal */}
      {editingAgent && (
        <EditAgentModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          onSave={(data) => handleEditAgent(editingAgent.id, data)}
        />
      )}
    </div>
  );
}

/* ── Agent Detail Dialog ────────────────────────────────────────────── */

interface PolicyRow {
  policy_number: string;
  product_type: 'HI' | 'HHC' | null;
  status: string | null;
  plan_premium: number | null;
  is_at_risk: boolean;
  draft_count: number;
  policy_effective_date: string | null;
  paid_to_date: string | null;
  writing_number: string | null;
}

interface AgentDetailDialogProps {
  agent: RosterAgent;
  policies: PolicyRow[];
  loadingPolicies: boolean;
  onClose: () => void;
}

function AgentDetailDialog({ agent, policies, loadingPolicies, onClose }: AgentDetailDialogProps) {
  const activePolicies = policies.filter((p) => p.status === 'active');
  const atRiskPolicies = policies.filter((p) => p.is_at_risk);
  const totalAP = activePolicies.reduce((s, p) => s + (Number(p.plan_premium) || 0) * 12, 0);

  const writingNumbers = [
    { label: 'UNL', value: agent.unl_writing_number },
    { label: 'GTL', value: agent.gtl_writing_number },
    { label: 'AHL', value: agent.ahl_writing_number },
    { label: 'Heartland', value: agent.heartland_writing_number },
    { label: 'Manhattan', value: agent.manhattan_writing_number },
  ].filter((w) => w.value);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto animate-in fade-in">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {agent.first_name} {agent.last_name}
              </h2>
              <p className="text-sm text-muted-foreground">NPN: {agent.agent_npn} • {agent.gender}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Contact + Writing Numbers */}
        <div className="px-6 py-4 border-b border-border">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground">{agent.email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground">{agent.phone}</span>
            </div>
          </div>

          {writingNumbers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {writingNumbers.map((wn) => (
                <span
                  key={wn.label}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-lg text-xs font-medium"
                >
                  <Hash className="w-3 h-3 text-muted-foreground" />
                  <span className="text-muted-foreground">{wn.label}:</span>
                  <span className="text-foreground font-mono">{wn.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Stats cards */}
        <div className="px-6 py-4 border-b border-border">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <Activity className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-2xl font-bold text-foreground">{activePolicies.length}</p>
              <p className="text-xs text-muted-foreground">Active Policies</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-foreground">{fmt$(totalAP)}</p>
              <p className="text-xs text-muted-foreground">Annual Premium</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${atRiskPolicies.length > 0 ? 'text-red-400' : 'text-muted-foreground'}`} />
              <p className={`text-2xl font-bold ${atRiskPolicies.length > 0 ? 'text-red-400' : 'text-foreground'}`}>
                {atRiskPolicies.length}
              </p>
              <p className="text-xs text-muted-foreground">At Risk</p>
            </div>
          </div>
        </div>

        {/* Policy list */}
        <div className="px-6 py-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Policies ({policies.length})
          </h3>

          {loadingPolicies ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : policies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No policies found for this agent's writing numbers.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {policies.map((p) => (
                <div
                  key={p.policy_number}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                    p.is_at_risk
                      ? 'border-red-500/20 bg-red-500/5'
                      : 'border-border bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      p.product_type === 'HI'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {p.product_type}
                    </span>
                    <span className="text-sm font-mono text-foreground">{p.policy_number}</span>
                    <span className={`text-xs font-medium ${
                      p.status === 'active' ? 'text-emerald-400' : 'text-muted-foreground'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {p.is_at_risk && (
                      <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        At Risk
                      </span>
                    )}
                    <span className="text-muted-foreground font-mono">
                      {p.plan_premium ? fmt$(Number(p.plan_premium) * 12) : '—'}/yr
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.draft_count} draft{p.draft_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Role Badge (inline dropdown) ───────────────────────────────────── */

interface RoleBadgeProps {
  role: AgentRole;
  agentId: string;
  onRoleChange: (agentId: string, newRole: AgentRole) => void;
}

function RoleBadge({ role, agentId, onRoleChange }: RoleBadgeProps) {
  const [open, setOpen] = useState(false);
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors hover:opacity-80 ${config.bg} ${config.color}`}
      >
        <Icon className="w-3 h-3" />
        {config.label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px] animate-in fade-in">
            {(['agent', 'manager', 'admin'] as AgentRole[]).map((r) => {
              const rc = ROLE_CONFIG[r];
              const RIcon = rc.icon;
              return (
                <button
                  key={r}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRoleChange(agentId, r);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors ${
                    r === role ? 'font-semibold' : ''
                  }`}
                >
                  <RIcon className={`w-4 h-4 ${rc.color}`} />
                  <span className="text-foreground">{rc.label}</span>
                  {r === role && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Add / Edit Form Types ──────────────────────────────────────────── */

interface AddAgentFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  agent_npn: string;
  gender: string;
  unl_writing_number: string;
  gtl_writing_number: string;
  ahl_writing_number: string;
  heartland_writing_number: string;
  manhattan_writing_number: string;
  role: AgentRole;
}

const EMPTY_FORM: AddAgentFormData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  agent_npn: '',
  gender: '',
  unl_writing_number: '',
  gtl_writing_number: '',
  ahl_writing_number: '',
  heartland_writing_number: '',
  manhattan_writing_number: '',
  role: 'agent',
};

/* ── Shared Form Fields ─────────────────────────────────────────────── */

interface AgentFormFieldsProps {
  form: AddAgentFormData;
  onChange: (field: keyof AddAgentFormData, value: string) => void;
}

function AgentFormFields({ form, onChange }: AgentFormFieldsProps) {
  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground/80 mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.first_name}
            onChange={(e) => onChange('first_name', e.target.value)}
            placeholder="Jane"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/80 mb-1">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.last_name}
            onChange={(e) => onChange('last_name', e.target.value)}
            placeholder="Smith"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground/80 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="jane@email.com"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/80 mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
      </div>

      {/* NPN + Gender */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground/80 mb-1">Agent NPN</label>
          <input
            type="text"
            value={form.agent_npn}
            onChange={(e) => onChange('agent_npn', e.target.value)}
            placeholder="12345678"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground/80 mb-1">Gender</label>
          <div className="flex gap-2">
            {['Male', 'Female'].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onChange('gender', g)}
                className={`flex-1 py-2 text-sm font-medium border rounded-lg transition-colors ${
                  form.gender === g
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Role */}
      <div>
        <label className="block text-xs font-medium text-foreground/80 mb-2">Role</label>
        <div className="flex gap-2">
          {(['agent', 'manager', 'admin'] as AgentRole[]).map((r) => {
            const rc = ROLE_CONFIG[r];
            const RIcon = rc.icon;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onChange('role', r)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium border rounded-lg transition-colors ${
                  form.role === r
                    ? `border-primary bg-primary/10 ${rc.color}`
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted'
                }`}
              >
                <RIcon className="w-4 h-4" />
                {rc.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Writing Numbers */}
      <div>
        <label className="block text-xs font-medium text-foreground/80 mb-2">Writing Numbers</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'unl_writing_number' as const, label: 'UNL' },
            { key: 'gtl_writing_number' as const, label: 'GTL' },
            { key: 'ahl_writing_number' as const, label: 'AHL' },
            { key: 'heartland_writing_number' as const, label: 'Heartland' },
            { key: 'manhattan_writing_number' as const, label: 'Manhattan' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground w-20">{label}</span>
              <input
                type="text"
                value={form[key]}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder={`${label} #`}
                className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm bg-background text-foreground font-mono focus:ring-2 focus:ring-ring focus:border-ring"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Add Agent Modal ────────────────────────────────────────────────── */

interface AddAgentModalProps {
  onClose: () => void;
  onSave: (data: AddAgentFormData) => Promise<void>;
}

function AddAgentModal({ onClose, onSave }: AddAgentModalProps) {
  const [form, setForm] = useState<AddAgentFormData>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: keyof AddAgentFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async () => {
    if (!form.first_name.trim()) { setError('First name is required.'); return; }
    if (!form.last_name.trim()) { setError('Last name is required.'); return; }

    setSubmitting(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add agent.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-none max-w-lg w-full max-h-[85vh] overflow-y-auto animate-in fade-in">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Add Agent</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Add a new agent to the roster</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5">
          <AgentFormFields form={form} onChange={handleChange} />

          {error && (
            <p className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Adding...</>
            ) : (
              <><UserPlus className="w-4 h-4" />Add Agent</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit Agent Modal ───────────────────────────────────────────────── */

interface EditAgentModalProps {
  agent: RosterAgent;
  onClose: () => void;
  onSave: (data: Partial<AddAgentFormData>) => Promise<void>;
}

function EditAgentModal({ agent, onClose, onSave }: EditAgentModalProps) {
  const [form, setForm] = useState<AddAgentFormData>({
    first_name: agent.first_name || '',
    last_name: agent.last_name || '',
    email: agent.email || '',
    phone: agent.phone || '',
    agent_npn: agent.agent_npn || '',
    gender: agent.gender || '',
    unl_writing_number: agent.unl_writing_number || '',
    gtl_writing_number: agent.gtl_writing_number || '',
    ahl_writing_number: agent.ahl_writing_number || '',
    heartland_writing_number: agent.heartland_writing_number || '',
    manhattan_writing_number: agent.manhattan_writing_number || '',
    role: agent.role || 'agent',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: keyof AddAgentFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async () => {
    if (!form.first_name.trim()) { setError('First name is required.'); return; }
    if (!form.last_name.trim()) { setError('Last name is required.'); return; }

    setSubmitting(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-none max-w-lg w-full max-h-[85vh] overflow-y-auto animate-in fade-in">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Edit Agent</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {agent.first_name} {agent.last_name}
            </p>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5">
          <AgentFormFields form={form} onChange={handleChange} />

          {error && (
            <p className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-foreground/80 glass rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
            ) : (
              <><Save className="w-4 h-4" />Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
