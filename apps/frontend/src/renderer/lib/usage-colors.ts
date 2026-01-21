/**
 * Shared usage color utilities for consistent threshold-based coloring.
 *
 * Color thresholds:
 * - Green: 0-70%
 * - Yellow: 71-90%
 * - Orange: 91-94%
 * - Red: 95%+
 *
 * These thresholds apply consistently across all usage types (session, weekly, sonnet).
 */

// Threshold constants for easy maintenance
export const USAGE_THRESHOLDS = {
  RED: 95,
  ORANGE: 91,
  YELLOW: 71,
} as const;

/**
 * Get the background color class for a usage percentage.
 */
export function getUsageBgColor(percent: number): string {
  if (percent >= USAGE_THRESHOLDS.RED) return 'bg-red-500';
  if (percent >= USAGE_THRESHOLDS.ORANGE) return 'bg-orange-500';
  if (percent >= USAGE_THRESHOLDS.YELLOW) return 'bg-yellow-500';
  return 'bg-green-500';
}

/**
 * Get the text color class for a usage percentage.
 */
export function getUsageTextColor(percent: number): string {
  if (percent >= USAGE_THRESHOLDS.RED) return 'text-red-500';
  if (percent >= USAGE_THRESHOLDS.ORANGE) return 'text-orange-500';
  if (percent >= USAGE_THRESHOLDS.YELLOW) return 'text-yellow-500';
  return 'text-green-500';
}

/**
 * Get the full color classes for badge/indicator styling (text + background + border).
 */
export function getUsageBadgeClasses(percent: number): string {
  if (percent >= USAGE_THRESHOLDS.RED) {
    return 'text-red-500 bg-red-500/10 border-red-500/20';
  }
  if (percent >= USAGE_THRESHOLDS.ORANGE) {
    return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
  }
  if (percent >= USAGE_THRESHOLDS.YELLOW) {
    return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
  }
  return 'text-green-500 bg-green-500/10 border-green-500/20';
}

/**
 * Determine if usage is at a critical level (orange or red).
 */
export function isUsageCritical(percent: number): boolean {
  return percent >= USAGE_THRESHOLDS.ORANGE;
}

/**
 * Determine if usage is at a warning level (yellow or higher).
 */
export function isUsageWarning(percent: number): boolean {
  return percent >= USAGE_THRESHOLDS.YELLOW;
}
