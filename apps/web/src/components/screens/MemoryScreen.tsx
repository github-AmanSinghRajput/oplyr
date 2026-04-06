import { type FormEvent } from 'react';
import { Edit2, Trash2, Plus, BookOpen, Key, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatTimestamp } from '@/containers/voice-console/lib/helpers';
import type { AuthSessionEntry, NoteEntry, SystemResponse } from '@/containers/voice-console/lib/types';

interface MemoryScreenProps {
  editingNoteId: string | null;
  noteBody: string;
  noteSource: string;
  noteTitle: string;
  notes: NoteEntry[];
  trackedSessions: AuthSessionEntry[];
  system: SystemResponse | null;
  onCreateNote: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteNote: (noteId: string) => void;
  onEditNote: (note: NoteEntry) => void;
  onNoteBodyChange: (value: string) => void;
  onNoteSourceChange: (value: string) => void;
  onNoteTitleChange: (value: string) => void;
  onResetComposer: () => void;
}

export function MemoryScreen({
  editingNoteId,
  noteBody,
  noteSource,
  noteTitle,
  notes,
  trackedSessions,
  system,
  onCreateNote,
  onDeleteNote,
  onEditNote,
  onNoteBodyChange,
  onNoteSourceChange,
  onNoteTitleChange,
  onResetComposer,
}: MemoryScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">Memory</p>
          <h2 className="text-lg font-semibold text-text-primary">Capture notes, decisions, and operator context in one place.</h2>
        </div>
        <Badge variant="outline">{notes.length} notes ready</Badge>
      </div>

      {/* Note composer */}
      <div className="rounded-[var(--radius-panel)] border border-accent-border/30 bg-surface-1 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Quick capture</span>
            <p className="text-sm font-medium text-text-primary mt-0.5">Write down the important part before context is lost</p>
          </div>
          <Badge variant="secondary" className="text-xs">live</Badge>
        </div>

        <form className="flex flex-col gap-3" onSubmit={onCreateNote}>
          <div>
            <label className="text-xs text-text-tertiary mb-1 block">Note title</label>
            <Input
              value={noteTitle}
              onChange={(e) => onNoteTitleChange(e.target.value)}
              placeholder="Deployment checklist, customer bug, design idea..."
            />
          </div>

          <div>
            <label className="text-xs text-text-tertiary mb-1 block">Source</label>
            <Input
              value={noteSource}
              onChange={(e) => onNoteSourceChange(e.target.value)}
              placeholder="meeting"
            />
          </div>

          <div>
            <label className="text-xs text-text-tertiary mb-1 block">Body</label>
            <textarea
              className="w-full resize-none rounded-[var(--radius-control)] bg-surface-2 border border-border px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-border focus:ring-1 focus:ring-accent-border min-h-[120px]"
              value={noteBody}
              onChange={(e) => onNoteBodyChange(e.target.value)}
              placeholder="Capture action items, decisions, repo context, follow-ups, and raw meeting notes..."
              rows={6}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit">
              <Plus size={14} className="mr-1.5" />
              {editingNoteId ? 'Update note' : 'Save note'}
            </Button>
            {editingNoteId && (
              <Button variant="ghost" onClick={onResetComposer} type="button">Cancel edit</Button>
            )}
          </div>
        </form>
      </div>

      {/* Notes list */}
      <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Recent notes</span>
          <p className="text-sm font-medium text-text-primary mt-0.5">Granola-style note-taking foundation</p>
        </div>

        {notes.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-text-secondary">No notes created yet.</p>
            <p className="text-xs text-text-tertiary mt-1">Start capturing meeting notes, code decisions, and operator context here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notes.map((note) => (
              <div key={note.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px]">{note.source}</Badge>
                      <span className="text-[10px] text-text-tertiary">{formatTimestamp(note.updatedAt)}</span>
                    </div>
                    <p className="text-sm font-medium text-text-primary">{note.title}</p>
                    <p className="text-xs text-text-secondary mt-1 line-clamp-3">{note.body}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditNote(note)}>
                      <Edit2 size={12} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" onClick={() => onDeleteNote(note.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Key size={14} className="text-accent" />
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Operator auth</span>
          </div>
          <p className="text-sm font-medium text-text-primary">{system?.auth.operator?.displayName ?? 'No operator linked'}</p>
          <p className="text-xs text-text-tertiary mt-1">Local operator identity is tracked separately from CLI sessions.</p>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={14} className="text-warning" />
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Product auth plan</span>
          </div>
          <p className="text-sm font-medium text-text-primary">{system?.auth.productAuth ?? 'Google OAuth planned'}</p>
          <p className="text-xs text-text-tertiary mt-1">Future web/mobile login will use product auth.</p>
        </div>

        <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Server size={14} className="text-success" />
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Infra guidance</span>
          </div>
          <p className="text-sm font-medium text-text-primary">{system?.providers.queue ?? 'inline'} queue / {system?.providers.vector ?? 'none'} vector</p>
          <p className="text-xs text-text-tertiary mt-1">{system?.recommendations.queue ?? 'Keep infrastructure simple until usage justifies more.'}</p>
        </div>
      </div>

      <Separator />

      {/* Tracked sessions */}
      <div className="rounded-[var(--radius-panel)] border border-border bg-surface-1 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Tracked sessions</span>
          <p className="text-sm font-medium text-text-primary mt-0.5">Local and future product session audit</p>
        </div>

        {trackedSessions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-text-secondary">No tracked sessions yet.</p>
            <p className="text-xs text-text-tertiary mt-1">Connected CLI sessions and future product sessions will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {trackedSessions.map((session) => (
              <div key={session.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{session.provider}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{session.providerSubject ?? 'Local CLI session'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs">{session.accessScope.join(', ') || 'no scope'}</Badge>
                  <span className="text-[10px] text-text-tertiary">{formatTimestamp(session.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
