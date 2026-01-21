import { cn } from '../../lib/utils';
import { getUsageBgColor } from '../../lib/usage-colors';

interface UsageProgressBarProps {
  percent: number;
  className?: string;
}

/**
 * Reusable progress bar component for usage display.
 * Uses shared color thresholds from usage-colors utility.
 */
export function UsageProgressBar({ percent, className }: UsageProgressBarProps) {
  return (
    <div className={cn('mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full transition-all', getUsageBgColor(percent))}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}
