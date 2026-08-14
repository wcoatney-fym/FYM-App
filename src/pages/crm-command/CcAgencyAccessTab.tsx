/**
 * CRM Command → Agency Access tab
 *
 * Lists every agency in FYM's hierarchy with two per-agency feature toggles:
 *   1. GHL Manager Pipeline — toggle on → popup for API key + Location ID
 *   2. GHL Production Push  — toggle only (placeholder, no functionality yet)
 *
 * Data sources:
 *   - hierarchy_agencies (portal DB akhojh) — agency list
 *   - agency_ghl_configs (portal DB akhojh) — GHL creds + toggle state
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Building2,
  Wifi,
  WifiOff,
  AlertTriangle,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase, ensurePortalAuth } from '@/lib/crm/portal-client';

/* ── Types ─────────────────────────────────────────────────────────── */

interface Agency {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
  agency_type: 'main' | 'sub';
  parent_agency_id: string | null;
  crm_enabled: boolean;
}

interface GhlConfig {
  id: string;
  agency_id: string;
  ghl_api_key: string;
  ghl_location_id: string;
  connection_status: 'connected' | 'error' | 'disconnected';
  last_error: string | null;
  manager_pipeline_enabled: boolean;
  production_push_enabled: boolean;
  created_at: string;
  updated_at: string;
}

type SortField = 'name' | 'manager_pipeline' | 'production_push' | 'status';
type SortDir = 'asc' | 'desc';

/* ── Component ─────────────────────────────────────────────────────── */

export const CcAgencyAccessTab: React.FC = () => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [configs, setConfigs] = useState<Map<string, GhlConfig>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Modal state for GHL Manager Pipeline credential entry
  const [modalAgency, setModalAgency] = useState<Agency | null>(null);
  const [modalApiKey, setModalApiKey] = useState('');
  const [modalLocationId, setModalLocationId] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  // syncProgress is set during Save & Sync and displayed in the modal
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  /* ── Data loading ──────────────────────────────────────────────── */

  const loadData = useCallback(async () => {
    setLoading(true);
    await ensurePortalAuth();

    const [agencyRes, configRes] = await Promise.all([
      supabase
        .from('hierarchy_agencies')
        .select('id, name, slug, is_active, agency_type, parent_agency_id, crm_enabled')
        .order('name'),
      supabase
        .from('agency_ghl_configs')
        .select('id, agency_id, ghl_api_key, ghl_location_id, connection_status, last_error, manager_pipeline_enabled, production_push_enabled, created_at, updated_at'),
    ]);

    setAgencies(agencyRes.data || []);

    const cfgMap = new Map<string, GhlConfig>();
    for (const c of (configRes.data || []) as GhlConfig[]) {
      cfgMap.set(c.agency_id, c);
    }
    setConfigs(cfgMap);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Toggle handlers ───────────────────────────────────────────── */

  const handleManagerPipelineToggle = async (agency: Agency) => {
    const cfg = configs.get(agency.id);
    const currentlyEnabled = cfg?.manager_pipeline_enabled ?? false;

    if (!currentlyEnabled) {
      // Turning ON → open modal for API key + Location ID
      setModalAgency(agency);
      setModalApiKey(cfg?.ghl_api_key || '');
      setModalLocationId(cfg?.ghl_location_id || '');
      setShowKey(false);
      setModalTestResult(null);
      return;
    }

    // Turning OFF → just flip the toggle
    setTogglingId(agency.id);
    if (cfg) {
      const { data } = await supabase
        .from('agency_ghl_configs')
        .update({ manager_pipeline_enabled: false, updated_at: new Date().toISOString() })
        .eq('id', cfg.id)
        .select()
        .maybeSingle();
      if (data) {
        setConfigs(prev => {
          const next = new Map(prev);
          next.set(agency.id, data as GhlConfig);
          return next;
        });
      }
    }
    setTogglingId(null);
  };

  const handleProductionPushToggle = async (agency: Agency) => {
    const cfg = configs.get(agency.id);
    const next = !(cfg?.production_push_enabled ?? false);

    setTogglingId(agency.id);
    if (cfg) {
      const { data } = await supabase
        .from('agency_ghl_configs')
        .update({ production_push_enabled: next, updated_at: new Date().toISOString() })
        .eq('id', cfg.id)
        .select()
        .maybeSingle();
      if (data) {
        setConfigs(prev => {
          const m = new Map(prev);
          m.set(agency.id, data as GhlConfig);
          return m;
        });
      }
    } else {
      // No config row yet — create one with just the production push toggle
      const { data } = await supabase
        .from('agency_ghl_configs')
        .insert({
          agency_id: agency.id,
          ghl_api_key: '',
          ghl_location_id: '',
          connection_status: 'disconnected',
          production_push_enabled: next,
          manager_pipeline_enabled: false,
        })
        .select()
        .maybeSingle();
      if (data) {
        setConfigs(prev => {
          const m = new Map(prev);
          m.set(agency.id, data as GhlConfig);
          return m;
        });
      }
    }
    setTogglingId(null);
  };

  /* ── Modal Save & Sync (Manager Pipeline) ───────────────────────── */

  const handleModalSaveAndSync = async () => {
    if (!modalAgency || !modalApiKey.trim() || !modalLocationId.trim()) return;
    setModalSaving(true);
    setSyncProgress(null);
    setModalTestResult(null);

    const cfg = configs.get(modalAgency.id);
    let savedConfig: GhlConfig | null = null;

    // Step 1: Save credentials + enable toggle
    if (cfg) {
      const { data } = await supabase
        .from('agency_ghl_configs')
        .update({
          ghl_api_key: modalApiKey.trim(),
          ghl_location_id: modalLocationId.trim(),
          manager_pipeline_enabled: true,
          connection_status: 'connected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', cfg.id)
        .select()
        .maybeSingle();
      savedConfig = data as GhlConfig | null;
    } else {
      const { data } = await supabase
        .from('agency_ghl_configs')
        .insert({
          agency_id: modalAgency.id,
          ghl_api_key: modalApiKey.trim(),
          ghl_location_id: modalLocationId.trim(),
          connection_status: 'connected',
          manager_pipeline_enabled: true,
          production_push_enabled: false,
        })
        .select()
        .maybeSingle();
      savedConfig = data as GhlConfig | null;
    }

    if (savedConfig) {
      setConfigs(prev => {
        const m = new Map(prev);
        m.set(modalAgency!.id, savedConfig!);
        return m;
      });
    }

    // Step 2: One-time import from GHL → App (atomic with save)
    try {
      setSyncProgress('Importing pipeline from GHL…');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/atrisk-ghl-push`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'import',
          agency_id: modalAgency.id,
          api_key: modalApiKey.trim(),
          location_id: modalLocationId.trim(),
        }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setSyncProgress(`Imported ${result.imported || 0} of ${result.total || 0} items`);
        setModalTestResult({
          ok: true,
          message: `Saved & synced — ${result.imported || 0} pipeline items imported from GHL${result.skipped ? ` (${result.skipped} skipped)` : ''}`,
        });
      } else {
        setModalTestResult({
          ok: false,
          message: `Credentials saved but sync failed: ${result.error || 'Unknown error'}. You can retry later.`,
        });
      }
    } catch {
      setModalTestResult({
        ok: false,
        message: 'Credentials saved but sync failed to reach the server. You can retry later.',
      });
    }

    setModalSaving(false);
  };

  const handleTestConnection = async () => {
    if (!modalAgency) return;
    setModalTesting(true);
    setModalTestResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/sync-ghl-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agency_id: modalAgency.id, test_only: true }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setModalTestResult({ ok: true, message: 'Connection successful' });
      } else {
        setModalTestResult({ ok: false, message: result.error || 'Connection failed' });
      }
    } catch {
      setModalTestResult({ ok: false, message: 'Failed to reach sync endpoint' });
    }

    setModalTesting(false);
  };

  /* ── Sorting + filtering ───────────────────────────────────────── */

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const filtered = agencies
    .filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'manager_pipeline':
          return dir * (Number(configs.get(a.id)?.manager_pipeline_enabled ?? 0) - Number(configs.get(b.id)?.manager_pipeline_enabled ?? 0));
        case 'production_push':
          return dir * (Number(configs.get(a.id)?.production_push_enabled ?? 0) - Number(configs.get(b.id)?.production_push_enabled ?? 0));
        case 'status': {
          const sa = configs.get(a.id)?.connection_status || 'disconnected';
          const sb = configs.get(b.id)?.connection_status || 'disconnected';
          return dir * sa.localeCompare(sb);
        }
        default:
          return 0;
      }
    });

  const enabledManagerCount = Array.from(configs.values()).filter(c => c.manager_pipeline_enabled).length;
  const enabledProductionCount = Array.from(configs.values()).filter(c => c.production_push_enabled).length;
  const connectedCount = Array.from(configs.values()).filter(c => c.connection_status === 'connected').length;

  /* ── Render ────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 animate-spin text-primary mr-2" />
        <span className="text-sm text-muted-foreground">Loading agencies…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI summary strip */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Total Agencies" value={agencies.length} />
        <KpiCard label="Manager Pipeline On" value={enabledManagerCount} accent="text-emerald-400" />
        <KpiCard label="Production Push On" value={enabledProductionCount} accent="text-cyan-400" />
        <KpiCard label="Connected" value={connectedCount} accent="text-primary" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search agencies…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-card border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th
                  className="text-left px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('name')}
                >
                  <span className="inline-flex items-center gap-1">Agency <SortIcon field="name" /></span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-16">Type</th>
                <th
                  className="text-center px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('manager_pipeline')}
                >
                  <span className="inline-flex items-center gap-1 justify-center">GHL Manager Pipeline <SortIcon field="manager_pipeline" /></span>
                </th>
                <th
                  className="text-center px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('production_push')}
                >
                  <span className="inline-flex items-center gap-1 justify-center">GHL Production Push <SortIcon field="production_push" /></span>
                </th>
                <th
                  className="text-center px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('status')}
                >
                  <span className="inline-flex items-center gap-1 justify-center">Status <SortIcon field="status" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(agency => {
                const cfg = configs.get(agency.id);
                const managerOn = cfg?.manager_pipeline_enabled ?? false;
                const productionOn = cfg?.production_push_enabled ?? false;
                const status = cfg?.connection_status || 'disconnected';
                const isToggling = togglingId === agency.id;

                return (
                  <tr key={agency.id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
                    {/* Agency name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-foreground">{agency.name}</span>
                      </div>
                    </td>

                    {/* Type badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full ${
                        agency.agency_type === 'main'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {agency.agency_type}
                      </span>
                    </td>

                    {/* GHL Manager Pipeline toggle */}
                    <td className="px-4 py-3 text-center">
                      <Toggle
                        enabled={managerOn}
                        loading={isToggling}
                        accent="emerald"
                        onClick={() => handleManagerPipelineToggle(agency)}
                      />
                    </td>

                    {/* GHL Production Push toggle */}
                    <td className="px-4 py-3 text-center">
                      <Toggle
                        enabled={productionOn}
                        loading={isToggling}
                        accent="cyan"
                        onClick={() => handleProductionPushToggle(agency)}
                      />
                    </td>

                    {/* Connection status */}
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={status} />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {search ? 'No agencies match your search' : 'No agencies found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manager Pipeline credential modal */}
      {modalAgency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-foreground">GHL Manager Pipeline</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{modalAgency.name}</p>
              </div>
              <button onClick={() => setModalAgency(null)} className="p-1 rounded-lg hover:bg-secondary/50">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={modalApiKey}
                    onChange={e => setModalApiKey(e.target.value)}
                    placeholder="Enter GHL API key"
                    className="w-full px-4 py-2.5 pr-10 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm font-mono bg-background"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Location ID */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">Location ID</label>
                <input
                  type="text"
                  value={modalLocationId}
                  onChange={e => setModalLocationId(e.target.value)}
                  placeholder="Enter GHL Location ID"
                  className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm font-mono bg-background"
                />
              </div>

              {/* Sync progress */}
              {syncProgress && !modalTestResult && (
                <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-primary/10 text-primary">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {syncProgress}
                </div>
              )}

              {/* Test / sync result */}
              {modalTestResult && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                  modalTestResult.ok
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {modalTestResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {modalTestResult.message}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleModalSaveAndSync}
                  disabled={modalSaving || !modalApiKey.trim() || !modalLocationId.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {modalSaving ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Saving & Syncing…</>
                  ) : (
                    'Save & Sync'
                  )}
                </button>
                <button
                  onClick={handleTestConnection}
                  disabled={modalTesting || modalSaving || !modalApiKey.trim() || !modalLocationId.trim()}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  {modalTesting ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Testing…</>
                  ) : (
                    <><Wifi className="w-4 h-4" /> Test</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Sub-components ───────────────────────────────────────────────── */

const KpiCard: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
  <div className="bg-card border border-border rounded-xl p-4">
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className={`text-2xl font-bold ${accent || 'text-foreground'}`}>{value}</p>
  </div>
);

const Toggle: React.FC<{ enabled: boolean; loading: boolean; accent: 'emerald' | 'cyan'; onClick: () => void }> = ({
  enabled,
  loading,
  accent,
  onClick,
}) => {
  const bg = enabled
    ? accent === 'emerald' ? 'bg-emerald-500' : 'bg-cyan-500'
    : 'bg-secondary';

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 ${bg}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'connected':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-emerald-500/10 text-emerald-400">
          <Wifi className="w-3 h-3" /> Connected
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-red-500/10 text-red-400">
          <AlertTriangle className="w-3 h-3" /> Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full bg-muted text-muted-foreground">
          <WifiOff className="w-3 h-3" /> —
        </span>
      );
  }
};
