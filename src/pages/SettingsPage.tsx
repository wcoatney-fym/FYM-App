import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export function SettingsPage() {
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
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Supabase Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sb-url" className="text-sm font-medium text-foreground/80">
                Supabase URL
              </Label>
              <Input
                id="sb-url"
                placeholder="https://your-project.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-card font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-key" className="text-sm font-medium text-foreground/80">
                Anon Key
              </Label>
              <Input
                id="sb-key"
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="bg-card font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} className="bg-primary hover:bg-primary/80">
                Save Connection
              </Button>
              {saved && (
                <span className="text-sm text-emerald-400 font-medium animate-in fade-in">
                  Saved successfully
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70">
              Credentials are stored in localStorage. They override .env values when set.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
