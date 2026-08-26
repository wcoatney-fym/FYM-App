import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/lib/supabase';
import { UserPlus, Trash2, Search, Phone, Users, Shield, Building2, Check, AlertCircle, Loader2 } from 'lucide-react';

interface Recipient {
  id: string;
  portal_agent_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  active: boolean;
}

interface Manager {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

interface RosterAgent {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  agency_id: string;
  agency_name?: string;
  already_added: boolean;
}

interface RecipientManagerProps {
  recipients: Recipient[];
  managers: Manager[];
  onRefresh: () => void;
}

function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return e164;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

/* ── Add Agent Dialog (Option A: search-from-roster) ─────────────── */

interface AddAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPhones: Set<string>;
  existingPortalIds: Set<string>;
  onAdded: () => void;
}

function AddAgentDialog({ open, onOpenChange, existingPhones, existingPortalIds, onAdded }: AddAgentDialogProps) {
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterResults, setRosterResults] = useState<RosterAgent[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'roster' | 'manual'>('roster');
  const [manualFirst, setManualFirst] = useState('');
  const [manualLast, setManualLast] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setRosterSearch('');
      setRosterResults([]);
      setJustAdded(new Set());
      setError(null);
      setMode('roster');
      setManualFirst('');
      setManualLast('');
      setManualPhone('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced roster search
  useEffect(() => {
    if (!open || mode !== 'roster') return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!rosterSearch.trim() || rosterSearch.trim().length < 2) {
      setRosterResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      setError(null);
      if (!supabase) { setSearching(false); return; }

      const q = rosterSearch.trim().toLowerCase();
      // Search agency_rosters by name, join agencies for agency name
      const { data, error: err } = await (supabase as any)
        .from('agency_rosters')
        .select('id, first_name, last_name, phone, agency_id, agencies(name)')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .eq('status', 'active')
        .order('last_name', { ascending: true })
        .limit(50);

      if (err) {
        setError('Failed to search roster');
        setSearching(false);
        return;
      }

      const results: RosterAgent[] = (data || []).map((r: any) => ({
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        phone: r.phone,
        agency_id: r.agency_id,
        agency_name: r.agencies?.name || undefined,
        already_added: existingPortalIds.has(r.id) || justAdded.has(r.id),
      }));

      setRosterResults(results);
      setSearching(false);
    }, 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [rosterSearch, open, mode, existingPortalIds, justAdded]);

  const addFromRoster = useCallback(async (agent: RosterAgent) => {
    if (!supabase || agent.already_added) return;
    setAdding(agent.id);
    setError(null);

    const phone = normalizePhone(agent.phone);

    // Check for duplicate by phone
    if (existingPhones.has(phone)) {
      setError(`${agent.first_name} ${agent.last_name} is already a recipient (phone match)`);
      setAdding(null);
      return;
    }

    // Check for an inactive record with this phone — reactivate instead of inserting
    const { data: inactive } = await (supabase as any)
      .from('checkin_recipients')
      .select('id')
      .eq('phone', phone)
      .eq('active', false)
      .maybeSingle();

    if (inactive) {
      // Reactivate and update with roster data
      const { error: reactivateErr } = await (supabase as any)
        .from('checkin_recipients')
        .update({
          portal_agent_id: agent.id,
          first_name: agent.first_name,
          last_name: agent.last_name,
          agency_id: agent.agency_id,
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inactive.id);

      if (reactivateErr) {
        setError(reactivateErr.message || 'Failed to reactivate agent');
        setAdding(null);
        return;
      }
    } else {
      const { error: insertErr } = await (supabase as any)
        .from('checkin_recipients')
        .insert({
          portal_agent_id: agent.id,
          first_name: agent.first_name,
          last_name: agent.last_name,
          phone,
          agency_id: agent.agency_id,
          active: true,
        });

      if (insertErr) {
        if (insertErr.code === '23505') {
          setError(`${agent.first_name} ${agent.last_name} is already a recipient`);
        } else {
          setError(insertErr.message || 'Failed to add agent');
        }
        setAdding(null);
        return;
      }
    }

    setJustAdded((prev) => new Set([...prev, agent.id]));
    // Update the result to show as added
    setRosterResults((prev) =>
      prev.map((r) => (r.id === agent.id ? { ...r, already_added: true } : r))
    );
    setAdding(null);
    onAdded();
  }, [existingPhones, onAdded]);

  const addManual = useCallback(async () => {
    if (!manualFirst.trim() || !manualLast.trim() || !manualPhone.trim()) return;
    if (!supabase) return;
    setManualSaving(true);
    setError(null);

    const phone = normalizePhone(manualPhone);

    if (existingPhones.has(phone)) {
      setError('An agent with this phone number is already a recipient');
      setManualSaving(false);
      return;
    }

    // Check for an inactive record with this phone — reactivate instead of inserting
    const { data: inactive } = await (supabase as any)
      .from('checkin_recipients')
      .select('id')
      .eq('phone', phone)
      .eq('active', false)
      .maybeSingle();

    if (inactive) {
      // Reactivate and update name
      const { error: reactivateErr } = await (supabase as any)
        .from('checkin_recipients')
        .update({
          first_name: manualFirst.trim(),
          last_name: manualLast.trim(),
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inactive.id);

      if (reactivateErr) {
        setError(reactivateErr.message || 'Failed to reactivate agent');
        setManualSaving(false);
        return;
      }
    } else {
      // No existing record — insert new
      const { error: insertErr } = await (supabase as any)
        .from('checkin_recipients')
        .insert({
          portal_agent_id: crypto.randomUUID(), // placeholder — no roster link
          first_name: manualFirst.trim(),
          last_name: manualLast.trim(),
          phone,
          active: true,
        });

      if (insertErr) {
        if (insertErr.code === '23505') {
          setError('This agent is already a recipient');
        } else {
          setError(insertErr.message || 'Failed to add agent');
        }
        setManualSaving(false);
        return;
      }
    }

    setManualFirst('');
    setManualLast('');
    setManualPhone('');
    setManualSaving(false);
    onAdded();
    onOpenChange(false);
  }, [manualFirst, manualLast, manualPhone, existingPhones, onAdded, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Add Agent</DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setMode('roster')}
            className={`px-3 py-1 rounded-md text-xs transition-colors ${
              mode === 'roster'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Search Roster
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`px-3 py-1 rounded-md text-xs transition-colors ${
              mode === 'manual'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Manual Entry
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {mode === 'roster' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                ref={inputRef}
                placeholder="Type a name to search the roster..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                className="pl-9 bg-zinc-800/50 border-zinc-700 text-sm"
                autoFocus
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 animate-spin" />
              )}
            </div>

            {rosterSearch.trim().length >= 2 && (
              <ScrollArea className="max-h-72">
                <div className="space-y-1">
                  {rosterResults.length === 0 && !searching && (
                    <div className="py-4 text-center text-zinc-500 text-sm">
                      No roster agents found for "{rosterSearch}"
                    </div>
                  )}
                  {rosterResults.map((agent) => (
                    <div
                      key={agent.id}
                      className={`flex items-center justify-between py-2 px-3 rounded-md transition-colors ${
                        agent.already_added
                          ? 'bg-zinc-800/10 opacity-50'
                          : 'bg-zinc-800/30 hover:bg-zinc-800/50 cursor-pointer'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-zinc-200 font-medium truncate">
                            {agent.first_name} {agent.last_name}
                          </span>
                          {agent.already_added && (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex-shrink-0">
                              <Check className="w-2.5 h-2.5 mr-0.5" /> Added
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {formatPhone(agent.phone)}
                          </span>
                          {agent.agency_name && (
                            <span className="flex items-center gap-1 truncate">
                              <Building2 className="w-3 h-3 flex-shrink-0" />
                              {agent.agency_name}
                            </span>
                          )}
                        </div>
                      </div>
                      {!agent.already_added && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-sky-400 hover:text-sky-300 flex-shrink-0"
                          disabled={adding === agent.id}
                          onClick={() => addFromRoster(agent)}
                        >
                          {adding === agent.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <UserPlus className="w-3 h-3 mr-1" /> Add
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {rosterSearch.trim().length < 2 && (
              <div className="py-6 text-center text-zinc-500 text-sm">
                Search by first or last name (min 2 characters)
              </div>
            )}

            {justAdded.size > 0 && (
              <div className="text-xs text-emerald-400 text-center">
                {justAdded.size} agent{justAdded.size > 1 ? 's' : ''} added
              </div>
            )}
          </div>
        )}

        {mode === 'manual' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              For agents not in the roster. No agency linkage or dedup protection.
            </p>
            <Input
              placeholder="First name"
              value={manualFirst}
              onChange={(e) => setManualFirst(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700"
            />
            <Input
              placeholder="Last name"
              value={manualLast}
              onChange={(e) => setManualLast(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700"
            />
            <Input
              placeholder="Phone number"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700"
            />
            <Button
              className="w-full"
              onClick={addManual}
              disabled={manualSaving || !manualFirst.trim() || !manualLast.trim() || !manualPhone.trim()}
            >
              {manualSaving ? 'Adding...' : 'Add Agent'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── RecipientManager ────────────────────────────────────────────── */

export function RecipientManager({ recipients, managers, onRefresh }: RecipientManagerProps) {
  const [search, setSearch] = useState('');
  const [showAddManager, setShowAddManager] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newManagerName, setNewManagerName] = useState('');
  const [newManagerPhone, setNewManagerPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'agents' | 'managers'>('agents');

  // Build lookup sets for dedup in Add Agent dialog — only active recipients
  // block adds. Inactive records (from roster cleanup) should not prevent re-adding.
  const activeRecipients = recipients.filter((r) => r.active);
  const existingPhones = new Set(activeRecipients.map((r) => r.phone));
  const existingPortalIds = new Set(activeRecipients.map((r) => r.portal_agent_id));

  const filteredRecipients = recipients.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.first_name.toLowerCase().includes(q) ||
      r.last_name.toLowerCase().includes(q) ||
      r.phone.includes(q)
    );
  });

  const toggleRecipient = useCallback(async (id: string, active: boolean) => {
    if (!supabase) return;
    await (supabase as any).from('checkin_recipients').update({ active: !active }).eq('id', id);
    onRefresh();
  }, [onRefresh]);

  const removeRecipient = useCallback(async (id: string) => {
    if (!supabase) return;
    await (supabase as any).from('checkin_recipients').delete().eq('id', id);
    onRefresh();
  }, [onRefresh]);

  const toggleManager = useCallback(async (id: string, active: boolean) => {
    if (!supabase) return;
    await (supabase as any).from('checkin_managers').update({ active: !active }).eq('id', id);
    onRefresh();
  }, [onRefresh]);

  const removeManager = useCallback(async (id: string) => {
    if (!supabase) return;
    await (supabase as any).from('checkin_managers').delete().eq('id', id);
    onRefresh();
  }, [onRefresh]);

  const addManager = useCallback(async () => {
    if (!newManagerName.trim() || !newManagerPhone.trim()) return;
    setSaving(true);
    const phone = normalizePhone(newManagerPhone);
    if (!supabase) return;
    await (supabase as any).from('checkin_managers').insert({
      name: newManagerName.trim(),
      phone,
    });
    setNewManagerName('');
    setNewManagerPhone('');
    setShowAddManager(false);
    setSaving(false);
    onRefresh();
  }, [newManagerName, newManagerPhone, onRefresh]);

  return (
    <Card className="bg-zinc-900/60 border-zinc-800">
      <CardContent className="p-4">
        {/* Tab switcher */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setTab('agents')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              tab === 'agents'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Agents ({recipients.filter((r) => r.active).length})
          </button>
          <button
            onClick={() => setTab('managers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              tab === 'managers'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Managers ({managers.filter((m) => m.active).length})
          </button>
        </div>

        {tab === 'agents' && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  placeholder="Search agents..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-zinc-800/50 border-zinc-700 text-sm"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-zinc-700 text-zinc-300 hover:text-sky-400 hover:border-sky-500/30"
                onClick={() => setShowAddAgent(true)}
              >
                <UserPlus className="w-3.5 h-3.5 mr-1" /> Add Agent
              </Button>
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filteredRecipients.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between py-2 px-3 rounded-md transition-colors ${
                    r.active ? 'bg-zinc-800/30' : 'bg-zinc-800/10 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-200 font-medium">
                      {r.first_name} {r.last_name}
                    </span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {formatPhone(r.phone)}
                    </span>
                    {!r.active && (
                      <Badge variant="outline" className="text-xs bg-zinc-700/30 text-zinc-500 border-zinc-600">
                        Paused
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-zinc-400 hover:text-zinc-200"
                      onClick={() => toggleRecipient(r.id, r.active)}
                    >
                      {r.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-400 hover:text-red-300"
                      onClick={() => removeRecipient(r.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredRecipients.length === 0 && (
                <div className="py-6 text-center text-zinc-500 text-sm">
                  {search ? 'No matching agents' : 'No recipients configured'}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'managers' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-400">Managers receive the daily summary SMS</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-zinc-700 text-zinc-300"
                onClick={() => setShowAddManager(true)}
              >
                <UserPlus className="w-3 h-3 mr-1" /> Add Manager
              </Button>
            </div>
            <div className="space-y-1">
              {managers.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-center justify-between py-2 px-3 rounded-md transition-colors ${
                    m.active ? 'bg-zinc-800/30' : 'bg-zinc-800/10 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-200 font-medium">{m.name}</span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {formatPhone(m.phone)}
                    </span>
                    {!m.active && (
                      <Badge variant="outline" className="text-xs bg-zinc-700/30 text-zinc-500 border-zinc-600">
                        Paused
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-zinc-400 hover:text-zinc-200"
                      onClick={() => toggleManager(m.id, m.active)}
                    >
                      {m.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-400 hover:text-red-300"
                      onClick={() => removeManager(m.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      {/* Add Agent Dialog */}
      <AddAgentDialog
        open={showAddAgent}
        onOpenChange={setShowAddAgent}
        existingPhones={existingPhones}
        existingPortalIds={existingPortalIds}
        onAdded={onRefresh}
      />

      {/* Add Manager Dialog */}
      <Dialog open={showAddManager} onOpenChange={setShowAddManager}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Add Manager</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Name"
              value={newManagerName}
              onChange={(e) => setNewManagerName(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700"
            />
            <Input
              placeholder="Phone number"
              value={newManagerPhone}
              onChange={(e) => setNewManagerPhone(e.target.value)}
              className="bg-zinc-800/50 border-zinc-700"
            />
            <Button
              className="w-full"
              onClick={addManager}
              disabled={saving || !newManagerName.trim() || !newManagerPhone.trim()}
            >
              {saving ? 'Adding...' : 'Add Manager'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
