import { type FormEvent, type KeyboardEvent, useRef } from 'react';
import { Mic, Paperclip, Send, StopCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AttachmentChip } from './AttachmentChip';
import type { ChatAttachment } from '@/containers/voice-console/lib/types';

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
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

  return (
    <TooltipProvider delayDuration={300}>
      <form
        className="border-t border-border bg-background/60 backdrop-blur-sm px-4 py-3"
        onSubmit={onSubmit}
      >
        {draftAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {draftAttachments.map((att) => (
              <AttachmentChip key={att.id} attachment={att} onRemove={onRemoveAttachment} />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              className={cn(
                'w-full resize-none rounded-[var(--radius-control)] bg-surface-1 border border-border',
                'px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary',
                'focus:outline-none focus:border-accent-border focus:ring-1 focus:ring-accent-border',
                'min-h-[40px] max-h-[160px]',
              )}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
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
