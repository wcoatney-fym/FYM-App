import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Palette, RefreshCw, Loader2, CheckCircle2, XCircle, Timer, Save } from 'lucide-react';
import { useTeamStore, useTasksStore } from '@/stores/cc-stores';
import { supabaseConfigured } from '@/lib/supabase';
import { portalConfigured } from '@/lib/crm/portal-client';
import { supabaseConfigured as trackerConfigured } from '@/lib/command-center/tracker-supabase';
import { fetchLostSettings, updateLostSetting, triggerCheckLost } from '@/lib/recruiting/api';

function LostSettingsPanel() {
  const [thresholdDays, setThresholdDays] = useState('60');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ flagged: number; thresholdDays: number } | null>(null);

  useEffect(() => {
    void (async () => {
      const settings = await fetchLostSettings();
      const threshold = settings.find((s) => s.setting_key === 'default_threshold_days');
      if (threshold) setThresholdDays(threshold.setting_value);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const ok = await updateLostSetting('default_threshold_days', thresholdDays);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    setCheckResult(null);
    const result = await triggerCheckLost();
    setCheckResult(result);
    setChecking(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-red-400/10 flex items-center justify-center">
          <Timer className="w-4 h-4 text-red-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Lost Parameters</h2>
          <p className="text-xs text-muted-foreground">Configure when recruiting contacts are auto-flagged as Lost. Re-entry happens automatically when stage movement resumes.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
          <div>
            <p className="text-sm font-medium">Default Threshold</p>
            <p className="text-xs text-muted-foreground mt-0.5">Days at any stage before auto-flagging as Lost</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="365"
              value={thresholdDays}
              onChange={(e) => setThresholdDays(e.target.value)}
              className="w-20 px-3 py-1.5 rounded-lg bg-background border border-border/50 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Threshold'}
          </button>
          <button
            onClick={() => void handleCheckNow()}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 border border-border/30 text-sm font-medium hover:bg-secondary/70 transition-colors disabled:opacity-50"
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {checking ? 'Checking…' : 'Run Check Now'}
          </button>
        </div>

        {checkResult && (
          <div className={`p-3 rounded-lg text-xs ${checkResult.flagged > 0 ? 'bg-amber-400/10 text-amber-400' : 'bg-emerald-400/10 text-emerald-400'}`}>
            {checkResult.flagged > 0
              ? `${checkResult.flagged} contact${checkResult.flagged === 1 ? '' : 's'} flagged as Lost (${checkResult.thresholdDays}+ days stale)`
              : `No stale contacts found (threshold: ${checkResult.thresholdDays} days)`}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatusRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
      <p className="text-sm font-medium">{label}</p>
      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${connected ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'}`}>
        {connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {connected ? 'Connected' : 'Not connected'}
      </span>
    </div>
  );
}

export function CcSettingsTab() {
  const members = useTeamStore((s) => s.members);
  const loadLiveTeam = useTeamStore((s) => s.loadLive);
  const tasks = useTasksStore((s) => s.tasks);
  const loadLiveTasks = useTasksStore((s) => s.loadLive);

  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadLiveTeam(), loadLiveTasks()]);
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-sky-400/10 flex items-center justify-center"><Database className="w-4 h-4 text-sky-400" /></div>
          <div><h2 className="text-sm font-semibold">Data Connections</h2><p className="text-xs text-muted-foreground">Live status of all data sources feeding the Command Center</p></div>
        </div>
        <div className="space-y-3">
          <StatusRow label="FYM App DB (rcbzag)" connected={supabaseConfigured} />
          <StatusRow label="Portal DB (akhojh)" connected={portalConfigured} />
          <StatusRow label="Tracker DB" connected={trackerConfigured} />
          <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
            <p className="text-sm font-medium">Team members loaded</p>
            <span className="text-sm font-semibold text-foreground">{members.length}</span>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
            <p className="text-sm font-medium">Tasks loaded</p>
            <span className="text-sm font-semibold text-foreground">{tasks.length}</span>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
            <p className="text-sm font-medium">Last data refresh</p>
            <span className="text-xs text-muted-foreground">{lastRefresh ? lastRefresh.toLocaleTimeString() : 'Not refreshed this session'}</span>
          </div>
        </div>
        <button
          onClick={() => void handleRefreshAll()}
          disabled={refreshing}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {refreshing ? 'Refreshing…' : 'Refresh All Data'}
        </button>
      </motion.div>

      {/* Lost Parameters */}
      <LostSettingsPanel />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-sky-400/10 flex items-center justify-center"><Palette className="w-4 h-4 text-sky-400" /></div>
          <div><h2 className="text-sm font-semibold">Appearance</h2><p className="text-xs text-muted-foreground">Visual preferences for the command center</p></div>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
          <div><p className="text-sm font-medium">Theme</p><p className="text-xs text-muted-foreground mt-0.5">Dark mode is optimized for extended use</p></div>
          <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium">Dark</span>
        </div>
      </motion.div>
    </div>
  );
}
