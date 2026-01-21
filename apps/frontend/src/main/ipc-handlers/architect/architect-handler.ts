/**
 * Architect IPC handlers - Claude SDK integration for AI-powered architecture sessions
 *
 * Uses Claude Agent SDK with extended thinking (Ultra Think mode) for deep
 * architectural planning interviews. Messages are streamed back to the renderer
 * for real-time display.
 *
 * CRITICAL: query() returns an async generator - must use for await...of
 */

import { ipcMain } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  ArchitectInterviewOptions,
  ArchitectStreamMessage,
  InterviewMessage,
} from '../../../renderer/components/architect/types/architect.types';
import { safeSendToRenderer } from '../utils';
import { debugLog, debugError } from '../../../shared/utils/debug-logger';
import { projectStore } from '../../project-store';
import { ARCHITECT_SYSTEM_PROMPT, ARCHITECT_CONFIG } from './prompts';

// ============================================
// IPC Channel Names for Architect
// ============================================

export const ARCHITECT_IPC_CHANNELS = {
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
// Active Interview Tracking
// ============================================

// Track active interview sessions to support cancellation
const activeInterviews = new Map<string, AbortController>();

// ============================================
// Handler Registration
// ============================================

/**
 * Register all architect-related IPC handlers
 */
export function registerArchitectHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  // Start a new interview session
  ipcMain.handle(
    ARCHITECT_IPC_CHANNELS.START_INTERVIEW,
    async (
      event: IpcMainInvokeEvent,
      projectId: string,
      options: ArchitectInterviewOptions
    ) => {
      debugLog('[Architect Handler] Starting interview:', {
        projectId,
        sessionId: options.sessionId,
        hasHistory: !!options.sessionHistory?.length,
      });

      const project = projectStore.getProject(projectId);
      if (!project) {
        safeSendToRenderer(
          getMainWindow,
          ARCHITECT_IPC_CHANNELS.INTERVIEW_ERROR,
          options.sessionId,
          'Project not found'
        );
        return { success: false, error: 'Project not found' };
      }

      // Create abort controller for this session
      const abortController = new AbortController();
      activeInterviews.set(options.sessionId, abortController);

      try {
        await runArchitectInterview(
          event,
          options,
          getMainWindow,
          abortController.signal
        );
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        debugError('[Architect Handler] Interview error:', errorMessage);

        // Don't send error if it was an abort
        if (!abortController.signal.aborted) {
          safeSendToRenderer(
            getMainWindow,
            ARCHITECT_IPC_CHANNELS.INTERVIEW_ERROR,
            options.sessionId,
            errorMessage
          );
        }

        return { success: false, error: errorMessage };
      } finally {
        activeInterviews.delete(options.sessionId);
      }
    }
  );

  // Send a message in an ongoing interview
  ipcMain.handle(
    ARCHITECT_IPC_CHANNELS.SEND_MESSAGE,
    async (
      event: IpcMainInvokeEvent,
      projectId: string,
      options: ArchitectInterviewOptions
    ) => {
      debugLog('[Architect Handler] Sending message:', {
        projectId,
        sessionId: options.sessionId,
        promptLength: options.prompt.length,
      });

      const project = projectStore.getProject(projectId);
      if (!project) {
        safeSendToRenderer(
          getMainWindow,
          ARCHITECT_IPC_CHANNELS.INTERVIEW_ERROR,
          options.sessionId,
          'Project not found'
        );
        return { success: false, error: 'Project not found' };
      }

      // Create abort controller for this message
      const abortController = new AbortController();
      activeInterviews.set(options.sessionId, abortController);

      try {
        await runArchitectInterview(
          event,
          options,
          getMainWindow,
          abortController.signal
        );
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        debugError('[Architect Handler] Message error:', errorMessage);

        if (!abortController.signal.aborted) {
          safeSendToRenderer(
            getMainWindow,
            ARCHITECT_IPC_CHANNELS.INTERVIEW_ERROR,
            options.sessionId,
            errorMessage
          );
        }

        return { success: false, error: errorMessage };
      } finally {
        activeInterviews.delete(options.sessionId);
      }
    }
  );

  // Stop an active interview
  ipcMain.handle(
    ARCHITECT_IPC_CHANNELS.STOP_INTERVIEW,
    async (_event: IpcMainInvokeEvent, sessionId: string) => {
      debugLog('[Architect Handler] Stopping interview:', { sessionId });

      const controller = activeInterviews.get(sessionId);
      if (controller) {
        controller.abort();
        activeInterviews.delete(sessionId);

        safeSendToRenderer(
          getMainWindow,
          ARCHITECT_IPC_CHANNELS.INTERVIEW_STOPPED,
          sessionId
        );

        return { success: true };
      }

      return { success: false, error: 'No active interview found' };
    }
  );

  debugLog('[Architect Handler] All handlers registered');
}

// ============================================
// Interview Execution
// ============================================

/**
 * Run the architect interview using Claude SDK
 *
 * CRITICAL: query() returns an async generator - must use for await...of
 * to properly iterate over streaming messages.
 */
async function runArchitectInterview(
  _event: IpcMainInvokeEvent,
  options: ArchitectInterviewOptions,
  getMainWindow: () => BrowserWindow | null,
  signal: AbortSignal
): Promise<void> {
  const { prompt, sessionHistory, sessionId } = options;

  // Build conversation context from history
  const conversationContext = buildConversationContext(sessionHistory);

  // Combine history context with new prompt
  const fullPrompt = conversationContext
    ? `${conversationContext}\n\nUser: ${prompt}`
    : prompt;

  debugLog('[Architect Handler] Running interview query:', {
    sessionId,
    historyLength: sessionHistory?.length ?? 0,
    promptLength: fullPrompt.length,
  });

  // Track accumulated content for the current message
  let accumulatedContent = '';
  let accumulatedThinking = '';

  // CRITICAL: query() returns an async generator - must use for await...of
  for await (const message of query({
    prompt: fullPrompt,
    options: {
      systemPrompt: {
        type: 'preset',
        preset: ARCHITECT_CONFIG.systemPromptPreset,
        append: ARCHITECT_SYSTEM_PROMPT,
      },
      maxThinkingTokens: ARCHITECT_CONFIG.maxThinkingTokens, // Ultra Think mode (~32k thinking tokens)
      permissionMode: ARCHITECT_CONFIG.permissionMode, // No file modifications, planning only
      settingSources: [...ARCHITECT_CONFIG.settingSources],
    },
  })) {
    // Check for abort
    if (signal.aborted) {
      debugLog('[Architect Handler] Interview aborted:', { sessionId });
      return;
    }

    // Process different message types from the SDK
    if (message.type === 'assistant') {
      // Assistant response - may be streamed in chunks
      const content = extractContent(message);
      if (content) {
        accumulatedContent += content;

        // Stream partial message to renderer
        const streamMessage: ArchitectStreamMessage = {
          type: 'assistant',
          content: accumulatedContent,
          sessionId,
          timestamp: new Date(),
        };

        safeSendToRenderer(
          getMainWindow,
          ARCHITECT_IPC_CHANNELS.STREAM_MESSAGE,
          sessionId,
          streamMessage
        );
      }
    } else if (message.type === 'thinking') {
      // Extended thinking content
      const thinking = extractThinking(message);
      if (thinking) {
        accumulatedThinking += thinking;

        // Stream thinking to renderer
        const streamMessage: ArchitectStreamMessage = {
          type: 'thinking',
          content: accumulatedThinking,
          sessionId,
          timestamp: new Date(),
        };

        safeSendToRenderer(
          getMainWindow,
          ARCHITECT_IPC_CHANNELS.STREAM_MESSAGE,
          sessionId,
          streamMessage
        );
      }
    } else if (message.type === 'result') {
      // Final result - send completion
      debugLog('[Architect Handler] Interview complete:', {
        sessionId,
        contentLength: accumulatedContent.length,
        thinkingLength: accumulatedThinking.length,
      });

      const doneMessage: ArchitectStreamMessage = {
        type: 'done',
        content: accumulatedContent,
        sessionId,
        timestamp: new Date(),
      };

      safeSendToRenderer(
        getMainWindow,
        ARCHITECT_IPC_CHANNELS.INTERVIEW_COMPLETE,
        sessionId,
        doneMessage
      );
    } else if (message.type === 'error') {
      // Error from SDK
      const errorContent = extractError(message);
      debugError('[Architect Handler] SDK error:', { sessionId, error: errorContent });

      const errorMessage: ArchitectStreamMessage = {
        type: 'error',
        content: errorContent,
        sessionId,
        timestamp: new Date(),
      };

      safeSendToRenderer(
        getMainWindow,
        ARCHITECT_IPC_CHANNELS.INTERVIEW_ERROR,
        sessionId,
        errorMessage
      );
    }
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Build conversation context from session history
 */
function buildConversationContext(history?: InterviewMessage[]): string {
  if (!history || history.length === 0) {
    return '';
  }

  return history
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    })
    .join('\n\n');
}

/**
 * Extract content from SDK message
 */
function extractContent(message: unknown): string {
  if (typeof message === 'object' && message !== null) {
    const msg = message as Record<string, unknown>;

    // Handle different content structures from SDK
    if (typeof msg.content === 'string') {
      return msg.content;
    }

    if (Array.isArray(msg.content)) {
      return msg.content
        .map((block) => {
          if (typeof block === 'string') return block;
          if (typeof block === 'object' && block !== null) {
            const b = block as Record<string, unknown>;
            if (b.type === 'text' && typeof b.text === 'string') {
              return b.text;
            }
          }
          return '';
        })
        .join('');
    }

    if (typeof msg.text === 'string') {
      return msg.text;
    }
  }

  return '';
}

/**
 * Extract thinking content from SDK message
 */
function extractThinking(message: unknown): string {
  if (typeof message === 'object' && message !== null) {
    const msg = message as Record<string, unknown>;

    if (typeof msg.thinking === 'string') {
      return msg.thinking;
    }

    if (Array.isArray(msg.content)) {
      return msg.content
        .map((block) => {
          if (typeof block === 'object' && block !== null) {
            const b = block as Record<string, unknown>;
            if (b.type === 'thinking' && typeof b.thinking === 'string') {
              return b.thinking;
            }
          }
          return '';
        })
        .join('');
    }
  }

  return '';
}

/**
 * Extract error message from SDK error
 */
function extractError(message: unknown): string {
  if (typeof message === 'object' && message !== null) {
    const msg = message as Record<string, unknown>;

    if (typeof msg.error === 'string') {
      return msg.error;
    }

    if (typeof msg.message === 'string') {
      return msg.message;
    }

    if (msg.error && typeof msg.error === 'object') {
      const err = msg.error as Record<string, unknown>;
      if (typeof err.message === 'string') {
        return err.message;
      }
    }
  }

  return 'Unknown error occurred';
}
