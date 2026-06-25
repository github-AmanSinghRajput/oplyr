import { useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder,
  Mic,
  MessageSquare,
  Terminal,
  GitCompare,
  Settings,
  BrainCircuit,
  Network,
  Pin,
  PinOff
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useNavigation } from '@/providers/NavigationProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { OplyrLogoMark } from '@/components/branding/OplyrLogoMark';
import type { ScreenId } from '@/containers/voice-console/lib/types';

interface NavItemDef {
  id: ScreenId;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItemDef[] = [
  { id: 'workspace', label: 'Workspace', icon: Folder },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'terminal', label: 'Chat', icon: MessageSquare },
  { id: 'shell', label: 'Shell', icon: Terminal },
  { id: 'codebase-map', label: 'Map', icon: Network },
  { id: 'review', label: 'Review', icon: GitCompare },
  { id: 'memory', label: 'Memory', icon: BrainCircuit },
  { id: 'settings', label: 'Settings', icon: Settings }
];

interface SidebarProps {
  badges?: Partial<Record<ScreenId, string | number>>;
}

export function Sidebar({ badges }: SidebarProps) {
  const {
    activeScreen,
    setActiveScreen,
    sidebarExpanded,
    setSidebarExpanded,
    sidebarPinned,
    setSidebarPinned
  } = useNavigation();
  const collapseTimeout = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (collapseTimeout.current) {
      clearTimeout(collapseTimeout.current);
      collapseTimeout.current = null;
    }
    setSidebarExpanded(true);
  }, [setSidebarExpanded]);

  const handleMouseLeave = useCallback(() => {
    if (sidebarPinned) return;
    collapseTimeout.current = window.setTimeout(() => {
      setSidebarExpanded(false);
    }, 150);
  }, [setSidebarExpanded, sidebarPinned]);

  return (
    <TooltipProvider delayDuration={300}>
      <motion.aside
        className={cn(
          'fixed top-0 left-0 h-full z-20',
          'flex flex-col py-3 gap-1',
          'bg-background-elevated/80 backdrop-blur-xl',
          'border-r border-border'
        )}
        animate={{ width: sidebarExpanded ? 240 : 56 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 px-3 h-11 shrink-0 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-surface-1 flex items-center justify-center shrink-0 shadow-sm ring-1 ring-border">
            <OplyrLogoMark className="h-7 w-7" />
          </div>
          <AnimatePresence>
            {sidebarExpanded && (
              <motion.div
                className="flex items-center gap-2 flex-1 overflow-hidden"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
              >
                <span className="text-sm font-semibold text-text-primary whitespace-nowrap">
                  Oplyr
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarPinned(!sidebarPinned)}
                  className={cn(
                    'ml-auto rounded-md p-1.5 transition-colors',
                    sidebarPinned
                      ? 'text-accent bg-accent-muted'
                      : 'text-text-tertiary hover:text-text-primary'
                  )}
                  aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                  aria-pressed={sidebarPinned}
                >
                  {sidebarPinned ? <Pin size={14} /> : <PinOff size={14} />}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5 px-2 flex-1 mt-2">
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            const Icon = item.icon;
            const badge = badges?.[item.id];

            const button = (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                className={cn(
                  'flex items-center gap-3 w-full rounded-[var(--radius-control)] h-10 px-2',
                  'transition-colors duration-150 overflow-hidden',
                  'hover:bg-surface-2',
                  isActive && 'bg-accent-muted text-accent',
                  !isActive && 'text-text-secondary hover:text-text-primary'
                )}
                type="button"
              >
                <Icon size={18} className="shrink-0" />
                <AnimatePresence>
                  {sidebarExpanded && (
                    <motion.span
                      className="text-sm font-medium whitespace-nowrap overflow-hidden flex-1 text-left"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {badge != null && sidebarExpanded && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {badge}
                  </Badge>
                )}
              </button>
            );

            if (!sidebarExpanded) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.id}>{button}</div>;
          })}
        </nav>
      </motion.aside>
    </TooltipProvider>
  );
}
