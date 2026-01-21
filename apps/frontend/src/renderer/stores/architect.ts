/**
 * Zustand store for Architect feature state management
 * Handles AI-powered architectural planning sessions with persistence
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ArchitectSession,
  ArchitectSessionSummary,
  ArchitectSchema,
  ModuleDefinition,
  ArchitectTask,
  InterviewMessage,
  SessionStatus,
  ArchitectState,
  ArchitectActions,
  ArchitectStore
} from '../components/architect/types/architect.types';

// Helper to generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to create session summary from full session
function toSessionSummary(session: ArchitectSession): ArchitectSessionSummary {
  return {
    id: session.id,
    projectName: session.projectName,
    status: session.status,
    schemaCount: session.schemas.length,
    moduleCount: session.modules.length,
    taskCount: session.tasks.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

/**
 * Rehydrate a full session from storage, converting date strings back to Date objects.
 * This is needed because JSON storage serializes dates as strings.
 */
function rehydrateSession(session: ArchitectSession): ArchitectSession {
  return {
    ...session,
    createdAt: session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt),
    updatedAt: session.updatedAt instanceof Date ? session.updatedAt : new Date(session.updatedAt),
    interviewHistory: session.interviewHistory.map(msg => ({
      ...msg,
      timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)
    })),
    schemas: session.schemas.map(schema => ({
      ...schema,
      createdAt: schema.createdAt instanceof Date ? schema.createdAt : new Date(schema.createdAt),
      updatedAt: schema.updatedAt instanceof Date ? schema.updatedAt : new Date(schema.updatedAt)
    }))
  };
}

/**
 * Rehydrate a session summary from storage, converting date strings back to Date objects.
 */
function rehydrateSummary(summary: ArchitectSessionSummary): ArchitectSessionSummary {
  return {
    ...summary,
    createdAt: summary.createdAt instanceof Date ? summary.createdAt : new Date(summary.createdAt),
    updatedAt: summary.updatedAt instanceof Date ? summary.updatedAt : new Date(summary.updatedAt)
  };
}

/**
 * Maximum number of messages to persist in localStorage.
 * Very large conversation histories should be truncated to avoid localStorage limits.
 * Messages beyond this limit are preserved in memory during the session but not persisted.
 */
const MAX_PERSISTED_MESSAGES = 500;

// Initial state
const initialState: ArchitectState = {
  sessions: [],
  currentSession: null,
  isLoading: false,
  error: null,
  isStreaming: false
};

/**
 * Architect store with persist middleware for session persistence
 */
export const useArchitectStore = create<ArchitectStore>()(
  persist(
    (set, get) => ({
      // Initial state
      ...initialState,

      // Actions

      /**
       * Start a new architect session
       */
      startSession: async (projectName: string, projectDescription?: string) => {
        set({ isLoading: true, error: null });

        try {
          const newSession: ArchitectSession = {
            id: generateId(),
            projectName,
            projectDescription,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'interview',
            interviewHistory: [],
            schemas: [],
            modules: [],
            tasks: [],
            isDirty: false
          };

          const summary = toSessionSummary(newSession);

          set((state) => ({
            sessions: [summary, ...state.sessions],
            currentSession: newSession,
            isLoading: false
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to start session',
            isLoading: false
          });
        }
      },

      /**
       * Load an existing session by ID
       */
      loadSession: async (sessionId: string) => {
        set({ isLoading: true, error: null });

        try {
          // In a full implementation, this would load from file storage
          // For now, we'll check if session exists in summaries
          const { sessions } = get();
          const sessionSummary = sessions.find(s => s.id === sessionId);

          if (!sessionSummary) {
            throw new Error(`Session ${sessionId} not found`);
          }

          // TODO: Load full session data from file storage via IPC
          // For now, create a placeholder that will be populated
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load session',
            isLoading: false
          });
        }
      },

      /**
       * Delete a session
       */
      deleteSession: async (sessionId: string) => {
        set({ isLoading: true, error: null });

        try {
          set((state) => {
            const newSessions = state.sessions.filter(s => s.id !== sessionId);
            const shouldClearCurrent = state.currentSession?.id === sessionId;

            return {
              sessions: newSessions,
              currentSession: shouldClearCurrent ? null : state.currentSession,
              isLoading: false
            };
          });

          // TODO: Delete session files via IPC
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete session',
            isLoading: false
          });
        }
      },

      /**
       * Add a user message to the interview
       */
      addMessage: async (content: string) => {
        const { currentSession } = get();
        if (!currentSession) {
          set({ error: 'No active session' });
          return;
        }

        const userMessage: InterviewMessage = {
          id: generateId(),
          role: 'user',
          content,
          timestamp: new Date()
        };

        set((state) => {
          if (!state.currentSession) return state;

          const updatedSession: ArchitectSession = {
            ...state.currentSession,
            interviewHistory: [...state.currentSession.interviewHistory, userMessage],
            updatedAt: new Date(),
            isDirty: true
          };

          return {
            currentSession: updatedSession,
            isStreaming: true
          };
        });

        // TODO: Trigger IPC call to Claude SDK for response
        // The response will be handled via handleStreamMessage
      },

      /**
       * Handle incoming streamed message from AI
       */
      handleStreamMessage: (message: Partial<InterviewMessage>) => {
        set((state) => {
          if (!state.currentSession) return state;

          const existingHistory = state.currentSession.interviewHistory;
          const lastMessage = existingHistory[existingHistory.length - 1];

          // If last message is from assistant and is still streaming, update it
          if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
            const updatedMessage: InterviewMessage = {
              ...lastMessage,
              content: (lastMessage.content || '') + (message.content || ''),
              thinking: message.thinking ? (lastMessage.thinking || '') + message.thinking : lastMessage.thinking,
              isStreaming: message.isStreaming !== false
            };

            return {
              currentSession: {
                ...state.currentSession,
                interviewHistory: [...existingHistory.slice(0, -1), updatedMessage],
                isDirty: true
              },
              isStreaming: message.isStreaming !== false
            };
          }

          // Create new assistant message
          const newMessage: InterviewMessage = {
            id: generateId(),
            role: 'assistant',
            content: message.content || '',
            timestamp: new Date(),
            thinking: message.thinking,
            isStreaming: message.isStreaming !== false
          };

          return {
            currentSession: {
              ...state.currentSession,
              interviewHistory: [...existingHistory, newMessage],
              isDirty: true
            },
            isStreaming: message.isStreaming !== false
          };
        });
      },

      /**
       * Update a schema's content
       */
      updateSchema: (schemaId: string, content: string) => {
        set((state) => {
          if (!state.currentSession) return state;

          const updatedSchemas = state.currentSession.schemas.map(schema =>
            schema.id === schemaId
              ? {
                  ...schema,
                  mermaidCode: content,
                  version: schema.version + 1,
                  updatedAt: new Date()
                }
              : schema
          );

          return {
            currentSession: {
              ...state.currentSession,
              schemas: updatedSchemas,
              updatedAt: new Date(),
              isDirty: true
            }
          };
        });
      },

      /**
       * Validate a module
       */
      validateModule: (moduleId: string, notes?: string) => {
        set((state) => {
          if (!state.currentSession) return state;

          const updatedModules = state.currentSession.modules.map(module =>
            module.id === moduleId
              ? {
                  ...module,
                  isValidated: true,
                  validationNotes: notes
                }
              : module
          );

          return {
            currentSession: {
              ...state.currentSession,
              modules: updatedModules,
              updatedAt: new Date(),
              isDirty: true
            }
          };
        });
      },

      /**
       * Update a task before export
       */
      updateTask: (taskId: string, updates: Partial<ArchitectTask>) => {
        set((state) => {
          if (!state.currentSession) return state;

          const updatedTasks = state.currentSession.tasks.map(task =>
            task.id === taskId
              ? { ...task, ...updates }
              : task
          );

          return {
            currentSession: {
              ...state.currentSession,
              tasks: updatedTasks,
              updatedAt: new Date(),
              isDirty: true
            }
          };
        });
      },

      /**
       * Validate a task
       */
      validateTask: (taskId: string) => {
        set((state) => {
          if (!state.currentSession) return state;

          const updatedTasks = state.currentSession.tasks.map(task =>
            task.id === taskId
              ? { ...task, status: 'validated' as const }
              : task
          );

          return {
            currentSession: {
              ...state.currentSession,
              tasks: updatedTasks,
              updatedAt: new Date(),
              isDirty: true
            }
          };
        });
      },

      /**
       * Export tasks to Kanban Board
       * @param taskIds - IDs of architect tasks to mark as exported
       * @param kanbanTaskIdMap - Optional map of architect task ID to kanban task ID
       */
      exportTasksToKanban: async (taskIds: string[], kanbanTaskIdMap?: Map<string, string>) => {
        const { currentSession } = get();
        if (!currentSession) {
          set({ error: 'No active session' });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          set((state) => {
            if (!state.currentSession) return state;

            const updatedTasks = state.currentSession.tasks.map(task => {
              if (taskIds.includes(task.id)) {
                // Get the kanban task ID if available
                const kanbanTaskId = kanbanTaskIdMap?.get(task.id);
                return {
                  ...task,
                  status: 'exported' as const,
                  ...(kanbanTaskId ? { kanbanTaskId } : {})
                };
              }
              return task;
            });

            return {
              currentSession: {
                ...state.currentSession,
                tasks: updatedTasks,
                updatedAt: new Date(),
                isDirty: true
              },
              isLoading: false
            };
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to export tasks',
            isLoading: false
          });
        }
      },

      /**
       * Save current session to storage
       */
      saveSession: async () => {
        const { currentSession } = get();
        if (!currentSession) {
          return;
        }

        set({ isLoading: true, error: null });

        try {
          // TODO: Save to file storage via IPC
          // For now, just update the session summary and clear dirty flag

          const updatedSession = {
            ...currentSession,
            isDirty: false,
            updatedAt: new Date()
          };

          const summary = toSessionSummary(updatedSession);

          set((state) => ({
            sessions: state.sessions.map(s =>
              s.id === summary.id ? summary : s
            ),
            currentSession: updatedSession,
            isLoading: false
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to save session',
            isLoading: false
          });
        }
      },

      /**
       * Clear current session
       */
      clearCurrentSession: () => {
        set({ currentSession: null, isStreaming: false });
      },

      /**
       * Set error state
       */
      setError: (error: string | null) => {
        set({ error });
      },

      /**
       * Clear error state
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * Transition session to next status
       */
      transitionStatus: (newStatus: SessionStatus) => {
        set((state) => {
          if (!state.currentSession) return state;

          return {
            currentSession: {
              ...state.currentSession,
              status: newStatus,
              updatedAt: new Date(),
              isDirty: true
            }
          };
        });
      },

      /**
       * Regenerate schemas with updated requirements
       */
      regenerateSchemas: async () => {
        const { currentSession } = get();
        if (!currentSession) {
          set({ error: 'No active session' });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          // TODO: Call IPC to trigger Claude SDK for schema regeneration
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to regenerate schemas',
            isLoading: false
          });
        }
      },

      /**
       * Generate modules from schemas
       */
      generateModules: async () => {
        const { currentSession } = get();
        if (!currentSession) {
          set({ error: 'No active session' });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          // TODO: Call IPC to trigger Claude SDK for module generation
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to generate modules',
            isLoading: false
          });
        }
      },

      /**
       * Generate tasks from modules
       */
      generateTasks: async () => {
        const { currentSession } = get();
        if (!currentSession) {
          set({ error: 'No active session' });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          // TODO: Call IPC to trigger Claude SDK for task generation
          set({ isLoading: false });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to generate tasks',
            isLoading: false
          });
        }
      }
    }),
    {
      name: 'architect-storage',
      storage: createJSONStorage(() => localStorage),
      // Persist sessions and current session for resume capability
      // Transient states (isLoading, isStreaming, error) are not persisted
      partialize: (state) => {
        // Prepare currentSession for persistence
        // Truncate very large conversation histories to avoid localStorage limits
        let persistedCurrentSession = state.currentSession;
        if (persistedCurrentSession && persistedCurrentSession.interviewHistory.length > MAX_PERSISTED_MESSAGES) {
          // Keep only the most recent messages for persistence
          // The full history is preserved in memory during the session
          persistedCurrentSession = {
            ...persistedCurrentSession,
            interviewHistory: persistedCurrentSession.interviewHistory.slice(-MAX_PERSISTED_MESSAGES)
          };
        }

        return {
          sessions: state.sessions,
          // Persist currentSession for resume capability
          // On app reopen, the last active session is automatically restored
          currentSession: persistedCurrentSession
        };
      },
      // Handle date deserialization on app start
      onRehydrate: (_state) => {
        return (rehydratedState, error) => {
          if (error) {
            console.error('[ArchitectStore] Failed to rehydrate:', error);
            return;
          }

          if (!rehydratedState) {
            return;
          }

          // Rehydrate session summaries with proper Date objects
          if (rehydratedState.sessions) {
            rehydratedState.sessions = rehydratedState.sessions.map(rehydrateSummary);
          }

          // Rehydrate current session with proper Date objects
          if (rehydratedState.currentSession) {
            rehydratedState.currentSession = rehydrateSession(rehydratedState.currentSession);

            // Reset streaming state - we can't resume a streaming response
            // If the app was closed during streaming, the response is lost
            if (rehydratedState.currentSession.interviewHistory.length > 0) {
              const lastMessage = rehydratedState.currentSession.interviewHistory[
                rehydratedState.currentSession.interviewHistory.length - 1
              ];
              // If the last message was still streaming, mark it as complete
              if (lastMessage.isStreaming) {
                lastMessage.isStreaming = false;
              }
            }
          }

          // Reset transient states that shouldn't persist
          rehydratedState.isLoading = false;
          rehydratedState.isStreaming = false;
          rehydratedState.error = null;
        };
      }
    }
  )
);

// ============================================
// Action Functions (for use outside React components)
// ============================================

/**
 * Start a new architect session
 */
export async function startArchitectSession(
  projectName: string,
  projectDescription?: string
): Promise<void> {
  const store = useArchitectStore.getState();
  await store.startSession(projectName, projectDescription);
}

/**
 * Load an existing session
 */
export async function loadArchitectSession(sessionId: string): Promise<void> {
  const store = useArchitectStore.getState();
  await store.loadSession(sessionId);
}

/**
 * Delete a session
 */
export async function deleteArchitectSession(sessionId: string): Promise<void> {
  const store = useArchitectStore.getState();
  await store.deleteSession(sessionId);
}

/**
 * Send a message in the current session
 */
export async function sendArchitectMessage(content: string): Promise<void> {
  const store = useArchitectStore.getState();
  await store.addMessage(content);
}

/**
 * Save the current session
 */
export async function saveArchitectSession(): Promise<void> {
  const store = useArchitectStore.getState();
  await store.saveSession();
}

/**
 * Export tasks to Kanban Board
 * @param taskIds - IDs of architect tasks to mark as exported
 * @param kanbanTaskIdMap - Optional map of architect task ID to kanban task ID
 */
export async function exportTasksToKanban(
  taskIds: string[],
  kanbanTaskIdMap?: Map<string, string>
): Promise<void> {
  const store = useArchitectStore.getState();
  await store.exportTasksToKanban(taskIds, kanbanTaskIdMap);
}

// ============================================
// Selectors
// ============================================

/**
 * Get all sessions
 */
export function getArchitectSessions(): ArchitectSessionSummary[] {
  return useArchitectStore.getState().sessions;
}

/**
 * Get current session
 */
export function getCurrentSession(): ArchitectSession | null {
  return useArchitectStore.getState().currentSession;
}

/**
 * Get schemas from current session
 */
export function getCurrentSchemas(): ArchitectSchema[] {
  return useArchitectStore.getState().currentSession?.schemas ?? [];
}

/**
 * Get modules from current session
 */
export function getCurrentModules(): ModuleDefinition[] {
  return useArchitectStore.getState().currentSession?.modules ?? [];
}

/**
 * Get tasks from current session
 */
export function getCurrentTasks(): ArchitectTask[] {
  return useArchitectStore.getState().currentSession?.tasks ?? [];
}

/**
 * Get validated tasks ready for export
 */
export function getValidatedTasks(): ArchitectTask[] {
  const tasks = useArchitectStore.getState().currentSession?.tasks ?? [];
  return tasks.filter(task => task.status === 'validated');
}

/**
 * Get tasks grouped by phase
 */
export function getTasksByPhase(): Record<number, ArchitectTask[]> {
  const tasks = useArchitectStore.getState().currentSession?.tasks ?? [];
  return tasks.reduce((acc, task) => {
    if (!acc[task.phase]) {
      acc[task.phase] = [];
    }
    acc[task.phase].push(task);
    return acc;
  }, {} as Record<number, ArchitectTask[]>);
}

/**
 * Get interview message count
 */
export function getInterviewMessageCount(): number {
  return useArchitectStore.getState().currentSession?.interviewHistory.length ?? 0;
}

/**
 * Check if session has unsaved changes
 */
export function hasUnsavedChanges(): boolean {
  return useArchitectStore.getState().currentSession?.isDirty ?? false;
}

/**
 * Check if the store has been rehydrated from localStorage.
 * Useful for components that need to wait for persisted state.
 */
export function isStoreHydrated(): boolean {
  // Zustand persist middleware adds hasHydrated method
  return (useArchitectStore.persist as { hasHydrated?: () => boolean }).hasHydrated?.() ?? false;
}

/**
 * Wait for the store to be hydrated from localStorage.
 * Returns a promise that resolves when hydration is complete.
 */
export function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (isStoreHydrated()) {
      resolve();
      return;
    }

    // Subscribe to hydration event
    const unsubscribe = useArchitectStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

/**
 * Check if there's a persisted session available to resume.
 * This can be checked after hydration to determine if the user
 * was in the middle of a session when they last closed the app.
 */
export function hasResumableSession(): boolean {
  const currentSession = useArchitectStore.getState().currentSession;
  return currentSession !== null;
}

/**
 * Get summary of the current resumable session.
 * Returns null if no session to resume.
 */
export function getResumableSessionInfo(): ArchitectSessionSummary | null {
  const currentSession = useArchitectStore.getState().currentSession;
  if (!currentSession) {
    return null;
  }
  return toSessionSummary(currentSession);
}
