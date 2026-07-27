import { motion } from 'framer-motion';
import { Database, Palette, Bell } from 'lucide-react';
import { useSettingsStore, useLoadMockData, useClearMockData } from '@/stores/cc-stores';

export function CcSettingsTab() {
  const mockDataEnabled = useSettingsStore((s) => s.mockDataEnabled);
  const loadMockData = useLoadMockData();
  const clearMockData = useClearMockData();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center"><Database className="w-4 h-4 text-amber-400" /></div>
          <div><h2 className="text-sm font-semibold">Mock Data</h2><p className="text-xs text-muted-foreground">Control demonstration data for the command center</p></div>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
          <div>
            <p className="text-sm font-medium">Mock Data</p>
            <p className="text-xs text-muted-foreground mt-0.5">{mockDataEnabled ? 'Simulated data is currently active across all views' : 'No demonstration data loaded. Views will be empty.'}</p>
          </div>
          <button onClick={mockDataEnabled ? clearMockData : loadMockData} className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${mockDataEnabled ? 'bg-red-400/10 text-red-400 border border-red-400/20 hover:bg-red-400/20' : 'gradient-primary text-background hover:opacity-90'}`}>
            {mockDataEnabled ? 'Disable Mock Data' : 'Enable Mock Data'}
          </button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-sky-400/10 flex items-center justify-center"><Palette className="w-4 h-4 text-sky-400" /></div>
          <div><h2 className="text-sm font-semibold">Appearance</h2><p className="text-xs text-muted-foreground">Visual preferences for the command center</p></div>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
          <div><p className="text-sm font-medium">Theme</p><p className="text-xs text-muted-foreground mt-0.5">Dark mode is optimized for extended use</p></div>
          <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium">Dark</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-emerald-400/10 flex items-center justify-center"><Bell className="w-4 h-4 text-emerald-400" /></div>
          <div><h2 className="text-sm font-semibold">Notifications</h2><p className="text-xs text-muted-foreground">Configure alert preferences</p></div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
            <div><p className="text-sm font-medium">ClawdBot Alerts</p><p className="text-xs text-muted-foreground mt-0.5">AI-generated priority notifications</p></div>
            <span className="px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-400 text-xs font-medium">Enabled</span>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/30">
            <div><p className="text-sm font-medium">Pipeline Alerts</p><p className="text-xs text-muted-foreground mt-0.5">Critical pipeline status changes</p></div>
            <span className="px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-400 text-xs font-medium">Enabled</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
