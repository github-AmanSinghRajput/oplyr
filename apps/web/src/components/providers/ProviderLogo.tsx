import { cn } from '@/lib/cn';
import type { AssistantProviderId } from '@/containers/voice-console/lib/types';

const providerLogoSrc: Record<AssistantProviderId, string> = {
  codex: '/provider-logos/openai.svg',
  claude: '/provider-logos/anthropic.svg',
  gemini: '/provider-logos/gemini.svg'
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
