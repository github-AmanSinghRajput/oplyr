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
  // Cut from 32/44/56. At 32px beside an 11px label this was the heaviest element in a chat row,
  // carrying one word of information.
  const sizeClass =
    size === 'sm'
      ? 'h-[22px] w-[22px] rounded-[5px] p-[3px]'
      : size === 'lg'
        ? 'h-10 w-10 rounded-[var(--radius-control)] p-1.5'
        : 'h-8 w-8 rounded-[6px] p-1';

  return (
    // One signal, not three. The white fill is load-bearing — the OpenAI mark is solid #000000 and
    // would vanish against the dark background — so the border and the shadow go instead.
    <div className={cn('shrink-0 bg-white flex items-center justify-center', sizeClass, className)}>
      <img
        alt=""
        aria-hidden="true"
        className={cn('h-full w-full object-contain', imageClassName)}
        src={providerLogoSrc[providerId]}
      />
    </div>
  );
}
