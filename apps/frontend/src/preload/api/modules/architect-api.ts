/**
 * Architect API operations
 *
 * Exposes IPC methods for AI-powered architectural planning workflow
 * using Claude Agent SDK with extended thinking (Ultra Think mode).
 *
 * IPC Channels:
 * - architect:startInterview - Start a new interview session
 * - architect:sendMessage - Send a message in an ongoing interview
 * - architect:stopInterview - Stop an active interview
 * - architect:streamMessage - Receive streaming messages from AI
 * - architect:interviewComplete - Interview completed
 * - architect:interviewError - Interview error occurred
 * - architect:interviewStopped - Interview was stopped by user
 */

import { createIpcListener, invokeIpc, IpcListenerCleanup } from './ipc-utils';
import type {
  ArchitectInterviewOptions,
  ArchitectStreamMessage,
} from '../../../renderer/components/architect/types/architect.types';
import type { IPCResult } from '../../../shared/types';

// ============================================
// IPC Channel Constants
// ============================================

/**
 * Architect IPC channel names
 * Must match ARCHITECT_IPC_CHANNELS in architect-handler.ts
 */
export const ARCHITECT_CHANNELS = {
  // Request channels (renderer -> main)
  START_INTERVIEW: 'architect:startInterview',
  SEND_MESSAGE: 'architect:sendMessage',
  STOP_INTERVIEW: 'architect:stopInterview',
  GENERATE_SCHEMAS: 'architect:generateSchemas',
  GENERATE_MODULES: 'architect:generateModules',
  GENERATE_TASKS: 'architect:generateTasks',

  // Event channels (main -> renderer)
  STREAM_MESSAGE: 'architect:streamMessage',
  INTERVIEW_COMPLETE: 'architect:interviewComplete',
  INTERVIEW_ERROR: 'architect:interviewError',
  INTERVIEW_STOPPED: 'architect:interviewStopped',
} as const;

// ============================================
// API Interface
// ============================================

/**
 * Architect API interface exposed to renderer process
 */
export interface ArchitectAPI {
  // Interview Operations
  /**
   * Start a new architect interview session
   * @param projectId - The project ID
   * @param options - Interview options including prompt and session info
   * @returns Promise with success/error result
   */
  startInterview: (
    projectId: string,
    options: ArchitectInterviewOptions
  ) => Promise<IPCResult>;

  /**
   * Send a message in an ongoing architect interview
   * @param projectId - The project ID
   * @param options - Message options including prompt and session history
   * @returns Promise with success/error result
   */
  sendMessage: (
    projectId: string,
    options: ArchitectInterviewOptions
  ) => Promise<IPCResult>;

  /**
   * Stop an active architect interview
   * @param sessionId - The session ID to stop
   * @returns Promise with success/error result
   */
  stopInterview: (sessionId: string) => Promise<IPCResult>;

  // Event Listeners
  /**
   * Listen for streaming messages from the AI during interview
   * @param callback - Function called with session ID and stream message
   * @returns Cleanup function to remove the listener
   */
  onStreamMessage: (
    callback: (sessionId: string, message: ArchitectStreamMessage) => void
  ) => IpcListenerCleanup;

  /**
   * Listen for interview completion events
   * @param callback - Function called with session ID and final message
   * @returns Cleanup function to remove the listener
   */
  onInterviewComplete: (
    callback: (sessionId: string, message: ArchitectStreamMessage) => void
  ) => IpcListenerCleanup;

  /**
   * Listen for interview error events
   * @param callback - Function called with session ID and error info
   * @returns Cleanup function to remove the listener
   */
  onInterviewError: (
    callback: (sessionId: string, error: string | ArchitectStreamMessage) => void
  ) => IpcListenerCleanup;

  /**
   * Listen for interview stopped events (user-initiated)
   * @param callback - Function called with session ID
   * @returns Cleanup function to remove the listener
   */
  onInterviewStopped: (
    callback: (sessionId: string) => void
  ) => IpcListenerCleanup;
}

// ============================================
// API Implementation
// ============================================

/**
 * Creates the Architect API implementation
 * Exposes IPC methods for architect interview workflow to the renderer
 */
export const createArchitectAPI = (): ArchitectAPI => ({
  // Interview Operations
  startInterview: (
    projectId: string,
    options: ArchitectInterviewOptions
  ): Promise<IPCResult> =>
    invokeIpc(ARCHITECT_CHANNELS.START_INTERVIEW, projectId, options),

  sendMessage: (
    projectId: string,
    options: ArchitectInterviewOptions
  ): Promise<IPCResult> =>
    invokeIpc(ARCHITECT_CHANNELS.SEND_MESSAGE, projectId, options),

  stopInterview: (sessionId: string): Promise<IPCResult> =>
    invokeIpc(ARCHITECT_CHANNELS.STOP_INTERVIEW, sessionId),

  // Event Listeners
  onStreamMessage: (
    callback: (sessionId: string, message: ArchitectStreamMessage) => void
  ): IpcListenerCleanup =>
    createIpcListener(ARCHITECT_CHANNELS.STREAM_MESSAGE, callback),

  onInterviewComplete: (
    callback: (sessionId: string, message: ArchitectStreamMessage) => void
  ): IpcListenerCleanup =>
    createIpcListener(ARCHITECT_CHANNELS.INTERVIEW_COMPLETE, callback),

  onInterviewError: (
    callback: (sessionId: string, error: string | ArchitectStreamMessage) => void
  ): IpcListenerCleanup =>
    createIpcListener(ARCHITECT_CHANNELS.INTERVIEW_ERROR, callback),

  onInterviewStopped: (
    callback: (sessionId: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(ARCHITECT_CHANNELS.INTERVIEW_STOPPED, callback),
});
