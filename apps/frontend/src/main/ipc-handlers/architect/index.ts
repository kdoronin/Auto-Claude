/**
 * Architect IPC handlers module exports
 *
 * This module provides IPC handlers for the AI-powered architecture
 * planning workflow using Claude Agent SDK with extended thinking.
 *
 * Usage:
 * ```typescript
 * import { registerArchitectHandlers } from './architect';
 *
 * // In setupIpcHandlers:
 * registerArchitectHandlers(getMainWindow);
 * ```
 */

export { registerArchitectHandlers, ARCHITECT_IPC_CHANNELS } from './architect-handler';

// Export prompts and configuration for use in other modules
export {
  ARCHITECT_SYSTEM_PROMPT,
  ARCHITECT_CONFIG,
  INTERVIEW_PHASE_PROMPTS,
  SCHEMA_GENERATION_PROMPTS,
  MODULE_DECOMPOSITION_PROMPT,
  TASK_GENERATION_PROMPT,
  SCHEMA_VALIDATION_PROMPT,
  TASK_VALIDATION_PROMPT,
} from './prompts';

export type { InterviewPhase, DiagramType, PermissionMode } from './prompts';
