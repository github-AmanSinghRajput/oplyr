import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApi } from '@/providers/ApiProvider';
import { useToast } from '@/providers/ToastProvider';
import type { NoteEntry } from '@/containers/voice-console/lib/types';

export interface NotesHandle {
  notes: NoteEntry[];
  noteTitle: string;
  noteBody: string;
  noteSource: string;
  editingNoteId: string | null;
  onNoteTitleChange: (value: string) => void;
  onNoteBodyChange: (value: string) => void;
  onNoteSourceChange: (value: string) => void;
  onCreateNote: (event: FormEvent<HTMLFormElement>) => void;
  onEditNote: (note: NoteEntry) => void;
  onDeleteNote: (noteId: string) => void;
  onResetComposer: () => void;
  loadNotes: () => Promise<void>;
}

export function useNotes(): NotesHandle {
  const { service } = useApi();
  const { pushToast } = useToast();

  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteSource, setNoteSource] = useState('manual');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      const body = await service.getNotes();
      setNotes(body.notes);
    } catch {
      // non-critical
    }
  }, [service]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const resetComposer = useCallback(() => {
    setNoteTitle('');
    setNoteBody('');
    setNoteSource('manual');
    setEditingNoteId(null);
  }, []);

  const onCreateNote = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!noteTitle.trim()) return;

      const doSave = async () => {
        try {
          if (editingNoteId) {
            await service.updateNote(editingNoteId, {
              title: noteTitle.trim(),
              body: noteBody.trim(),
              source: noteSource.trim() || 'manual',
            });
            pushToast('success', 'Note updated', 'Your note has been saved.');
          } else {
            await service.createNote({
              title: noteTitle.trim(),
              body: noteBody.trim(),
              source: noteSource.trim() || 'manual',
            });
            pushToast('success', 'Note created', 'Your note has been saved.');
          }
          resetComposer();
          await loadNotes();
        } catch {
          pushToast('error', 'Note failed', 'Could not save the note.');
        }
      };

      void doSave();
    },
    [service, pushToast, noteTitle, noteBody, noteSource, editingNoteId, resetComposer, loadNotes],
  );

  const onEditNote = useCallback((note: NoteEntry) => {
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setNoteSource(note.source);
    setEditingNoteId(note.id);
  }, []);

  const onDeleteNote = useCallback(
    (noteId: string) => {
      const doDelete = async () => {
        try {
          await service.deleteNote(noteId);
          setNotes((current) => current.filter((n) => n.id !== noteId));
          if (editingNoteId === noteId) resetComposer();
          pushToast('info', 'Note deleted', 'The note has been removed.');
        } catch {
          pushToast('error', 'Delete failed', 'Could not delete the note.');
        }
      };
      void doDelete();
    },
    [service, pushToast, editingNoteId, resetComposer],
  );

  return {
    notes,
    noteTitle,
    noteBody,
    noteSource,
    editingNoteId,
    onNoteTitleChange: setNoteTitle,
    onNoteBodyChange: setNoteBody,
    onNoteSourceChange: setNoteSource,
    onCreateNote,
    onEditNote,
    onDeleteNote,
    onResetComposer: resetComposer,
    loadNotes,
  };
}
