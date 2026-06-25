import { X, File } from 'lucide-react';
import type { ChatAttachment } from '@/containers/voice-console/lib/types';

interface AttachmentChipProps {
  attachment: ChatAttachment;
  onRemove: (id: string) => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border text-xs text-text-secondary">
      <File size={12} />
      <span className="truncate max-w-[120px]">{attachment.name}</span>
      <button
        className="hover:text-danger transition-colors"
        onClick={() => onRemove(attachment.id)}
        type="button"
      >
        <X size={12} />
      </button>
    </span>
  );
}
