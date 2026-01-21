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

// Helper to serialize dates for storage
function serializeSession(session: ArchitectSession): ArchitectSession {
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
      // Only persist essential data - large conversation history should go to file storage
      partialize: (state) => ({
        sessions: state.sessions,
        // Don't persist currentSession - it will be loaded fresh
        // Don't persist transient states like isLoading, isStreaming, error
      }),
      // Handle date deserialization
      onRehydrate: (state) => {
        return (rehydratedState, error) => {
          if (error) {
            console.error('[ArchitectStore] Failed to rehydrate:', error);
          } else if (rehydratedState?.sessions) {
            // Convert date strings back to Date objects
            rehydratedState.sessions = rehydratedState.sessions.map(session => ({
              ...session,
              createdAt: new Date(session.createdAt),
              updatedAt: new Date(session.updatedAt)
            }));
          }
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
