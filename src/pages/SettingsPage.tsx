import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';

export function SettingsPage() {
  const { useMockData, toggleMockData } = useAppStore();
  const [url, setUrl] = useState(localStorage.getItem('fym_supabase_url') || '');
  const [key, setKey] = useState(localStorage.getItem('fym_supabase_anon_key') || '');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    localStorage.setItem('fym_supabase_url', url);
    localStorage.setItem('fym_supabase_anon_key', key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <Header title="Settings" />
      <div className="p-6 max-w-2xl space-y-6">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">Data Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-slate-700">Mock Data Mode</Label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Use built-in sample data instead of live Supabase queries
                </p>
              </div>
              <Switch checked={useMockData} onCheckedChange={toggleMockData} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">Supabase Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sb-url" className="text-sm font-medium text-slate-700">
                Supabase URL
              </Label>
              <Input
                id="sb-url"
                placeholder="https://your-project.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-white font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-key" className="text-sm font-medium text-slate-700">
                Anon Key
              </Label>
              <Input
                id="sb-key"
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="bg-white font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} className="bg-[#1e3a5f] hover:bg-[#162d4a]">
                Save Connection
              </Button>
              {saved && (
                <span className="text-sm text-emerald-600 font-medium animate-in fade-in">
                  Saved successfully
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Credentials are stored in localStorage. They override .env values when set.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
