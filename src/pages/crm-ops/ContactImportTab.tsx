/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
/**
 * @crm-team-protected
 *
 * DO NOT standardize agency names or apply crosswalk logic in this file.
 * DO NOT reference cc_agency_crosswalk or cleanDisplayName here.
 * CRM Team tab subtab — owns its own naming; see CrmTeam.tsx for context.
 */
// @ts-nocheck
import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Send,
  Tag,
  X,
  Loader2,
  Users,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import { parseCSV } from '@/lib/crm/csv-parser';

const EXPECTED_HEADERS = ['Contact Id', 'First Name', 'Last Name', 'Phone', 'Email', 'Business Name', 'Created', 'Last Activity', 'Tags', 'Agent NPN'];
const ZAPIER_WEBHOOK = 'https://hooks.zapier.com/hooks/catch/25274165/43g4ak9/';

type MappedRow = {
  contactId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  tags: string;
  created: string;
  agentNpn: string;
  agentName: string;
  agency: string;
  selected: boolean;
  pushStatus: 'pending' | 'sent' | 'failed';
  rawData: Record<string, string>;
};

type UnmatchedNpn = {
  npn: string;
  clients: { firstName: string; lastName: string; phone: string }[];
};

type AgentGroup = {
  npn: string;
  agentName: string;
  agency: string;
  rows: MappedRow[];
};

export const ContactImportTab: React.FC = () => {
  const [step, setStep] = useState<'upload' | 'results'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([]);
  const [unmatchedNpns, setUnmatchedNpns] = useState<UnmatchedNpn[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [tagApplied, setTagApplied] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState({ sent: 0, failed: 0, total: 0 });
  const [pushDone, setPushDone] = useState(false);
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      const missing = EXPECTED_HEADERS.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        setError(`Missing columns: ${missing.join(', ')}`);
        setLoading(false);
        return;
      }

      const uniqueNpns = [...new Set(rows.map(r => r['Agent NPN']).filter(Boolean))];

      const { data: rosterRows } = await supabase
        .from('crm_roster')
        .select('row_data, upload_id')
        .filter('row_data->>Agent NPN', 'in', `(${uniqueNpns.join(',')})`);

      const { data: uploads } = await supabase
        .from('crm_roster_uploads')
        .select('id, agency');

      const uploadAgencyMap: Record<string, string> = {};
      (uploads || []).forEach(u => { uploadAgencyMap[u.id] = u.agency; });

      const npnMap: Record<string, { agentName: string; agency: string }> = {};
      (rosterRows || []).forEach(row => {
        const npn = row.row_data?.['Agent NPN'];
        if (npn && !npnMap[npn]) {
          const firstName = row.row_data?.['First Name'] || '';
          const lastName = row.row_data?.['Last Name'] || '';
          npnMap[npn] = {
            agentName: `${firstName} ${lastName}`.trim(),
            agency: uploadAgencyMap[row.upload_id] || 'Unknown',
          };
        }
      });

      const mapped: MappedRow[] = [];
      const unmatchedMap: Record<string, UnmatchedNpn> = {};

      rows.forEach(row => {
        const npn = row['Agent NPN'] || '';
        if (!npn) return;

        if (npnMap[npn]) {
          mapped.push({
            contactId: row['Contact Id'] || '',
            firstName: row['First Name'] || '',
            lastName: row['Last Name'] || '',
            phone: row['Phone'] || '',
            email: row['Email'] || '',
            tags: '',
            created: row['Created'] || '',
            agentNpn: npn,
            agentName: npnMap[npn].agentName,
            agency: npnMap[npn].agency,
            selected: true,
            pushStatus: 'pending',
            rawData: row,
          });
        } else {
          if (!unmatchedMap[npn]) {
            unmatchedMap[npn] = { npn, clients: [] };
          }
          unmatchedMap[npn].clients.push({
            firstName: row['First Name'] || '',
            lastName: row['Last Name'] || '',
            phone: row['Phone'] || '',
          });
        }
      });

      setMappedRows(mapped);
      setUnmatchedNpns(Object.values(unmatchedMap));
      setCsvHeaders(headers);
      setStep('results');
    } catch (err) {
      setError('Failed to parse CSV file');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const applyTag = () => {
    if (!customTag.trim()) return;
    setMappedRows(prev => prev.map(row => ({
      ...row,
      tags: customTag.trim(),
    })));
    setTagApplied(true);
  };

  const removeTag = () => {
    if (!customTag.trim()) return;
    setMappedRows(prev => prev.map(row => ({
      ...row,
      tags: '',
    })));
    setTagApplied(false);
  };

  const toggleSelectAll = () => {
    const allSelected = mappedRows.every(r => r.selected);
    setMappedRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  const toggleRow = (idx: number) => {
    setMappedRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  const pushToZap = async () => {
    const selectedRows = mappedRows.filter(r => r.selected && r.pushStatus !== 'sent');
    if (selectedRows.length === 0) return;

    setPushing(true);
    setPushDone(false);
    cancelRef.current = false;
    setPushProgress({ sent: 0, failed: 0, total: selectedRows.length });

    let sent = 0;
    let failed = 0;

    for (const row of selectedRows) {
      if (cancelRef.current) break;

      const { Tags: _csvTags, ...csvFields } = row.rawData;
      const payload = {
        ...csvFields,
        tags: row.tags,
        agentName: row.agentName,
        agency: row.agency,
      };

      try {
        const res = await fetch(ZAPIER_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          sent++;
          setMappedRows(prev => prev.map(r => r.contactId === row.contactId ? { ...r, pushStatus: 'sent' } : r));
        } else {
          failed++;
          setMappedRows(prev => prev.map(r => r.contactId === row.contactId ? { ...r, pushStatus: 'failed' } : r));
        }
      } catch {
        failed++;
        setMappedRows(prev => prev.map(r => r.contactId === row.contactId ? { ...r, pushStatus: 'failed' } : r));
      }

      setPushProgress({ sent, failed, total: selectedRows.length });
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    setPushing(false);
    setPushDone(true);
  };

  const cancelPush = () => { cancelRef.current = true; };

  const retryFailed = async () => {
    const failedRows = mappedRows.filter(r => r.pushStatus === 'failed' && r.selected);
    if (failedRows.length === 0) return;

    setPushing(true);
    setPushDone(false);
    cancelRef.current = false;
    setPushProgress({ sent: 0, failed: 0, total: failedRows.length });

    let sent = 0;
    let failed = 0;

    for (const row of failedRows) {
      if (cancelRef.current) break;

      const { Tags: _csvTags, ...csvFields } = row.rawData;
      const payload = {
        ...csvFields,
        tags: row.tags,
        agentName: row.agentName,
        agency: row.agency,
      };

      try {
        const res = await fetch(ZAPIER_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          sent++;
          setMappedRows(prev => prev.map(r => r.contactId === row.contactId ? { ...r, pushStatus: 'sent' } : r));
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      setPushProgress({ sent, failed, total: failedRows.length });
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    setPushing(false);
    setPushDone(true);
  };

  const downloadMappedCsv = () => {
    const exportHeaders = [...csvHeaders.filter(h => h !== 'Tags'), 'Applied Tag', 'Agent Name', 'Agency'];
    const csvRows = mappedRows.map(r => {
      const values = csvHeaders.filter(h => h !== 'Tags').map(h => r.rawData[h] || '');
      values.push(r.tags, r.agentName, r.agency);
      return values.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',');
    });

    const blob = new Blob([exportHeaders.join(',') + '\n' + csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapped_contacts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadUnmatchedReport = () => {
    const csvHeaders = ['Agent NPN', 'Client Count', 'Clients'];
    const csvRows = unmatchedNpns.map(u => [
      u.npn,
      String(u.clients.length),
      u.clients.map(c => `${c.firstName} ${c.lastName}`).join('; '),
    ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','));

    const blob = new Blob([csvHeaders.join(',') + '\n' + csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unmatched_npns_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep('upload');
    setMappedRows([]);
    setUnmatchedNpns([]);
    setCsvHeaders([]);
    setCustomTag('');
    setTagApplied(false);
    setPushing(false);
    setPushDone(false);
    setPushProgress({ sent: 0, failed: 0, total: 0 });
    setError('');
  };

  const groupedByAgent: AgentGroup[] = React.useMemo(() => {
    const map: Record<string, AgentGroup> = {};
    mappedRows.forEach(row => {
      if (!map[row.agentNpn]) {
        map[row.agentNpn] = { npn: row.agentNpn, agentName: row.agentName, agency: row.agency, rows: [] };
      }
      map[row.agentNpn].rows.push(row);
    });
    return Object.values(map).sort((a, b) => b.rows.length - a.rows.length);
  }, [mappedRows]);

  const selectedCount = mappedRows.filter(r => r.selected).length;
  const sentCount = mappedRows.filter(r => r.pushStatus === 'sent').length;
  const failedCount = mappedRows.filter(r => r.pushStatus === 'failed').length;

  if (step === 'upload') {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-foreground">GHL Contact Import</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a GHL contact export CSV to map contacts to agents and agencies, apply tags, and push to Zapier.
          </p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/60 hover:bg-primary/5 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-primary/80 animate-spin" />
              <p className="text-sm text-muted-foreground font-medium">Processing CSV and resolving NPNs...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/20 flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary/80" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Drop GHL export CSV here or click to browse</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Expected columns: Contact Id, First Name, Last Name, Phone, Email, Tags, Agent NPN</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Import Results</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {mappedRows.length} matched contacts across {groupedByAgent.length} agents
            {unmatchedNpns.length > 0 && <span className="text-amber-600 ml-2">({unmatchedNpns.reduce((s, u) => s + u.clients.length, 0)} unmatched)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> New Import
          </button>
          <button onClick={downloadMappedCsv} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Tag Assignment */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Tag className="w-4 h-4 text-primary/80" />
          <span className="text-sm font-medium text-foreground/80">Tag Assignment</span>
          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              placeholder="Enter tag to apply (e.g. cancelled policy | launch)"
              disabled={tagApplied}
              className="flex-1 px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-primary/60 disabled:bg-muted disabled:text-muted-foreground/70"
            />
            {!tagApplied ? (
              <button
                onClick={applyTag}
                disabled={!customTag.trim()}
                className="px-4 py-2 text-sm font-medium gradient-primary text-background rounded-lg hover:opacity-90 disabled:opacity-40 transition-colors"
              >
                Apply to All
              </button>
            ) : (
              <button
                onClick={removeTag}
                className="px-4 py-2 text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Remove Tag
              </button>
            )}
          </div>
        </div>
        {tagApplied && (
          <div className="mt-2 ml-7">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/5 text-primary border border-primary/30 rounded text-xs font-medium">
              <Tag className="w-3 h-3" /> {customTag}
            </span>
          </div>
        )}
      </div>

      {/* Push Controls */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSelectAll}
              className="text-xs text-primary hover:text-primary/80 font-medium"
            >
              {mappedRows.every(r => r.selected) ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
            {sentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> {sentCount} sent
              </span>
            )}
            {failedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-red-400">
                <XCircle className="w-3 h-3" /> {failedCount} failed
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {failedCount > 0 && !pushing && (
              <button
                onClick={retryFailed}
                className="px-3 py-2 text-sm font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-600/10 transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry Failed
              </button>
            )}
            {pushing ? (
              <button
                onClick={cancelPush}
                className="px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={pushToZap}
                disabled={selectedCount === 0 || (sentCount === mappedRows.length)}
                className="px-4 py-2 text-sm font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Push to Zap
              </button>
            )}
          </div>
        </div>

        {pushing && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Sending {pushProgress.sent + pushProgress.failed} / {pushProgress.total}...</span>
              <span>{Math.round(((pushProgress.sent + pushProgress.failed) / pushProgress.total) * 100)}%</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500/100 transition-all duration-200"
                style={{ width: `${((pushProgress.sent + pushProgress.failed) / pushProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {pushDone && !pushing && (
          <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <p className="text-sm text-emerald-400 font-medium">
              Push complete: {pushProgress.sent} sent, {pushProgress.failed} failed
            </p>
          </div>
        )}
      </div>

      {/* Grouped Results */}
      <div className="space-y-4">
        {groupedByAgent.map(group => (
          <div key={group.npn} className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{group.agentName}</span>
                <span className="text-xs text-muted-foreground">NPN: {group.npn}</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-primary/5 text-primary border border-primary/30 rounded">
                  {group.agency}
                </span>
              </div>
              <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                {group.rows.length} contacts
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="pl-4 pr-2 py-2 w-8 sticky left-0 bg-card"></th>
                    {csvHeaders.filter(h => h !== 'Tags').map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">Applied Tag</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">Agent Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">Agency</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map(row => {
                    const globalIdx = mappedRows.findIndex(r => r.contactId === row.contactId);
                    return (
                      <tr key={row.contactId} className="border-b border-border/30 hover:bg-muted/50">
                        <td className="pl-4 pr-2 py-2 sticky left-0 bg-card">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => toggleRow(globalIdx)}
                            className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-ring"
                          />
                        </td>
                        {csvHeaders.filter(h => h !== 'Tags').map(h => (
                          <td key={h} className="px-3 py-2 text-muted-foreground whitespace-nowrap truncate max-w-[200px]">
                            {row.rawData[h] || '--'}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {row.tags ? (
                            <span className="text-xs text-primary bg-primary/5 px-1.5 py-0.5 rounded">{row.tags}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground/70">--</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-foreground/80 font-medium whitespace-nowrap">{row.agentName}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{row.agency}</td>
                        <td className="px-3 py-2">
                          {row.pushStatus === 'sent' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                          {row.pushStatus === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Unmatched NPNs Audit */}
      {unmatchedNpns.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-400">Unmatched NPNs</span>
              <span className="text-xs text-amber-600">
                {unmatchedNpns.length} NPNs ({unmatchedNpns.reduce((s, u) => s + u.clients.length, 0)} contacts not in any roster)
              </span>
            </div>
            <button onClick={downloadUnmatchedReport} className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-card border border-amber-400/30 rounded-lg hover:bg-amber-600/10 transition-colors flex items-center gap-1">
              <Download className="w-3 h-3" /> Export
            </button>
          </div>
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {unmatchedNpns.map(u => (
              <div key={u.npn} className="bg-card border border-amber-400/15 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono font-medium text-amber-400 bg-amber-500/100/10 px-2 py-0.5 rounded">NPN: {u.npn}</span>
                  <span className="text-xs text-amber-600">{u.clients.length} contact{u.clients.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {u.clients.map((c, i) => (
                    <span key={i} className="text-xs text-foreground/80 bg-muted px-2 py-0.5 rounded">
                      {c.firstName} {c.lastName}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};