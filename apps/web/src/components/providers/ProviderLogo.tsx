import { cn } from '@/lib/cn';
import type { AssistantProviderId } from '@/containers/voice-console/lib/types';
// Import as modules so Vite emits base-relative hashed URLs. Absolute "/provider-logos/…" paths
// break under file:// in the packaged app (they resolve to the disk root → blank white logos).
import openaiLogo from '@/assets/provider-logos/openai.svg';
import anthropicLogo from '@/assets/provider-logos/anthropic.svg';
import geminiLogo from '@/assets/provider-logos/gemini.svg';

const providerLogoSrc: Record<AssistantProviderId, string> = {
  codex: openaiLogo,
  claude: anthropicLogo,
  gemini: geminiLogo
};

export function ProviderLogo({
  providerId,
  size = 'md',
  className,
  imageClassName
}: {
  providerId: AssistantProviderId;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  imageClassName?: string;
}) {
  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 rounded-lg p-1'
      : size === 'lg'
        ? 'h-14 w-14 rounded-2xl p-2'
        : 'h-11 w-11 rounded-xl p-1.5';

  return (
    <div
      className={cn(
        'shrink-0 border border-border/70 bg-white flex items-center justify-center shadow-sm',
        sizeClass,
        className
      )}
    >
      <img
        alt=""
        aria-hidden="true"
        className={cn('h-full w-full object-contain', imageClassName)}
        src={providerLogoSrc[providerId]}
      />
    </div>
  );
}
