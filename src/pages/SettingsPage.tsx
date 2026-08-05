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
import { Eye, ShieldPlus, Trash2, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';

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
            </CardContent>
          </Card></StaggerItem>
        )}

        {isFymAdmin && <StaggerItem><FymAdminManagementCard currentUserId={user?.id ?? null} /></StaggerItem>}
        {isFymAdmin && <StaggerItem><ViewAsCard /></StaggerItem>}
        </StaggerContainer>
      </div>
    </div>
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
    <Card className="border-border">
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
            A new auth account and admin profile will be created.
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
    <Card className="border-border">
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
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.full_name ?? a.writing_number ?? a.id}
                    </SelectItem>
                  ))}
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
