/**
 * AgentDatabaseTab — Complete agent database with filters, table, actions
 *
 * Ported from contracting-portal/src/pages/AgentDatabase.tsx
 * Reads completed agents + intake submissions + LOB assignments from
 * portal Supabase (akhojh…). All modals broken into dedicated components.
 *
 * Features:
 *   - Name / security code / form type / agency filters
 *   - Sortable table with agent details
 *   - CSV export
 *   - View details (AgentDetailModal)
 *   - Edit agent (AgentEditModal)
 *   - CRM onboarding (CrmOnboardingModal)
 *   - Undo CRM (test only, "Tester Mitchell")
 *   - Terminate agent (TerminateAgentModal)
 */
import { useState, useEffect } from 'react';
import {
  Eye,
  FileDown,
  CheckCircle,
  UserPlus,
  Undo2,
  UserX,
  Pencil,
  Database,
  Loader2,
} from 'lucide-react';
import { portalSupabase } from '@/lib/portal-supabase';
import { formatPhoneDisplay } from '@/lib/contracting/helpers';
import type {
  PortalAgent,
  PortalIntakeRecord,
  PortalLobAssignment,
} from '@/lib/contracting/types';
import { AgentDetailModal } from './AgentDetailModal';
import { AgentEditModal } from './AgentEditModal';
import { CrmOnboardingModal } from './CrmOnboardingModal';
import { TerminateAgentModal } from './TerminateAgentModal';

export function AgentDatabaseTab() {
  const [agents, setAgents] = useState<PortalAgent[]>([]);
  const [submissions, setSubmissions] = useState<
    Record<string, PortalIntakeRecord>
  >({});
  const [lobAssignments, setLobAssignments] = useState<
    Record<string, PortalLobAssignment[]>
  >({});
  const [filteredAgents, setFilteredAgents] = useState<PortalAgent[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchName, setSearchName] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [formTypeFilter, setFormTypeFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');

  // Modal state
  const [detailAgent, setDetailAgent] = useState<PortalAgent | null>(null);
  const [editAgent, setEditAgent] = useState<PortalAgent | null>(null);
  const [crmAgent, setCrmAgent] = useState<PortalAgent | null>(null);
  const [undoAgent, setUndoAgent] = useState<PortalAgent | null>(null);
  const [undoSubmitting, setUndoSubmitting] = useState(false);
  const [undoError, setUndoError] = useState('');
  const [terminateAgent, setTerminateAgent] = useState<PortalAgent | null>(
    null
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, searchName, searchCode, formTypeFilter, agencyFilter]);

  const loadData = async () => {
    if (!portalSupabase) {
      setLoading(false);
      return;
    }

    const { data: agentData } = await portalSupabase
      .from('agents')
      .select('*')
      .eq('status', 'completed')
      .order('date_completed', { ascending: false });

    if (agentData) {
      setAgents(agentData as PortalAgent[]);

      // Load intake records
      const { data: submissionData } = await portalSupabase
        .from('agent_intake')
        .select('*')
        .in(
          'agent_id',
          agentData.map((a) => a.id)
        );

      if (submissionData) {
        const map: Record<string, PortalIntakeRecord> = {};
        submissionData.forEach((sub) => {
          map[sub.agent_id] = sub as PortalIntakeRecord;
        });
        setSubmissions(map);
      }

      // Load LOB assignments
      const { data: lobData } = await portalSupabase
        .from('agent_lob_assignments')
        .select('*')
        .in(
          'agent_id',
          agentData.map((a) => a.id)
        );

      if (lobData) {
        const map: Record<string, PortalLobAssignment[]> = {};
        lobData.forEach((row) => {
          const r = row as PortalLobAssignment;
          if (!map[r.agent_id]) map[r.agent_id] = [];
          map[r.agent_id].push(r);
        });
        setLobAssignments(map);
      }
    }

    setLoading(false);
  };

  const filterAgents = () => {
    let filtered = [...agents];

    if (searchName) {
      const q = searchName.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.first_name.toLowerCase().includes(q) ||
          a.last_name.toLowerCase().includes(q)
      );
    }

    if (searchCode) {
      filtered = filtered.filter((a) =>
        a.security_code.includes(searchCode)
      );
    }

    if (formTypeFilter) {
      filtered = filtered.filter((a) => a.form_type === formTypeFilter);
    }

    if (agencyFilter) {
      filtered = filtered.filter((a) => a.agency === agencyFilter);
    }

    setFilteredAgents(filtered);
  };

  // ─── CSV Export ──────────────────────────────────────────────────────────

  const handleExportCsv = () => {
    const escapeField = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const headerRow = [
      'Agent First Name',
      'Agent Last Name',
      'Agent NPN',
      'UNL Writing Number',
      'GTL Writing Number',
      'Phone',
    ];
    const csvRows = [headerRow.join(',')];

    filteredAgents.forEach((agent) => {
      const submission = submissions[agent.id];
      const lobs = lobAssignments[agent.id] || [];
      const unlRow = lobs.find((l) => l.carrier === 'UNL');
      const gtlRow = lobs.find((l) => l.carrier === 'GTL');

      csvRows.push(
        [
          escapeField(agent.first_name),
          escapeField(agent.last_name),
          escapeField(submission?.npn || ''),
          escapeField(unlRow?.writing_number || ''),
          escapeField(gtlRow?.writing_number || ''),
          escapeField(formatPhoneDisplay(agent.phone)),
        ].join(',')
      );
    });

    const blob = new Blob([csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ─── CRM Undo (test only — "Tester Mitchell") ───────────────────────────

  const isTestMitchell = (agent: PortalAgent) =>
    agent.first_name.toLowerCase() === 'tester' &&
    agent.last_name.toLowerCase() === 'mitchell';

  const handleCrmUndo = async () => {
    if (!portalSupabase || !undoAgent) return;
    setUndoSubmitting(true);
    setUndoError('');

    try {
      const agency = undoAgent.agency;

      const { data: upload } = await portalSupabase
        .from('crm_roster_uploads')
        .select('id')
        .eq('agency', agency)
        .maybeSingle();

      if (upload) {
        const { data: rosterRows } = await portalSupabase
          .from('crm_roster')
          .select('id, row_data')
          .eq('upload_id', upload.id);

        const matchingRows = (rosterRows || []).filter(
          (r) =>
            r.row_data['First Name']?.toLowerCase() === 'tester' &&
            r.row_data['Last Name']?.toLowerCase() === 'mitchell'
        );

        for (const row of matchingRows) {
          const clearedRowData = {
            ...row.row_data,
            'First Name': '',
            'Last Name': '',
            Phone: '',
            Email: '',
            'Agent NPN': '',
            'All Templates | Agent Profile Image': '',
          };
          await portalSupabase
            .from('crm_roster')
            .update({ row_data: clearedRowData })
            .eq('id', row.id);
        }
      }

      await portalSupabase
        .from('agents')
        .update({ crm_onboarded: false })
        .eq('id', undoAgent.id);

      setAgents((prev) =>
        prev.map((a) =>
          a.id === undoAgent.id ? { ...a, crm_onboarded: false } : a
        )
      );

      setUndoSubmitting(false);
      setUndoAgent(null);
    } catch {
      setUndoError('An unexpected error occurred. Please try again.');
      setUndoSubmitting(false);
    }
  };

  // ─── Event Handlers ─────────────────────────────────────────────────────

  const handleCrmComplete = (agentId: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId ? { ...a, crm_onboarded: true } : a
      )
    );
    setCrmAgent(null);
  };

  const handleTerminateComplete = (agentId: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    setTerminateAgent(null);
  };

  const handleEditSaved = (updated: PortalAgent) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
    if (detailAgent?.id === updated.id) setDetailAgent(updated);
    setEditAgent(null);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!portalSupabase) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">Portal connection not configured</p>
        <p className="text-sm mt-1">
          Set VITE_PORTAL_SUPABASE_URL and VITE_PORTAL_SUPABASE_KEY to
          enable.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-navy-600 mr-2" />
        <span className="text-gray-600">Loading agent database…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-navy-600">Agent Database</h2>
          <p className="text-gray-600 mt-1">
            {filteredAgents.length} of {agents.length} completed agent
            {agents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={filteredAgents.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-navy-600 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm shadow-sm"
        >
          <FileDown className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search by agent name..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-navy-500 focus:border-transparent"
          />
          <input
            type="text"
            placeholder="Search by security code..."
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-navy-500 focus:border-transparent"
          />
          <select
            value={formTypeFilter}
            onChange={(e) => setFormTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-navy-500 focus:border-transparent"
          >
            <option value="">All Form Types</option>
            <option value="life-only">Life Only</option>
            <option value="field">Field</option>
            <option value="direct-pay">Direct Pay</option>
            <option value="telesales">Telesales</option>
            <option value="hip-career">HIP Career</option>
            <option value="hip-broker">HIP Broker</option>
            <option value="hip">HIP (Legacy)</option>
            <option value="field-hip">Field HIP</option>
            <option value="direct-pay-hip">Direct Pay HIP</option>
            <option value="telesales-hip">Telesales HIP</option>
          </select>
          <select
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-navy-500 focus:border-transparent"
          >
            <option value="">All Agencies</option>
            <option value="FYM">FYM</option>
            <option value="Wisechoice">Wisechoice</option>
            <option value="Aspire">Aspire</option>
          </select>
        </div>
      </div>

      {/* Agent Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Agent Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Form Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Agency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Security Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  NPN
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Resident State
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAgents.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    {agents.length === 0
                      ? 'No completed agents found'
                      : 'No agents match the current filters'}
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => {
                  const submission = submissions[agent.id];
                  return (
                    <tr key={agent.id} className="hover:bg-gray-50">
                      <td
                        className="px-6 py-4 whitespace-nowrap cursor-pointer text-navy-600 hover:underline"
                        onClick={() => setDetailAgent(agent)}
                      >
                        {agent.first_name} {agent.last_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {agent.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {formatPhoneDisplay(agent.phone)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap capitalize">
                        {agent.form_type.replace('-', ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {agent.agency}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono">
                        {agent.security_code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {agent.date_completed
                          ? new Date(
                              agent.date_completed
                            ).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {submission?.npn || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {submission?.resident_state || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {/* Edit */}
                          <div className="relative group/edit">
                            <button
                              onClick={() => setEditAgent(agent)}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                              aria-label={`Edit ${agent.first_name} ${agent.last_name}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-xs font-medium text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover/edit:opacity-100 transition-opacity pointer-events-none">
                              Edit Agent
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                            </span>
                          </div>

                          {/* View */}
                          <div className="relative group/view">
                            <button
                              onClick={() => setDetailAgent(agent)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              aria-label={`View details for ${agent.first_name} ${agent.last_name}`}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-xs font-medium text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover/view:opacity-100 transition-opacity pointer-events-none">
                              View Details
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                            </span>
                          </div>

                          {/* CRM Onboarding */}
                          <div className="relative group/crm">
                            {agent.crm_onboarded ? (
                              <span
                                className="p-1.5 inline-flex text-emerald-600 cursor-default"
                                aria-label={`CRM submitted for ${agent.first_name} ${agent.last_name}`}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </span>
                            ) : (
                              <button
                                onClick={() => setCrmAgent(agent)}
                                className="p-1.5 text-amber-500 hover:bg-amber-50 rounded transition-colors"
                                aria-label={`Start CRM onboarding for ${agent.first_name} ${agent.last_name}`}
                              >
                                <UserPlus className="w-4 h-4" />
                              </button>
                            )}
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-xs font-medium text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover/crm:opacity-100 transition-opacity pointer-events-none">
                              {agent.crm_onboarded
                                ? 'CRM Submitted'
                                : 'CRM Onboarding'}
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                            </span>
                          </div>

                          {/* Undo CRM (test only) */}
                          {agent.crm_onboarded && isTestMitchell(agent) && (
                            <div className="relative group/undo">
                              <button
                                onClick={() => {
                                  setUndoError('');
                                  setUndoAgent(agent);
                                }}
                                className="p-1.5 text-orange-500 hover:bg-orange-50 rounded transition-colors"
                                aria-label={`Undo CRM for ${agent.first_name} ${agent.last_name}`}
                              >
                                <Undo2 className="w-4 h-4" />
                              </button>
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-xs font-medium text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover/undo:opacity-100 transition-opacity pointer-events-none">
                                Undo CRM (Test Only)
                                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                              </span>
                            </div>
                          )}

                          {/* Terminate */}
                          {agent.crm_onboarded && (
                            <div className="relative group/terminate">
                              <button
                                onClick={() => setTerminateAgent(agent)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                aria-label={`Terminate ${agent.first_name} ${agent.last_name}`}
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 text-xs font-medium text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover/terminate:opacity-100 transition-opacity pointer-events-none">
                                Terminate Agent
                                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {detailAgent && (
        <AgentDetailModal
          agent={detailAgent}
          submission={submissions[detailAgent.id] || null}
          onClose={() => setDetailAgent(null)}
        />
      )}

      {editAgent && (
        <AgentEditModal
          agent={editAgent}
          onClose={() => setEditAgent(null)}
          onSaved={handleEditSaved}
        />
      )}

      {crmAgent && (
        <CrmOnboardingModal
          agent={crmAgent}
          submission={submissions[crmAgent.id] || null}
          onClose={() => setCrmAgent(null)}
          onComplete={handleCrmComplete}
        />
      )}

      {terminateAgent && (
        <TerminateAgentModal
          agent={terminateAgent}
          onClose={() => setTerminateAgent(null)}
          onComplete={handleTerminateComplete}
        />
      )}

      {/* Undo CRM Modal (inline — test only) */}
      {undoAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-orange-600">
                Undo CRM Onboarding
              </h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-700">
                This will clear the CRM seat data for{' '}
                <span className="font-semibold">
                  {undoAgent.first_name} {undoAgent.last_name}
                </span>{' '}
                and allow re-onboarding.
              </p>
              <p className="text-gray-500 text-sm mt-2">
                This is a test-only action.
              </p>
              {undoError && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {undoError}
                </p>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
              <button
                onClick={() => {
                  setUndoAgent(null);
                  setUndoError('');
                }}
                disabled={undoSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCrmUndo}
                disabled={undoSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-md hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {undoSubmitting ? 'Clearing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
