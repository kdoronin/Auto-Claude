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
