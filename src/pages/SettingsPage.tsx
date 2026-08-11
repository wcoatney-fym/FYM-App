import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StaggerContainer, StaggerItem } from '@/components/ui/animated';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAsStore } from '@/store/view-as-store';
import type { UserRole } from '@/contexts/AuthContext';
import { Eye, ShieldPlus, Trash2, UserPlus, CheckCircle2, AlertCircle, Users, Settings, KeyRound, Copy, RefreshCw, Search, Zap, Eye as EyeIcon, EyeOff } from 'lucide-react';
import { CoachingThresholdsCard } from '@/components/settings/CoachingThresholdsCard';

interface ProfileOption {
  id: string;
  full_name: string | null;
  role: UserRole;
}

interface FymAdminRow {
  fym_admin_id: string;
  user_id: string;
  added_by: string | null;
  added_by_name: string | null;
  created_at: string;
  full_name: string | null;
}

interface AgencyOption {
  id: string;
  name: string;
}

interface AgencyCredential {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
  app_login_email: string | null;
  app_login_password: string | null;
}

interface AgentOption {
  id: string;
  full_name: string | null;
  writing_number: string | null;
}

export function SettingsPage() {
  const [url, setUrl] = useState(localStorage.getItem('fym_supabase_url') || '');
  const [key, setKey] = useState(localStorage.getItem('fym_supabase_anon_key') || '');
  const [saved, setSaved] = useState(false);
  const { isFymAdmin, user } = useAuth();

  function handleSave() {
    localStorage.setItem('fym_supabase_url', url);
    localStorage.setItem('fym_supabase_anon_key', key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <Header title="Settings" />
      <div className="p-6 max-w-3xl">
        <p className="text-sm text-muted-foreground mb-6">
          Manage connections, admin access, and impersonation controls.
        </p>
        <StaggerContainer className="space-y-6">
        {isFymAdmin && (
          <StaggerItem><Card className="border-border">
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
              <p className="text-xs text-muted-foreground">
                Credentials are stored in localStorage. They override .env values when set.
              </p>
              {(url || key) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    localStorage.removeItem('fym_supabase_url');
                    localStorage.removeItem('fym_supabase_anon_key');
                    setUrl('');
                    setKey('');
                    setSaved(false);
                  }}
                  className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10 h-7 px-2 text-xs"
                >
                  Clear overrides &amp; use .env defaults
                </Button>
              )}
            </CardContent>
          </Card></StaggerItem>
        )}

        {isFymAdmin && <StaggerItem><FymAdminManagementCard currentUserId={user?.id ?? null} /></StaggerItem>}
        {isFymAdmin && <StaggerItem><AgencyCredentialsCard /></StaggerItem>}
        {isFymAdmin && <StaggerItem><CoachingThresholdsCard /></StaggerItem>}
        {isFymAdmin && <StaggerItem><ViewAsCard /></StaggerItem>}

        {!isFymAdmin && (
          <StaggerItem>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center mb-4">
                <Settings size={24} className="text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground/70">No settings available for your role</p>
              <p className="text-xs text-muted-foreground mt-1">Contact an FYM admin if you need access changes.</p>
            </div>
          </StaggerItem>
        )}
        </StaggerContainer>
      </div>
    </div>
  );
}

// ── Agency App Credentials ──────────────────────────────────────────────────

function AgencyCredentialsCard() {
  const [agencies, setAgencies] = useState<AgencyCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [bulkProvisioning, setBulkProvisioning] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function loadAgencies() {
    if (!supabase) { setLoading(false); return; }
    const { data } = await (supabase as any)
      .from('agencies')
      .select('id, name, slug, is_active, app_login_email, app_login_password')
      .eq('is_active', true)
      .order('name');
    if (data) setAgencies(data as AgencyCredential[]);
    setLoading(false);
  }

  useEffect(() => { loadAgencies(); }, []);

  function copyToClipboard(text: string, fieldId: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function provisionAgency(agencyId: string) {
    if (!supabase) return;
    setProvisioningId(agencyId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-agency-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ agency_id: agencyId }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessage({ type: 'success', text: `Provisioned ${json.agency}: ${json.email}` });
      await loadAgencies();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message ?? 'Provisioning failed' });
    } finally {
      setProvisioningId(null);
    }
  }

  async function resetPassword(agencyId: string) {
    if (!supabase) return;
    setResettingId(agencyId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-agency-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ agency_id: agencyId, action: 'reset' }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessage({ type: 'success', text: `Password reset for ${json.agency}` });
      await loadAgencies();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message ?? 'Reset failed' });
    } finally {
      setResettingId(null);
    }
  }

  async function bulkProvision() {
    if (!supabase) return;
    setBulkProvisioning(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-agency-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'bulk' }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessage({
        type: 'success',
        text: `Bulk provisioned: ${json.provisioned} agencies. ${json.errors > 0 ? `${json.errors} errors.` : ''}`,
      });
      await loadAgencies();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message ?? 'Bulk provisioning failed' });
    } finally {
      setBulkProvisioning(false);
    }
  }

  const filtered = search
    ? agencies.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : agencies;

  const provisioned = agencies.filter(a => a.app_login_email);
  const unprovisioned = agencies.filter(a => !a.app_login_email);

  return (
    <Card className="border-border" role="region" aria-label="Agency App Credentials">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <KeyRound size={16} className="text-emerald-400" />
            Agency App Credentials
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPasswords(!showPasswords)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              {showPasswords ? <EyeOff size={14} /> : <EyeIcon size={14} />}
              {showPasswords ? 'Hide' : 'Show'}
            </Button>
            {unprovisioned.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={bulkProvision}
                disabled={bulkProvisioning}
                className="h-7 px-3 text-xs gap-1"
              >
                <Zap size={12} />
                {bulkProvisioning ? 'Provisioning...' : `Provision All (${unprovisioned.length})`}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Login credentials for agency admin access to the FYM App. Each agency gets a unique
          email and password scoped to their data only.
        </p>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search agencies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-border rounded-lg text-sm bg-card focus:ring-2 focus:ring-ring"
            />
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {provisioned.length}/{agencies.length} provisioned
          </Badge>
        </div>

        {message && (
          <div className={`p-3 rounded-lg flex items-start gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          }`}>
            {message.type === 'success'
              ? <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
              : <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />}
            <p className={`text-xs ${message.type === 'success' ? 'text-emerald-300' : 'text-red-400'}`}>
              {message.text}
            </p>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {search ? 'No agencies match your search' : 'No active agencies found'}
          </p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto space-y-1.5 pr-1">
            {filtered.map((agency) => (
              <div
                key={agency.id}
                className="flex items-center justify-between bg-secondary/20 border border-border rounded-md px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{agency.name}</p>
                  {agency.app_login_email ? (
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        {agency.app_login_email}
                      </span>
                      <button
                        onClick={() => copyToClipboard(agency.app_login_email!, `email-${agency.id}`)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="Copy email"
                      >
                        {copiedField === `email-${agency.id}`
                          ? <CheckCircle2 size={12} className="text-emerald-400" />
                          : <Copy size={12} />}
                      </button>
                      <span className="text-xs text-muted-foreground font-mono">
                        {showPasswords ? agency.app_login_password : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                      </span>
                      <button
                        onClick={() => copyToClipboard(agency.app_login_password!, `pw-${agency.id}`)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="Copy password"
                      >
                        {copiedField === `pw-${agency.id}`
                          ? <CheckCircle2 size={12} className="text-emerald-400" />
                          : <Copy size={12} />}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic mt-0.5">No credentials yet</p>
                  )}
                </div>
                <div className="shrink-0 ml-3">
                  {agency.app_login_email ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resetPassword(agency.id)}
                      disabled={resettingId === agency.id}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                    >
                      <RefreshCw size={12} className={resettingId === agency.id ? 'animate-spin' : ''} />
                      {resettingId === agency.id ? 'Resetting...' : 'Reset PW'}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => provisionAgency(agency.id)}
                      disabled={provisioningId === agency.id}
                      className="h-7 px-2 text-xs gap-1"
                    >
                      <KeyRound size={12} />
                      {provisioningId === agency.id ? 'Creating...' : 'Provision'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── FYM Admin Management ────────────────────────────────────────────────────

function FymAdminManagementCard({ currentUserId }: { currentUserId: string | null }) {
  const [admins, setAdmins] = useState<FymAdminRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New admin form state
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ success: boolean; message: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);

  async function loadAdmins() {
    if (!supabase) return;
    setLoading(true);
    const { data, error: fetchErr } = await (supabase as any)
      .from('fym_admins')
      .select('id, user_id, added_by, created_at')
      .order('created_at', { ascending: true });

    if (fetchErr || !data) {
      setLoading(false);
      return;
    }

    // Collect all user IDs we need names for: admin user_ids + added_by user_ids
    const userIds = (data as any[]).map((row) => row.user_id);
    const addedByIds = (data as any[])
      .map((row) => row.added_by)
      .filter((id): id is string => !!id);
    const allIds = [...new Set([...userIds, ...addedByIds])];

    let nameMap: Record<string, string | null> = {};
    if (allIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', allIds);
      nameMap = Object.fromEntries((profileRows ?? []).map((p: any) => [p.id, p.full_name]));
    }

    setAdmins(
      (data as any[]).map((row) => ({
        fym_admin_id: row.id,
        user_id: row.user_id,
        added_by: row.added_by,
        added_by_name: row.added_by ? (nameMap[row.added_by] ?? null) : null,
        created_at: row.created_at,
        full_name: nameMap[row.user_id] ?? null,
      }))
    );
    setLoading(false);
  }

  async function loadProfiles() {
    if (!supabase) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .order('full_name', { ascending: true });
    if (data) setProfiles(data as ProfileOption[]);
  }

  useEffect(() => {
    loadAdmins();
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd() {
    if (!supabase || !selectedProfileId) return;
    setBusy(true);
    setError(null);
    const { error: insertErr } = await (supabase as any).from('fym_admins').insert({
      user_id: selectedProfileId,
      added_by: currentUserId,
    });
    setBusy(false);
    if (insertErr) {
      setError(insertErr.message ?? 'Failed to add FYM admin.');
      return;
    }
    setSelectedProfileId('');
    await loadAdmins();
  }

  async function handleCreateAdmin() {
    if (!supabase) return;
    setCreating(true);
    setCreateResult(null);
    setCreateError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-admin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            first_name: newFirstName.trim(),
            last_name: newLastName.trim(),
            email: newEmail.trim().toLowerCase(),
          }),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      setCreateResult({ success: true, message: json.message });
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      await loadAdmins();
    } catch (err: any) {
      setCreateError(err.message ?? 'Unknown error');
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(fymAdminId: string) {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: deleteErr } = await (supabase as any)
      .from('fym_admins')
      .delete()
      .eq('id', fymAdminId);
    setBusy(false);
    if (deleteErr) {
      setError(deleteErr.message ?? 'Failed to remove FYM admin.');
      return;
    }
    await loadAdmins();
  }

  const availableProfiles = profiles.filter(
    (p) => !admins.some((a) => a.user_id === p.id)
  );

  return (
    <Card className="border-border" role="region" aria-label="FYM Admin Management">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <ShieldPlus size={16} className="text-[hsl(199,89%,48%)]" />
          FYM Admin Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Users listed here get org-wide, unrestricted access regardless of their profile role.
        </p>

        <div aria-live="polite">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-muted-foreground">No FYM admins registered yet.</p>
        ) : (
          <div className="space-y-2">
            {admins.map((a) => (
              <div
                key={a.fym_admin_id}
                className="flex items-center justify-between bg-secondary/20 border border-border rounded-md px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {a.full_name ?? 'Unknown user'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(a.created_at).toLocaleDateString()}
                    {a.added_by ? ` by ${a.added_by_name ?? 'Unknown'}` : ''}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2 gap-1"
                    >
                      <Trash2 size={12} />
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove FYM admin?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {a.full_name ?? 'This user'} will lose org-wide unrestricted access
                        and revert to whatever role is on their profile.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-500 hover:bg-red-600 text-white"
                        onClick={() => handleRemove(a.fym_admin_id)}
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
        </div>

        {/* Add existing user as admin */}
        <div className="flex items-center gap-2 pt-2">
          <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
            <SelectTrigger className="bg-secondary/20 flex-1">
              <SelectValue placeholder="Select existing user to promote…" />
            </SelectTrigger>
            <SelectContent>
              {availableProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name ?? p.id} ({p.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleAdd}
            disabled={!selectedProfileId || busy}
            className="bg-primary hover:bg-primary/80"
          >
            Add
          </Button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Create new admin account */}
        <div className="border-t border-border/30 pt-4 mt-4">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <UserPlus size={14} className="text-primary" />
            Create New Admin Account
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">First Name</Label>
              <Input
                placeholder="Jane"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                className="bg-card"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">Last Name</Label>
              <Input
                placeholder="Smith"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                className="bg-card"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">Email</Label>
              <Input
                type="email"
                placeholder="jane@teamfym.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="bg-card"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Creates a Supabase auth account with the shared team password and adds them to the FYM admins table.
            The new admin should change their password after first login.
          </p>
          <AlertDialog open={showCreateConfirm} onOpenChange={setShowCreateConfirm}>
            <AlertDialogTrigger asChild>
              <Button
                disabled={creating || !newFirstName.trim() || !newLastName.trim() || !newEmail.trim()}
                className="mt-3 bg-primary hover:bg-primary/80"
              >
                {creating ? 'Creating…' : 'Create Admin Account'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Create admin account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will create a new auth user and FYM admin profile for{' '}
                  <span className="font-medium text-foreground">
                    {newFirstName.trim()} {newLastName.trim()}
                  </span>{' '}
                  ({newEmail.trim().toLowerCase()}). They will have org-wide unrestricted access.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-primary hover:bg-primary/80"
                  onClick={() => {
                    setShowCreateConfirm(false);
                    handleCreateAdmin();
                  }}
                >
                  Create Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {createResult && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2">
              <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-300">{createResult.message}</p>
            </div>
          )}

          {createError && (
            <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-400">{createError}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── View As ──────────────────────────────────────────────────────────────

function ViewAsCard() {
  const { active, role, agencyName, agentName, activate, deactivate } = useViewAsStore();

  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>('');
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgencies, setLoadingAgencies] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    setLoadingAgencies(true);
    (supabase as any)
      .from('agencies')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: AgencyOption[] | null }) => {
        if (data) setAgencies(data);
        setLoadingAgencies(false);
      });
  }, []);

  useEffect(() => {
    if (!supabase || selectedRole !== 'agent' || !selectedAgencyId) {
      setAgents([]);
      setSelectedAgentId('');
      return;
    }
    supabase
      .from('profiles')
      .select('id, full_name, writing_number')
      .eq('agency_id', selectedAgencyId)
      .eq('role', 'agent')
      .order('full_name', { ascending: true })
      .then(({ data }) => {
        if (data) setAgents(data as AgentOption[]);
      });
  }, [selectedRole, selectedAgencyId]);

  function handleActivate() {
    const agency = agencies.find((a) => a.id === selectedAgencyId);
    if (!agency) return;
    const agent = agents.find((a) => a.id === selectedAgentId);
    activate({
      role: selectedRole,
      agencyId: agency.id,
      agencyName: agency.name,
      agentId: selectedRole === 'agent' ? selectedAgentId || undefined : undefined,
      agentName: selectedRole === 'agent' ? agent?.full_name ?? undefined : undefined,
    });
  }

  const canActivate =
    !!selectedAgencyId && (selectedRole !== 'agent' || !!selectedAgentId);

  return (
    <Card className="border-border" role="region" aria-label="View As Impersonation">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <Eye size={16} className="text-amber-400" />
          View As
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Impersonate an agency admin, manager, or agent view to see exactly what
          they see. Data scoping is enforced automatically for the duration of the
          session.
        </p>

        {active && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
            <div>
              <Badge variant="outline" className="text-amber-400 border-amber-500/40 mb-1">
                Active
              </Badge>
              <p className="text-sm text-foreground">
                Viewing as{' '}
                <span className="font-medium">
                  {role === 'agent'
                    ? `Agent — ${agentName ?? 'Unknown'} @ ${agencyName}`
                    : role === 'manager'
                      ? `Manager — ${agencyName}`
                      : `Agency Admin — ${agencyName}`}
                </span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={deactivate}
              className="text-black bg-amber-500 hover:bg-amber-600 h-7 px-3"
            >
              Exit View As
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground/80">Role</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as UserRole)}>
              <SelectTrigger className="bg-secondary/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Agency Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground/80">Agency</Label>
            <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
              <SelectTrigger className="bg-secondary/20">
                <SelectValue placeholder={loadingAgencies ? 'Loading agencies…' : 'Select agency…'} />
              </SelectTrigger>
              <SelectContent>
                {agencies.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedRole === 'agent' && (
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-sm font-medium text-foreground/80">Agent</Label>
              <Select
                value={selectedAgentId}
                onValueChange={setSelectedAgentId}
                disabled={!selectedAgencyId}
              >
                <SelectTrigger className="bg-secondary/20">
                  <SelectValue
                    placeholder={!selectedAgencyId ? 'Select an agency first…' : 'Select agent…'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {selectedAgencyId && agents.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 py-4 px-3 text-center">
                      <Users size={16} className="text-muted-foreground/60" />
                      <p className="text-xs text-muted-foreground">No agents found for this agency</p>
                    </div>
                  ) : (
                    agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name ?? a.writing_number ?? a.id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Button
          onClick={handleActivate}
          disabled={!canActivate}
          className="bg-amber-500 hover:bg-amber-600 text-black"
        >
          Activate View As
        </Button>
      </CardContent>
    </Card>
  );
}
