/**
 * ManagerNoteComposer — Modal for managers/admins to create notes
 * on policies or agents.
 *
 * Per PRD spec:
 * - Subject line (prefilled when opened from a policy/agent context)
 * - Agent selector dropdown (when no agent context)
 * - Note body textarea
 * - "Notify agent immediately" checkbox (default on)
 * - Audit event label: manager_note_added
 * - Notes are visible to the agent
 */
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquarePlus, ShieldCheck } from 'lucide-react';
import { createNote, type CreateNoteParams } from '@/lib/notes-api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface NoteComposerContext {
  /** Prefilled subject line */
  subject?: string;
  /** Policy number to attach note to */
  policyNumber?: string;
  /** Agent writing number */
  agentWritingNumber?: string;
  /** Agent display name */
  agentName?: string;
}

interface ManagerNoteComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: NoteComposerContext;
  /** Called after note is successfully created */
  onNoteCreated?: () => void;
}

export function ManagerNoteComposer({
  open,
  onOpenChange,
  context,
  onNoteCreated,
}: ManagerNoteComposerProps) {
  const { profile } = useAuth();
  const [body, setBody] = useState('');
  const [notifyAgent, setNotifyAgent] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setBody('');
      setNotifyAgent(true);
    }
  }, [open]);

  const subjectLine = context?.subject
    ?? [context?.agentName, context?.policyNumber].filter(Boolean).join(' · ')
    || null;

  async function handleSubmit() {
    if (!body.trim()) return;

    setSubmitting(true);
    try {
      const params: CreateNoteParams = {
        body: body.trim(),
        notify_agent: notifyAgent,
        author_name: profile?.full_name ?? profile?.email ?? undefined,
        policy_number: context?.policyNumber,
        agent_writing_number: context?.agentWritingNumber,
        agent_name: context?.agentName,
      };

      const note = await createNote(params);
      if (note) {
        toast.success('Note posted', {
          description: context?.agentName
            ? `Note added for ${context.agentName}`
            : 'Manager note saved',
        });
        onOpenChange(false);
        onNoteCreated?.();
      } else {
        toast.error('Failed to post note');
      }
    } catch (err) {
      console.error('[NoteComposer] submit error:', err);
      toast.error('Failed to post note');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <MessageSquarePlus size={18} className="text-primary" />
            <DialogTitle className="text-base">Add manager note</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Notes are visible to the agent and audit-logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Subject / context */}
          {subjectLine && (
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                Subject
              </Label>
              <div className="mt-1.5 rounded-lg px-3 py-2 text-sm font-semibold bg-secondary border border-border">
                {subjectLine}
              </div>
            </div>
          )}

          {/* Note body */}
          <div>
            <Label
              htmlFor="note-body"
              className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground"
            >
              Note text
            </Label>
            <Textarea
              id="note-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="e.g., Carrier called for missing voided check. Faxed 5/8 — please confirm receipt in next bank cycle."
              className="mt-1.5 min-h-[110px] resize-y text-sm"
              autoFocus
            />
          </div>

          {/* Notify checkbox */}
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <Checkbox
              checked={notifyAgent}
              onCheckedChange={checked => setNotifyAgent(checked === true)}
            />
            <span className="text-muted-foreground">
              Notify agent immediately (otherwise they'll see it on next login)
            </span>
          </label>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck size={12} />
            <span>
              Audit event: <code className="font-mono text-[10px]">manager_note_added</code>
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!body.trim() || submitting}
            >
              {submitting ? 'Posting…' : 'Post note'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
