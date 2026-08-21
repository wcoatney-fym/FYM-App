/**
 * AdminCalendarsCard — manage Google Calendar links for FYM admin users.
 *
 * Each admin can have multiple calendars (labeled, e.g. "Primary",
 * "Recruiting", "Training"). Calendars are stored in `admin_calendars`
 * in the FYM App DB (rcbzag).
 */
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Star,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AdminUser {
  user_id: string;
  full_name: string;
}

interface CalendarEntry {
  id: string;
  user_id: string;
  label: string;
  calendar_url: string;
  is_primary: boolean;
  created_at: string;
}

export function AdminCalendarsCard() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New calendar form
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Load admin users on mount
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase
        .from('fym_admins')
        .select('user_id, profiles!inner(full_name)')
        .order('profiles(full_name)');

      if (data) {
        setAdmins(
          data.map((row: any) => ({
            user_id: row.user_id,
            full_name: row.profiles?.full_name ?? 'Unknown',
          }))
        );
      }
    })();
  }, []);

  // Load calendars when admin is selected
  const fetchCalendars = useCallback(async (userId: string) => {
    if (!supabase || !userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_calendars')
      .select('*')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      setFeedback({ type: 'error', message: error.message });
    } else {
      setCalendars(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedAdminId) {
      fetchCalendars(selectedAdminId);
      setShowAddForm(false);
      setFeedback(null);
    } else {
      setCalendars([]);
    }
  }, [selectedAdminId, fetchCalendars]);

  async function handleAdd() {
    if (!supabase || !selectedAdminId || !newUrl.trim()) return;
    setSaving(true);
    setFeedback(null);

    const isPrimary = calendars.length === 0;
    const label = newLabel.trim() || (isPrimary ? 'Primary' : `Calendar ${calendars.length + 1}`);

    const { error } = await supabase.from('admin_calendars').insert({
      user_id: selectedAdminId,
      label,
      calendar_url: newUrl.trim(),
      is_primary: isPrimary,
    });

    if (error) {
      // If unique constraint on primary, just insert as non-primary
      if (error.code === '23505' && isPrimary) {
        const { error: retryErr } = await supabase.from('admin_calendars').insert({
          user_id: selectedAdminId,
          label,
          calendar_url: newUrl.trim(),
          is_primary: false,
        });
        if (retryErr) {
          setFeedback({ type: 'error', message: retryErr.message });
          setSaving(false);
          return;
        }
      } else {
        setFeedback({ type: 'error', message: error.message });
        setSaving(false);
        return;
      }
    }

    setFeedback({ type: 'success', message: `Calendar added for ${admins.find(a => a.user_id === selectedAdminId)?.full_name}` });
    setNewLabel('');
    setNewUrl('');
    setShowAddForm(false);
    await fetchCalendars(selectedAdminId);
    setSaving(false);
    setTimeout(() => setFeedback(null), 3000);
  }

  async function handleDelete(calId: string) {
    if (!supabase) return;
    setDeleting(calId);
    setFeedback(null);

    const { error } = await supabase.from('admin_calendars').delete().eq('id', calId);

    if (error) {
      setFeedback({ type: 'error', message: error.message });
    } else {
      setFeedback({ type: 'success', message: 'Calendar removed' });
      setTimeout(() => setFeedback(null), 3000);
    }

    await fetchCalendars(selectedAdminId);
    setDeleting(null);
  }

  async function handleSetPrimary(calId: string) {
    if (!supabase || !selectedAdminId) return;
    setFeedback(null);

    // Clear existing primary
    await supabase
      .from('admin_calendars')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('user_id', selectedAdminId)
      .eq('is_primary', true);

    // Set new primary
    const { error } = await supabase
      .from('admin_calendars')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', calId);

    if (error) {
      setFeedback({ type: 'error', message: error.message });
    } else {
      setFeedback({ type: 'success', message: 'Primary calendar updated' });
      setTimeout(() => setFeedback(null), 3000);
    }

    await fetchCalendars(selectedAdminId);
  }

  const selectedAdmin = admins.find(a => a.user_id === selectedAdminId);

  return (
    <Card className="border-border" role="region" aria-label="Admin Google Calendars">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <Calendar size={16} className="text-blue-400" />
          Google Calendars
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Assign Google Calendar links to admin users. Each admin can have multiple calendars.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Admin selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground/80">Admin User</Label>
          <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
            <SelectTrigger className="bg-secondary/20">
              <SelectValue placeholder="Select an admin user…" />
            </SelectTrigger>
            <SelectContent>
              {admins.map(a => (
                <SelectItem key={a.user_id} value={a.user_id}>
                  {a.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
              feedback.type === 'success'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-red-400 bg-red-500/10 border-red-500/20'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Calendar list */}
        {selectedAdminId && (
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : calendars.length === 0 ? (
              <div className="text-center py-6">
                <Calendar className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No calendars assigned to {selectedAdmin?.full_name}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {calendars.length} calendar{calendars.length !== 1 ? 's' : ''} for {selectedAdmin?.full_name}
                </p>
                {calendars.map(cal => (
                  <div
                    key={cal.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                      cal.is_primary
                        ? 'border-blue-500/30 bg-blue-500/5'
                        : 'border-border/40 bg-secondary/10'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{cal.label}</span>
                        {cal.is_primary && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                            PRIMARY
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{cal.calendar_url}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {cal.calendar_url.startsWith('http') && (
                        <a
                          href={cal.calendar_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                          title="Open calendar"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {!cal.is_primary && (
                        <button
                          onClick={() => handleSetPrimary(cal.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          title="Set as primary"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(cal.id)}
                        disabled={deleting === cal.id}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                        title="Remove calendar"
                      >
                        {deleting === cal.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add calendar form */}
            {showAddForm ? (
              <div className="border border-border/40 rounded-lg p-3 space-y-3 bg-secondary/5">
                <p className="text-xs font-semibold text-foreground">Add Calendar</p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Label</Label>
                    <Input
                      placeholder="e.g. Recruiting"
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      className="bg-card text-sm h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Calendar URL or ID</Label>
                    <Input
                      placeholder="https://calendar.google.com/… or calendar ID"
                      value={newUrl}
                      onChange={e => setNewUrl(e.target.value)}
                      className="bg-card text-sm h-9"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleAdd}
                    disabled={!newUrl.trim() || saving}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600 text-white h-8"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Add
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewLabel('');
                      setNewUrl('');
                    }}
                    className="h-8 text-muted-foreground"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(true)}
                className="w-full border-dashed border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Calendar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
