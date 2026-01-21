/**
 * useArchitectSession hook for session management
 *
 * Manages architect interview sessions with IPC communication to Claude SDK.
 * Handles session lifecycle, message streaming, and error states.
 *
 * Follows patterns from:
 * - useIdeation.ts for IPC communication
 * - useIdeationAuth.ts for auth checking
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../hooks/use-toast';
import { useIdeationAuth } from '../../ideation/hooks/useIdeationAuth';
import {
  useArchitectStore,
  startArchitectSession,
  loadArchitectSession,
  deleteArchitectSession,
  saveArchitectSession,
} from '../../../stores/architect';
import type {
  ArchitectSession,
  ArchitectSessionSummary,
  InterviewMessage,
  ArchitectStreamMessage,
  SessionStatus,
} from '../types/architect.types';

// ============================================
// Types
// ============================================

interface UseArchitectSessionOptions {
  /** Project ID for the architect session */
  projectId: string;
  /** Callback when navigating to a task */
  onNavigateToTask?: (taskId: string) => void;
}

interface UseArchitectSessionReturn {
  // State
  session: ArchitectSession | null;
  sessions: ArchitectSessionSummary[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  hasToken: boolean | null;
  isCheckingToken: boolean;

  // Session actions
  startSession: (projectName: string, projectDescription?: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  saveSession: () => Promise<void>;
  clearSession: () => void;

  // Message actions
  sendMessage: (content: string) => Promise<void>;
  stopInterview: () => Promise<void>;

  // Status actions
  transitionStatus: (status: SessionStatus) => void;

  // Error handling
  clearError: () => void;

  // Auth
  checkAuth: () => Promise<void>;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for managing architect interview sessions
 *
 * @param options - Configuration options
 * @returns Session state and actions
 */
export function useArchitectSession(
  options: UseArchitectSessionOptions
): UseArchitectSessionReturn {
  const { projectId, onNavigateToTask } = options;
  const { t } = useTranslation(['common', 'errors']);

  // Auth state
  const { hasToken, isLoading: isCheckingToken, checkAuth } = useIdeationAuth();

  // Environment config modal state (for when no token)
  const [showEnvConfigModal, setShowEnvConfigModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'startSession' | 'sendMessage' | null>(null);

  // Pending action data
  const pendingStartDataRef = useRef<{
    projectName: string;
    projectDescription?: string;
  } | null>(null);
  const pendingMessageRef = useRef<string | null>(null);

  // Store state
  const session = useArchitectStore((state) => state.currentSession);
  const sessions = useArchitectStore((state) => state.sessions);
  const isLoading = useArchitectStore((state) => state.isLoading);
  const isStreaming = useArchitectStore((state) => state.isStreaming);
  const error = useArchitectStore((state) => state.error);
  const handleStreamMessage = useArchitectStore((state) => state.handleStreamMessage);
  const setError = useArchitectStore((state) => state.setError);
  const clearErrorStore = useArchitectStore((state) => state.clearError);
  const clearCurrentSession = useArchitectStore((state) => state.clearCurrentSession);
  const transitionStatusStore = useArchitectStore((state) => state.transitionStatus);

  // ============================================
  // IPC Listeners Setup
  // ============================================

  useEffect(() => {
    // Check if electronAPI is available
    if (!window.electronAPI?.architect) {
      return;
    }

    const api = window.electronAPI.architect;

    // Set up streaming message listener
    const cleanupStreamMessage = api.onStreamMessage(
      (sessionId: string, message: ArchitectStreamMessage) => {
        // Only process messages for the current session
        if (session?.id !== sessionId) return;

        if (message.type === 'assistant' || message.type === 'thinking') {
          handleStreamMessage({
            content: message.content || '',
            thinking: message.type === 'thinking' ? message.content : undefined,
            isStreaming: true,
          });
        }
      }
    );

    // Set up interview complete listener
    const cleanupComplete = api.onInterviewComplete(
      (sessionId: string, message: ArchitectStreamMessage) => {
        // Only process messages for the current session
        if (session?.id !== sessionId) return;

        // Mark the last message as complete (not streaming)
        handleStreamMessage({
          content: message.content || '',
          isStreaming: false,
        });
      }
    );

    // Set up interview error listener
    const cleanupError = api.onInterviewError(
      (sessionId: string, errorData: string | ArchitectStreamMessage) => {
        // Only process errors for the current session
        if (session?.id !== sessionId) return;

        const errorMessage =
          typeof errorData === 'string'
            ? errorData
            : errorData.content || 'Unknown error occurred';

        setError(errorMessage);

        toast({
          variant: 'destructive',
          title: t('errors:architect.interviewError'),
          description: errorMessage,
        });
      }
    );

    // Set up interview stopped listener
    const cleanupStopped = api.onInterviewStopped((sessionId: string) => {
      // Only process for the current session
      if (session?.id !== sessionId) return;

      // Mark streaming as complete
      handleStreamMessage({
        isStreaming: false,
      });

      toast({
        title: t('common:actions.stopped'),
        description: t('common:architect.interviewStopped'),
      });
    });

    // Cleanup on unmount
    return () => {
      cleanupStreamMessage();
      cleanupComplete();
      cleanupError();
      cleanupStopped();
    };
  }, [session?.id, handleStreamMessage, setError, t]);

  // ============================================
  // Session Actions
  // ============================================

  /**
   * Start a new architect session
   */
  const startSession = useCallback(
    async (projectName: string, projectDescription?: string) => {
      // Check for auth token first
      if (hasToken === false) {
        pendingStartDataRef.current = { projectName, projectDescription };
        setPendingAction('startSession');
        setShowEnvConfigModal(true);
        return;
      }

      try {
        await startArchitectSession(projectName, projectDescription);

        // Get the newly created session
        const newSession = useArchitectStore.getState().currentSession;
        if (!newSession) {
          throw new Error('Failed to create session');
        }

        // Start the interview via IPC
        if (window.electronAPI?.architect) {
          const result = await window.electronAPI.architect.startInterview(projectId, {
            prompt: `Starting architect interview for project: ${projectName}. ${projectDescription || ''}`,
            sessionId: newSession.id,
          });

          if (!result.success) {
            setError(result.error || 'Failed to start interview');
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start session';
        setError(message);
        toast({
          variant: 'destructive',
          title: t('errors:architect.sessionStartFailed'),
          description: message,
        });
      }
    },
    [hasToken, projectId, setError, t]
  );

  /**
   * Load an existing session
   */
  const loadSession = useCallback(
    async (sessionId: string) => {
      try {
        await loadArchitectSession(sessionId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load session';
        setError(message);
        toast({
          variant: 'destructive',
          title: t('errors:architect.sessionLoadFailed'),
          description: message,
        });
      }
    },
    [setError, t]
  );

  /**
   * Delete a session
   */
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await deleteArchitectSession(sessionId);
        toast({
          title: t('common:actions.deleted'),
          description: t('common:architect.sessionDeleted'),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete session';
        setError(message);
        toast({
          variant: 'destructive',
          title: t('errors:architect.sessionDeleteFailed'),
          description: message,
        });
      }
    },
    [setError, t]
  );

  /**
   * Save the current session
   */
  const saveSession = useCallback(async () => {
    try {
      await saveArchitectSession();
      toast({
        title: t('common:actions.saved'),
        description: t('common:architect.sessionSaved'),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save session';
      setError(message);
      toast({
        variant: 'destructive',
        title: t('errors:architect.sessionSaveFailed'),
        description: message,
      });
    }
  }, [setError, t]);

  /**
   * Clear the current session
   */
  const clearSession = useCallback(() => {
    clearCurrentSession();
  }, [clearCurrentSession]);

  // ============================================
  // Message Actions
  // ============================================

  /**
   * Send a message in the current interview
   */
  const sendMessage = useCallback(
    async (content: string) => {
      // Check for auth token first
      if (hasToken === false) {
        pendingMessageRef.current = content;
        setPendingAction('sendMessage');
        setShowEnvConfigModal(true);
        return;
      }

      if (!session) {
        setError('No active session');
        return;
      }

      try {
        // Add user message to store
        const store = useArchitectStore.getState();
        await store.addMessage(content);

        // Send message via IPC
        if (window.electronAPI?.architect) {
          const result = await window.electronAPI.architect.sendMessage(projectId, {
            prompt: content,
            sessionId: session.id,
            sessionHistory: session.interviewHistory,
          });

          if (!result.success) {
            setError(result.error || 'Failed to send message');
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);
        toast({
          variant: 'destructive',
          title: t('errors:architect.messageSendFailed'),
          description: message,
        });
      }
    },
    [hasToken, session, projectId, setError, t]
  );

  /**
   * Stop the current interview
   */
  const stopInterview = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      if (window.electronAPI?.architect) {
        const result = await window.electronAPI.architect.stopInterview(session.id);
        if (!result.success) {
          setError(result.error || 'Failed to stop interview');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop interview';
      setError(message);
    }
  }, [session, setError]);

  // ============================================
  // Status Actions
  // ============================================

  /**
   * Transition session to a new status
   */
  const transitionStatus = useCallback(
    (status: SessionStatus) => {
      transitionStatusStore(status);
    },
    [transitionStatusStore]
  );

  // ============================================
  // Error Handling
  // ============================================

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    clearErrorStore();
  }, [clearErrorStore]);

  // ============================================
  // Auth Handling
  // ============================================

  /**
   * Handle environment configuration complete
   * Retry pending action if any
   */
  useEffect(() => {
    // When hasToken becomes true and we have a pending action, execute it
    if (hasToken === true && pendingAction) {
      if (pendingAction === 'startSession' && pendingStartDataRef.current) {
        const { projectName, projectDescription } = pendingStartDataRef.current;
        pendingStartDataRef.current = null;
        setPendingAction(null);
        startSession(projectName, projectDescription);
      } else if (pendingAction === 'sendMessage' && pendingMessageRef.current) {
        const message = pendingMessageRef.current;
        pendingMessageRef.current = null;
        setPendingAction(null);
        sendMessage(message);
      }
    }
  }, [hasToken, pendingAction, startSession, sendMessage]);

  // ============================================
  // Return
  // ============================================

  return {
    // State
    session,
    sessions,
    isLoading,
    isStreaming,
    error,
    hasToken,
    isCheckingToken,

    // Session actions
    startSession,
    loadSession,
    deleteSession,
    saveSession,
    clearSession,

    // Message actions
    sendMessage,
    stopInterview,

    // Status actions
    transitionStatus,

    // Error handling
    clearError,

    // Auth
    checkAuth,
  };
}

// ============================================
// Helper Hooks
// ============================================

/**
 * Hook to set up IPC listeners for architect events
 * Separate from useArchitectSession for use in global context
 */
export function useArchitectListeners(): () => void {
  useEffect(() => {
    // Check if electronAPI is available
    if (!window.electronAPI?.architect) {
      return () => {};
    }

    const api = window.electronAPI.architect;
    const store = useArchitectStore.getState();

    // Set up streaming message listener
    const cleanupStreamMessage = api.onStreamMessage(
      (sessionId: string, message: ArchitectStreamMessage) => {
        const currentSession = useArchitectStore.getState().currentSession;
        if (currentSession?.id !== sessionId) return;

        store.handleStreamMessage({
          content: message.content || '',
          thinking: message.type === 'thinking' ? message.content : undefined,
          isStreaming: true,
        });
      }
    );

    // Set up interview complete listener
    const cleanupComplete = api.onInterviewComplete(
      (sessionId: string, message: ArchitectStreamMessage) => {
        const currentSession = useArchitectStore.getState().currentSession;
        if (currentSession?.id !== sessionId) return;

        store.handleStreamMessage({
          content: message.content || '',
          isStreaming: false,
        });
      }
    );

    // Set up interview error listener
    const cleanupError = api.onInterviewError(
      (sessionId: string, errorData: string | ArchitectStreamMessage) => {
        const currentSession = useArchitectStore.getState().currentSession;
        if (currentSession?.id !== sessionId) return;

        const errorMessage =
          typeof errorData === 'string'
            ? errorData
            : errorData.content || 'Unknown error occurred';

        store.setError(errorMessage);
      }
    );

    // Set up interview stopped listener
    const cleanupStopped = api.onInterviewStopped((sessionId: string) => {
      const currentSession = useArchitectStore.getState().currentSession;
      if (currentSession?.id !== sessionId) return;

      store.handleStreamMessage({
        isStreaming: false,
      });
    });

    // Return cleanup function
    return () => {
      cleanupStreamMessage();
      cleanupComplete();
      cleanupError();
      cleanupStopped();
    };
  }, []);

  // Return a no-op cleanup (actual cleanup is handled internally)
  return () => {};
}

export default useArchitectSession;
