/**
 * @crm-protected
 * DO NOT MODIFY without Charlie's explicit approval.
 * This file is part of CRM Ops (OpenClaw Dashboard).
 * Table references use hierarchy_agencies (NOT crm_agencies).
 * Any rename or schema change to hierarchy_agencies requires updating this file.
 * See: docs/CRM_OPS_FILES.md for the full protected file list.
 */
import React, { useState } from 'react';
import {
  Link2,
  Wifi,
  WifiOff,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/crm/portal-client';
import type { AgencyGhlConfig } from '@/lib/crm/types';

interface AgencyGhlTabProps {
  agencyId: string;
  config: AgencyGhlConfig | null;
  onConfigUpdated: (config: AgencyGhlConfig | null) => void;
}

const STATUS_DISPLAY: Record<string, { label: string; icon: React.FC<{ className?: string }>; color: string; bg: string }> = {
  connected: { label: 'Connected', icon: Wifi, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  error: { label: 'Error', icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-500/10 border-red-500/20' },
  disconnected: { label: 'Disconnected', icon: WifiOff, color: 'text-muted-foreground', bg: 'bg-muted border-border' },
};

export const AgencyGhlTab: React.FC<AgencyGhlTabProps> = ({ agencyId, config, onConfigUpdated }) => {
  const [apiKey, setApiKey] = useState(config?.ghl_api_key || '');
  const [locationId, setLocationId] = useState(config?.ghl_location_id || '');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const maskedKey = apiKey ? `${'*'.repeat(Math.max(0, apiKey.length - 4))}${apiKey.slice(-4)}` : '';

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);

    if (config) {
      const { data, error } = await supabase
        .from('agency_ghl_configs')
        .update({
          ghl_api_key: apiKey.trim(),
          ghl_location_id: locationId.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id)
        .select()
        .maybeSingle();

      if (!error && data) onConfigUpdated(data);
    } else {
      const { data, error } = await supabase
        .from('agency_ghl_configs')
        .insert({
          agency_id: agencyId,
          ghl_api_key: apiKey.trim(),
          ghl_location_id: locationId.trim(),
          connection_status: 'disconnected',
        })
        .select()
        .maybeSingle();

      if (!error && data) onConfigUpdated(data);
    }

    setSaving(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/sync-ghl-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agency_id: agencyId, test_only: true }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        setTestResult({ ok: true, message: 'Connection successful' });

        if (config) {
          const { data } = await supabase
            .from('agency_ghl_configs')
            .update({ connection_status: 'connected', last_error: null, updated_at: new Date().toISOString() })
            .eq('id', config.id)
            .select()
            .maybeSingle();
          if (data) onConfigUpdated(data);
        }
      } else {
        setTestResult({ ok: false, message: result.error || 'Connection failed' });

        if (config) {
          const { data } = await supabase
            .from('agency_ghl_configs')
            .update({ connection_status: 'error', last_error: result.error || 'Test failed', updated_at: new Date().toISOString() })
            .eq('id', config.id)
            .select()
            .maybeSingle();
          if (data) onConfigUpdated(data);
        }
      }
    } catch {
      setTestResult({ ok: false, message: 'Failed to reach sync endpoint. Make sure the edge function is deployed.' });
    }

    setTesting(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      };

      let complete = false;
      let isFirst = true;

      while (!complete) {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-ghl-data`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ agency_id: agencyId, reset_sync: isFirst }),
        });
        isFirst = false;

        if (!res.ok) break;
        const result = await res.json();
        if (!result.success) break;

        setSyncProgress({
          fetched: result.fetched_so_far || 0,
          total: result.total_expected || 0,
        });

        complete = result.complete;
        if (!complete) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      const { data } = await supabase
        .from('agency_ghl_configs')
        .select('*')
        .eq('agency_id', agencyId)
        .maybeSingle();
      if (data) onConfigUpdated(data);
    } catch {
      // sync failed silently
    }

    setSyncing(false);
    setSyncProgress(null);
  };

  const status = config?.connection_status || 'disconnected';
  const statusInfo = STATUS_DISPLAY[status] || STATUS_DISPLAY.disconnected;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-5 ${statusInfo.bg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
            <div>
              <p className={`text-sm font-semibold ${statusInfo.color}`}>GHL {statusInfo.label}</p>
              {config?.last_sync_at && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last sync: {new Date(config.last_sync_at).toLocaleString()}
                </p>
              )}
              {config?.connection_status === 'connected' && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Auto-syncs daily at 9am, 12pm, and 6pm EST
                </p>
              )}
            </div>
          </div>
          {config?.connection_status === 'connected' && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary bg-card border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing
                ? syncProgress
                  ? `${syncProgress.fetched.toLocaleString()}${syncProgress.total ? ` / ${syncProgress.total.toLocaleString()}` : ''}`
                  : 'Starting...'
                : 'Sync Now'}
            </button>
          )}
        </div>
        {config?.last_error && status === 'error' && (
          <div className="mt-3 p-3 bg-red-100/50 rounded-lg">
            <p className="text-xs text-red-700">{config.last_error}</p>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">GHL API Credentials</h3>
            <p className="text-xs text-muted-foreground">Connect this agency to GoHighLevel</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter GHL API key"
                className="w-full px-4 py-2.5 pr-10 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-muted-foreground"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {apiKey && !showKey && (
              <p className="mt-1 text-xs text-muted-foreground/70 font-mono">{maskedKey}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Location ID</label>
            <input
              type="text"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="Enter GHL Location ID"
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring text-sm font-mono"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim() || !locationId.trim()}
              className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Credentials'}
            </button>
            <button
              onClick={handleTestConnection}
              disabled={testing || !config}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-cyan-500/10 border border-primary/20 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4" />
                  Test Connection
                </>
              )}
            </button>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <p className="text-sm">{testResult.message}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-sm font-semibold text-foreground/80 mb-3">How it works</h3>
        <div className="space-y-3">
          <StepInfo step={1} text="Enter your GHL API key and Location ID above" />
          <StepInfo step={2} text="Click 'Test Connection' to verify the credentials work" />
          <StepInfo step={3} text="Once connected, click 'Sync Now' to pull deal data from GHL" />
          <StepInfo step={4} text="Deal data will appear in the Deals tab and on the Dashboard" />
        </div>
      </div>
    </div>
  );
};

const StepInfo: React.FC<{ step: number; text: string }> = ({ step, text }) => (
  <div className="flex items-start gap-3">
    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
      <span className="text-xs font-bold text-muted-foreground">{step}</span>
    </div>
    <p className="text-sm text-muted-foreground">{text}</p>
  </div>
);
