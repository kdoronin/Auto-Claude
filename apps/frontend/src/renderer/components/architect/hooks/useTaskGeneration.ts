/**
 * useTaskGeneration hook for task generation and validation
 *
 * Generates tasks from modules using Claude SDK, supports human-in-the-loop
 * validation, and tracks task status (draft, validated, exported).
 *
 * Follows patterns from:
 * - useArchitectSession.ts for IPC communication
 * - taskFormatter.ts for task formatting utilities
 */
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../hooks/use-toast';
import {
  useArchitectStore,
  exportTasksToKanban as exportTasksToKanbanAction,
} from '../../../stores/architect';
import { createTask } from '../../../stores/task-store';
import {
  formatTask,
  formatForKanban,
  groupTasksByPhase,
  groupTasksByModule,
  filterExportableTasks,
  getExportSummary,
  validateTaskForExport,
  validateTasksForExport,
} from '../utils/taskFormatter';
import type {
  ArchitectTask,
  ModuleDefinition,
  TaskStatus,
  FormattedTask,
  FormatTaskOptions,
  FormatForKanbanOptions,
  KanbanExportResult,
} from '../types/architect.types';
// Re-export types from taskFormatter that are needed externally
export type { FormattedTask, KanbanExportResult } from '../utils/taskFormatter';

// ============================================
// Types
// ============================================

interface UseTaskGenerationOptions {
  /** Project ID for Kanban export */
  projectId: string;
  /** Auto-validate tasks on generation */
  autoValidate?: boolean;
}

interface UseTaskGenerationReturn {
  // State
  tasks: ArchitectTask[];
  modules: ModuleDefinition[];
  formattedTasks: FormattedTask[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;

  // Task statistics
  taskStats: TaskStats;

  // Grouped views
  tasksByPhase: Map<number, ArchitectTask[]>;
  tasksByModule: Map<string, { module: ModuleDefinition | null; tasks: ArchitectTask[] }>;

  // Task actions
  generateTasks: (moduleIds?: string[]) => Promise<void>;
  regenerateTasks: (moduleIds?: string[]) => Promise<void>;
  validateTask: (taskId: string) => void;
  validateAllTasks: () => void;
  invalidateTask: (taskId: string) => void;
  updateTask: (taskId: string, updates: Partial<ArchitectTask>) => void;
  updateTaskTitle: (taskId: string, title: string) => void;
  updateTaskDescription: (taskId: string, description: string) => void;
  updateTaskCriteria: (taskId: string, criteria: string[]) => void;

  // Export actions
  exportToKanban: (taskIds: string[]) => Promise<KanbanExportResult | null>;
  exportValidatedTasks: () => Promise<KanbanExportResult | null>;
  exportAllTasks: () => Promise<KanbanExportResult | null>;

  // Validation
  getTaskValidation: (taskId: string) => TaskValidationResult;
  validateForExport: (taskIds: string[]) => BatchValidationResult;

  // Utility
  getFormattedTask: (taskId: string, options?: FormatTaskOptions) => FormattedTask | null;
  getTaskById: (taskId: string) => ArchitectTask | undefined;
  getModuleById: (moduleId: string) => ModuleDefinition | undefined;
  clearError: () => void;
}

interface TaskStats {
  total: number;
  draft: number;
  validated: number;
  exported: number;
  byPhase: Map<number, number>;
  readyForExport: number;
  withDependencies: number;
  withAcceptanceCriteria: number;
}

interface TaskValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface BatchValidationResult {
  isValid: boolean;
  validTasks: ArchitectTask[];
  invalidTasks: { task: ArchitectTask; errors: string[] }[];
  warnings: { task: ArchitectTask; warnings: string[] }[];
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for task generation and validation
 *
 * @param options - Configuration options
 * @returns Task state and actions
 */
export function useTaskGeneration(
  options: UseTaskGenerationOptions
): UseTaskGenerationReturn {
  const { projectId, autoValidate = false } = options;
  const { t } = useTranslation(['common', 'errors']);

  // Local state for generation process
  const [isGenerating, setIsGenerating] = useState(false);

  // Store state
  const currentSession = useArchitectStore((state) => state.currentSession);
  const isLoading = useArchitectStore((state) => state.isLoading);
  const error = useArchitectStore((state) => state.error);
  const updateTaskStore = useArchitectStore((state) => state.updateTask);
  const validateTaskStore = useArchitectStore((state) => state.validateTask);
  const generateTasksStore = useArchitectStore((state) => state.generateTasks);
  const setError = useArchitectStore((state) => state.setError);
  const clearErrorStore = useArchitectStore((state) => state.clearError);

  // Derived state
  const tasks = currentSession?.tasks ?? [];
  const modules = currentSession?.modules ?? [];
  const sessionId = currentSession?.id;

  // Create module map for lookups
  const moduleMap = useMemo(
    () => new Map(modules.map((m) => [m.id, m])),
    [modules]
  );

  // ============================================
  // Computed Values
  // ============================================

  /**
   * Get formatted tasks for display
   */
  const formattedTasks = useMemo(
    () =>
      tasks.map((task) =>
        formatTask(task, { includeModuleName: true, modules: moduleMap })
      ),
    [tasks, moduleMap]
  );

  /**
   * Get tasks grouped by phase
   */
  const tasksByPhase = useMemo(() => groupTasksByPhase(tasks), [tasks]);

  /**
   * Get tasks grouped by module
   */
  const tasksByModule = useMemo(
    () => groupTasksByModule(tasks, modules),
    [tasks, modules]
  );

  /**
   * Calculate task statistics
   */
  const taskStats = useMemo((): TaskStats => {
    const summary = getExportSummary(tasks);
    return {
      total: summary.total,
      draft: summary.draft,
      validated: summary.validated,
      exported: summary.exported,
      byPhase: summary.byPhase,
      readyForExport: summary.validated + summary.draft,
      withDependencies: summary.withDependencies,
      withAcceptanceCriteria: summary.withAcceptanceCriteria,
    };
  }, [tasks]);

  // ============================================
  // Task Actions
  // ============================================

  /**
   * Generate tasks from modules using Claude SDK
   *
   * @param moduleIds - Optional specific modules to generate tasks for (all if not specified)
   */
  const generateTasks = useCallback(
    async (moduleIds?: string[]) => {
      if (!currentSession) {
        setError('No active session');
        return;
      }

      // Check if there are modules to generate tasks from
      if (modules.length === 0) {
        setError('No modules available. Generate modules first.');
        toast({
          variant: 'destructive',
          title: t('errors:architect.noModules'),
          description: t('errors:architect.generateModulesFirst'),
        });
        return;
      }

      // Filter modules if specific IDs provided
      const targetModules = moduleIds
        ? modules.filter((m) => moduleIds.includes(m.id))
        : modules;

      if (targetModules.length === 0) {
        setError('No matching modules found');
        return;
      }

      setIsGenerating(true);

      try {
        // Call the store's generateTasks method which triggers Claude SDK via IPC
        await generateTasksStore();

        // If auto-validate is enabled, validate all generated tasks
        if (autoValidate) {
          const newTasks = useArchitectStore.getState().currentSession?.tasks ?? [];
          for (const task of newTasks) {
            if (task.status === 'draft') {
              validateTaskStore(task.id);
            }
          }
        }

        toast({
          title: t('common:actions.generated'),
          description: t('common:architect.tasksGenerated', {
            count: targetModules.length,
          }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate tasks';
        setError(message);
        toast({
          variant: 'destructive',
          title: t('errors:architect.taskGenerationFailed'),
          description: message,
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [
      currentSession,
      modules,
      autoValidate,
      generateTasksStore,
      validateTaskStore,
      setError,
      t,
    ]
  );

  /**
   * Regenerate tasks (clears existing and generates new)
   *
   * @param moduleIds - Optional specific modules to regenerate tasks for
   */
  const regenerateTasks = useCallback(
    async (moduleIds?: string[]) => {
      // For regeneration, we simply call generateTasks again
      // The store should handle replacing existing tasks
      await generateTasks(moduleIds);
    },
    [generateTasks]
  );

  /**
   * Validate a single task
   *
   * @param taskId - ID of task to validate
   */
  const validateTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) {
        setError(`Task ${taskId} not found`);
        return;
      }

      // Check if task is ready for validation
      const validation = validateTaskForExport(task);
      if (!validation.isValid) {
        toast({
          variant: 'destructive',
          title: t('errors:architect.taskValidationFailed'),
          description: validation.errors.join(', '),
        });
        return;
      }

      validateTaskStore(taskId);

      toast({
        title: t('common:actions.validated'),
        description: t('common:architect.taskValidated', { title: task.title }),
      });
    },
    [tasks, validateTaskStore, setError, t]
  );

  /**
   * Validate all draft tasks
   */
  const validateAllTasks = useCallback(() => {
    const draftTasks = tasks.filter((t) => t.status === 'draft');

    if (draftTasks.length === 0) {
      toast({
        title: t('common:info'),
        description: t('common:architect.noTasksToValidate'),
      });
      return;
    }

    let validatedCount = 0;
    let failedCount = 0;

    for (const task of draftTasks) {
      const validation = validateTaskForExport(task);
      if (validation.isValid) {
        validateTaskStore(task.id);
        validatedCount++;
      } else {
        failedCount++;
      }
    }

    toast({
      title: t('common:actions.validated'),
      description: t('common:architect.tasksValidatedBatch', {
        validated: validatedCount,
        failed: failedCount,
      }),
    });
  }, [tasks, validateTaskStore, t]);

  /**
   * Invalidate a task (move back to draft)
   *
   * @param taskId - ID of task to invalidate
   */
  const invalidateTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) {
        setError(`Task ${taskId} not found`);
        return;
      }

      if (task.status === 'exported') {
        toast({
          variant: 'destructive',
          title: t('errors:architect.cannotInvalidateExported'),
          description: t('errors:architect.taskAlreadyExported'),
        });
        return;
      }

      updateTaskStore(taskId, { status: 'draft' });

      toast({
        title: t('common:actions.updated'),
        description: t('common:architect.taskInvalidated', { title: task.title }),
      });
    },
    [tasks, updateTaskStore, setError, t]
  );

  /**
   * Update a task's properties
   *
   * @param taskId - ID of task to update
   * @param updates - Partial task updates
   */
  const updateTask = useCallback(
    (taskId: string, updates: Partial<ArchitectTask>) => {
      updateTaskStore(taskId, updates);
    },
    [updateTaskStore]
  );

  /**
   * Update task title (stores in userEdits)
   *
   * @param taskId - ID of task to update
   * @param title - New title
   */
  const updateTaskTitle = useCallback(
    (taskId: string, title: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      updateTaskStore(taskId, {
        userEdits: {
          ...task.userEdits,
          title,
        },
      });
    },
    [tasks, updateTaskStore]
  );

  /**
   * Update task description (stores in userEdits)
   *
   * @param taskId - ID of task to update
   * @param description - New description
   */
  const updateTaskDescription = useCallback(
    (taskId: string, description: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      updateTaskStore(taskId, {
        userEdits: {
          ...task.userEdits,
          description,
        },
      });
    },
    [tasks, updateTaskStore]
  );

  /**
   * Update task acceptance criteria (stores in userEdits)
   *
   * @param taskId - ID of task to update
   * @param criteria - New acceptance criteria
   */
  const updateTaskCriteria = useCallback(
    (taskId: string, criteria: string[]) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      updateTaskStore(taskId, {
        userEdits: {
          ...task.userEdits,
          acceptanceCriteria: criteria,
        },
      });
    },
    [tasks, updateTaskStore]
  );

  // ============================================
  // Export Actions
  // ============================================

  /**
   * Export specific tasks to Kanban Board
   *
   * @param taskIds - IDs of tasks to export
   * @returns Export result or null if failed
   */
  const exportToKanban = useCallback(
    async (taskIds: string[]): Promise<KanbanExportResult | null> => {
      if (!sessionId) {
        setError('No active session');
        return null;
      }

      if (taskIds.length === 0) {
        toast({
          variant: 'destructive',
          title: t('errors:architect.noTasksSelected'),
          description: t('errors:architect.selectTasksToExport'),
        });
        return null;
      }

      const tasksToExport = tasks.filter((t) => taskIds.includes(t.id));

      // Validate tasks before export
      const validation = validateTasksForExport(tasksToExport);

      if (!validation.isValid) {
        const errorMessages = validation.invalidTasks
          .map((it) => `${it.task.title}: ${it.errors.join(', ')}`)
          .slice(0, 3); // Show max 3 errors

        toast({
          variant: 'destructive',
          title: t('errors:architect.exportValidationFailed'),
          description: errorMessages.join('\n'),
        });
        return null;
      }

      try {
        // Format tasks for Kanban
        const kanbanOptions: FormatForKanbanOptions = {
          projectId,
          sessionId,
          modules,
          category: 'feature',
        };

        const result = formatForKanban(tasksToExport, kanbanOptions);

        // Show warnings if any
        if (result.warnings.length > 0) {
          toast({
            title: t('common:warnings'),
            description: result.warnings.slice(0, 3).join('\n'),
          });
        }

        // Create tasks in the Kanban Board via task-store
        // This actually creates the tasks and makes them appear in the Kanban Board
        const createdTaskIds: string[] = [];
        const creationErrors: string[] = [];
        // Map of architect task ID -> actual kanban task ID (for storing reference)
        const architectToKanbanIdMap = new Map<string, string>();

        for (const kanbanTask of result.tasks) {
          try {
            const createdTask = await createTask(
              projectId,
              kanbanTask.title,
              kanbanTask.description,
              kanbanTask.metadata
            );

            if (createdTask) {
              createdTaskIds.push(createdTask.id);
              // Find the original architect task ID for this kanban task
              // and store the mapping to the actual created task ID
              for (const [architectId, kanbanId] of result.taskIdMap.entries()) {
                if (kanbanId === kanbanTask.id) {
                  result.taskIdMap.set(architectId, createdTask.id);
                  architectToKanbanIdMap.set(architectId, createdTask.id);
                  break;
                }
              }
            } else {
              creationErrors.push(`Failed to create task: ${kanbanTask.title}`);
            }
          } catch (taskError) {
            creationErrors.push(
              `Error creating task "${kanbanTask.title}": ${
                taskError instanceof Error ? taskError.message : String(taskError)
              }`
            );
          }
        }

        // If any tasks failed to create, show errors
        if (creationErrors.length > 0) {
          result.errors.push(...creationErrors);

          // If all tasks failed, don't mark as exported
          if (createdTaskIds.length === 0) {
            toast({
              variant: 'destructive',
              title: t('errors:architect.exportFailed'),
              description: creationErrors.slice(0, 3).join('\n'),
            });
            return result;
          }

          // Partial success - show warning
          toast({
            variant: 'default',
            title: t('common:architect.partialExportSuccess'),
            description: t('common:architect.someTasksFailedToExport', {
              success: createdTaskIds.length,
              failed: creationErrors.length,
            }),
          });
        }

        // Mark successfully exported tasks in the architect store
        // Pass the kanban task ID map so the store can save the reference
        const successfullyExportedIds = Array.from(architectToKanbanIdMap.keys());

        if (successfullyExportedIds.length > 0) {
          await exportTasksToKanbanAction(successfullyExportedIds, architectToKanbanIdMap);
        }

        if (creationErrors.length === 0) {
          toast({
            title: t('common:actions.exported'),
            description: t('common:architect.tasksExported', {
              count: result.tasks.length,
            }),
          });
        }

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to export tasks';
        setError(message);
        toast({
          variant: 'destructive',
          title: t('errors:architect.exportFailed'),
          description: message,
        });
        return null;
      }
    },
    [sessionId, tasks, modules, projectId, setError, t]
  );

  /**
   * Export all validated tasks to Kanban Board
   *
   * @returns Export result or null if failed
   */
  const exportValidatedTasks = useCallback(async (): Promise<KanbanExportResult | null> => {
    const validatedTasks = tasks.filter((t) => t.status === 'validated');

    if (validatedTasks.length === 0) {
      toast({
        title: t('common:info'),
        description: t('common:architect.noValidatedTasksToExport'),
      });
      return null;
    }

    return exportToKanban(validatedTasks.map((t) => t.id));
  }, [tasks, exportToKanban, t]);

  /**
   * Export all exportable tasks (draft + validated) to Kanban Board
   *
   * @returns Export result or null if failed
   */
  const exportAllTasks = useCallback(async (): Promise<KanbanExportResult | null> => {
    const exportableTasks = filterExportableTasks(tasks);

    if (exportableTasks.length === 0) {
      toast({
        title: t('common:info'),
        description: t('common:architect.noTasksToExport'),
      });
      return null;
    }

    return exportToKanban(exportableTasks.map((t) => t.id));
  }, [tasks, exportToKanban, t]);

  // ============================================
  // Validation Utilities
  // ============================================

  /**
   * Get validation status for a single task
   *
   * @param taskId - ID of task to validate
   * @returns Validation result
   */
  const getTaskValidation = useCallback(
    (taskId: string): TaskValidationResult => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) {
        return {
          isValid: false,
          errors: ['Task not found'],
          warnings: [],
        };
      }
      return validateTaskForExport(task);
    },
    [tasks]
  );

  /**
   * Validate multiple tasks for batch export
   *
   * @param taskIds - IDs of tasks to validate
   * @returns Batch validation result
   */
  const validateForExport = useCallback(
    (taskIds: string[]): BatchValidationResult => {
      const tasksToValidate = tasks.filter((t) => taskIds.includes(t.id));
      return validateTasksForExport(tasksToValidate);
    },
    [tasks]
  );

  // ============================================
  // Utility Functions
  // ============================================

  /**
   * Get a formatted task by ID
   *
   * @param taskId - ID of task to format
   * @param options - Formatting options
   * @returns Formatted task or null if not found
   */
  const getFormattedTask = useCallback(
    (taskId: string, options?: FormatTaskOptions): FormattedTask | null => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return null;

      return formatTask(task, {
        includeModuleName: true,
        modules: moduleMap,
        ...options,
      });
    },
    [tasks, moduleMap]
  );

  /**
   * Get a task by ID
   *
   * @param taskId - ID of task to find
   * @returns Task or undefined
   */
  const getTaskById = useCallback(
    (taskId: string): ArchitectTask | undefined => {
      return tasks.find((t) => t.id === taskId);
    },
    [tasks]
  );

  /**
   * Get a module by ID
   *
   * @param moduleId - ID of module to find
   * @returns Module or undefined
   */
  const getModuleById = useCallback(
    (moduleId: string): ModuleDefinition | undefined => {
      return moduleMap.get(moduleId);
    },
    [moduleMap]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    clearErrorStore();
  }, [clearErrorStore]);

  // ============================================
  // Return
  // ============================================

  return {
    // State
    tasks,
    modules,
    formattedTasks,
    isLoading,
    isGenerating,
    error,

    // Task statistics
    taskStats,

    // Grouped views
    tasksByPhase,
    tasksByModule,

    // Task actions
    generateTasks,
    regenerateTasks,
    validateTask,
    validateAllTasks,
    invalidateTask,
    updateTask,
    updateTaskTitle,
    updateTaskDescription,
    updateTaskCriteria,

    // Export actions
    exportToKanban,
    exportValidatedTasks,
    exportAllTasks,

    // Validation
    getTaskValidation,
    validateForExport,

    // Utility
    getFormattedTask,
    getTaskById,
    getModuleById,
    clearError,
  };
}

// ============================================
// Helper Hooks
// ============================================

/**
 * Hook to get task statistics without full hook
 */
export function useTaskStats(): TaskStats | null {
  const currentSession = useArchitectStore((state) => state.currentSession);
  const tasks = currentSession?.tasks ?? [];

  return useMemo(() => {
    if (tasks.length === 0) return null;

    const summary = getExportSummary(tasks);
    return {
      total: summary.total,
      draft: summary.draft,
      validated: summary.validated,
      exported: summary.exported,
      byPhase: summary.byPhase,
      readyForExport: summary.validated + summary.draft,
      withDependencies: summary.withDependencies,
      withAcceptanceCriteria: summary.withAcceptanceCriteria,
    };
  }, [tasks]);
}

/**
 * Hook to get formatted tasks without full hook
 */
export function useFormattedTasks(options?: FormatTaskOptions): FormattedTask[] {
  const currentSession = useArchitectStore((state) => state.currentSession);
  const tasks = currentSession?.tasks ?? [];
  const modules = currentSession?.modules ?? [];

  const moduleMap = useMemo(
    () => new Map(modules.map((m) => [m.id, m])),
    [modules]
  );

  return useMemo(
    () =>
      tasks.map((task) =>
        formatTask(task, {
          includeModuleName: true,
          modules: moduleMap,
          ...options,
        })
      ),
    [tasks, moduleMap, options]
  );
}

/**
 * Hook to check if any tasks are ready for export
 */
export function useHasExportableTasks(): boolean {
  const currentSession = useArchitectStore((state) => state.currentSession);
  const tasks = currentSession?.tasks ?? [];

  return useMemo(
    () => tasks.some((t) => t.status === 'validated' || t.status === 'draft'),
    [tasks]
  );
}

/**
 * Hook to get validated task count
 */
export function useValidatedTaskCount(): number {
  const currentSession = useArchitectStore((state) => state.currentSession);
  const tasks = currentSession?.tasks ?? [];

  return useMemo(
    () => tasks.filter((t) => t.status === 'validated').length,
    [tasks]
  );
}

export default useTaskGeneration;
