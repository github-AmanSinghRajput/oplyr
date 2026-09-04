import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { Mic, Paperclip, Send, StopCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AttachmentChip } from './AttachmentChip';
import { ProviderLogo } from '@/components/providers/ProviderLogo';
import { PetCompanion } from '@/components/pets/PetCompanion';
import { useStatus } from '@/providers/StatusProvider';
import type { AssistantProviderId, ChatAttachment } from '@/containers/voice-console/lib/types';

// The composer grows with its content up to this height, then scrolls internally.
const MAX_TEXTAREA_PX = 160;

const AGENT_LABEL: Record<AssistantProviderId, string> = {
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini'
};

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onStartVoice: () => void;
  onCancelStreaming: () => void;
  draftAttachments: ChatAttachment[];
  disabled?: boolean;
  isStreaming?: boolean;
  /** Connected agents the user can @mention in the room (Agentic Chat). */
  mentionAgents?: AssistantProviderId[];
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onAttachFiles,
  onRemoveAttachment,
  onStartVoice,
  onCancelStreaming,
  draftAttachments,
  disabled,
  isStreaming,
  mentionAgents = []
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  // Crabby honours the same "show desk pet" preference as the topbar companion.
  const { status } = useStatus();
  const showDeskPet = status?.appSettings.showDeskPet !== false;

  // @mention autocomplete: `mention` tracks the token being typed (query + its start index).
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const suggestions = mention
    ? mentionAgents.filter((id) => id.startsWith(mention.query.toLowerCase()))
    : [];
  const mentionOpen = suggestions.length > 0;

  // A mention is "open" when the caret sits right after a `@word` at a word boundary.
  const updateMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const match = before.match(/(?:^|\s)@(\w*)$/);
    if (match) {
      setMention({ query: match[1] ?? '', start: caret - (match[1] ?? '').length - 1 });
      setMentionIndex(0);
    } else {
      setMention(null);
    }
  };

  const applyMention = (agentId: AssistantProviderId) => {
    if (!mention) return;
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const next = `${value.slice(0, mention.start)}@${agentId} ${value.slice(caret)}`;
    onChange(next);
    setMention(null);
    // Restore focus + drop the caret just after the inserted "@agent ".
    const nextCaret = mention.start + agentId.length + 2;
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(suggestions[mentionIndex]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onAttachFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  // Auto-grow the textarea with its content up to MAX_TEXTAREA_PX, then scroll inside. Runs on every
  // value change so it also resyncs after send (clear), paste, and @mention insertion — not just typing.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value]);

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    // Only intercept file pastes (attachments). Text pastes fall through to the native behavior.
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    onAttachFiles(files);
  };

  const handleDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLFormElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    setIsDragActive(false);
    onAttachFiles(files);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <form
        className={cn(
          'relative border-t border-border bg-background/60 backdrop-blur-sm px-4 py-3 transition-colors',
          isDragActive && 'bg-accent-muted/30'
        )}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onSubmit={onSubmit}
      >
        {/* Crabby scuttles along the composer's top edge, using the border as its floor. */}
        {showDeskPet && <PetCompanion pet="crab" className="pet-lane-top" />}

        {draftAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {draftAttachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} onRemove={onRemoveAttachment} />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            {mentionOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-60 overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface-1 shadow-lg z-20">
                {suggestions.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    // onMouseDown (not onClick) so the textarea doesn't blur before we insert.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyMention(id);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                      i === mentionIndex
                        ? 'bg-accent-muted text-accent'
                        : 'text-text-primary hover:bg-surface-2'
                    )}
                  >
                    <ProviderLogo providerId={id} size="sm" />
                    <span className="font-medium">@{id}</span>
                    <span className="ml-auto text-xs text-text-tertiary">{AGENT_LABEL[id]}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className={cn(
                'w-full resize-none rounded-[var(--radius-control)] bg-surface-1 border border-border',
                'px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary',
                'focus:outline-none focus:border-accent-border focus:ring-1 focus:ring-accent-border',
                'min-h-[40px] max-h-[160px] overflow-y-auto'
              )}
              disabled={disabled}
              onChange={(e) => {
                onChange(e.target.value);
                updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                mentionAgents.length > 1
                  ? 'Message… @mention an agent to address it'
                  : 'Type a message...'
              }
              rows={1}
              value={value}
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Paperclip size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach file</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={onStartVoice}
                type="button"
              >
                <Mic size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Switch to voice</TooltipContent>
          </Tooltip>

          {isStreaming ? (
            <Button
              variant="destructive"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={onCancelStreaming}
              type="button"
            >
              <StopCircle size={16} />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 bg-accent hover:bg-accent/90 text-background"
              disabled={disabled || (!value.trim() && draftAttachments.length === 0)}
            >
              <Send size={16} />
            </Button>
          )}
        </div>
      </form>
    </TooltipProvider>
  );
}
