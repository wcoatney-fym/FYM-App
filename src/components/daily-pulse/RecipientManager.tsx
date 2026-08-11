import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { UserPlus, Trash2, Search, Phone, Users, Shield } from 'lucide-react';

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

export function RecipientManager({ recipients, managers, onRefresh }: RecipientManagerProps) {
  const [search, setSearch] = useState('');
  const [showAddManager, setShowAddManager] = useState(false);
  const [newManagerName, setNewManagerName] = useState('');
  const [newManagerPhone, setNewManagerPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'agents' | 'managers'>('agents');

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
    await supabase.from('checkin_recipients').update({ active: !active }).eq('id', id);
    onRefresh();
  }, [onRefresh]);

  const removeRecipient = useCallback(async (id: string) => {
    await supabase.from('checkin_recipients').delete().eq('id', id);
    onRefresh();
  }, [onRefresh]);

  const toggleManager = useCallback(async (id: string, active: boolean) => {
    await supabase.from('checkin_managers').update({ active: !active }).eq('id', id);
    onRefresh();
  }, [onRefresh]);

  const removeManager = useCallback(async (id: string) => {
    await supabase.from('checkin_managers').delete().eq('id', id);
    onRefresh();
  }, [onRefresh]);

  const addManager = useCallback(async () => {
    if (!newManagerName.trim() || !newManagerPhone.trim()) return;
    setSaving(true);
    const phone = normalizePhone(newManagerPhone);
    await supabase.from('checkin_managers').insert({
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
