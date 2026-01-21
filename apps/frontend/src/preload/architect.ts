/**
 * Architect Preload Script Exports
 *
 * This module exposes the Architect IPC API to the renderer process.
 * Used for AI-powered architectural planning workflow with Claude Agent SDK.
 *
 * The architect API provides:
 * - Interview session management (start, send messages, stop)
 * - Streaming message listeners for real-time AI responses
 * - Event listeners for completion, errors, and cancellation
 *
 * Usage in renderer:
 * ```typescript
 * const { architect } = window.electronAPI;
 *
 * // Start an interview
 * await architect.startInterview(projectId, {
 *   prompt: 'Tell me about your project',
 *   sessionId: 'session-123'
 * });
 *
 * // Listen for streaming messages
 * const cleanup = architect.onStreamMessage((sessionId, message) => {
 *   console.log('AI response:', message.content);
 * });
 *
 * // Stop interview
 * await architect.stopInterview('session-123');
 * ```
 *
 * IPC Channels used:
 * - architect:startInterview - via ipcRenderer.invoke
 * - architect:sendMessage - via ipcRenderer.invoke
 * - architect:stopInterview - via ipcRenderer.invoke
 * - architect:streamMessage - via ipcRenderer.on
 * - architect:interviewComplete - via ipcRenderer.on
 * - architect:interviewError - via ipcRenderer.on
 * - architect:interviewStopped - via ipcRenderer.on
 */

// Re-export the Architect API from modules
export {
  ArchitectAPI,
  createArchitectAPI,
  ARCHITECT_CHANNELS,
} from './api/modules/architect-api';
