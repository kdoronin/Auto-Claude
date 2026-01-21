/**
 * Task Formatter Utility
 * Formats ArchitectTask objects for Kanban Board export and display.
 *
 * Converts architect-generated tasks into the Task format used by the
 * Kanban board, mapping acceptance criteria, dependencies, and metadata.
 */

import type {
  ArchitectTask,
  ModuleDefinition,
  TaskStatus as ArchitectTaskStatus,
} from '../types/architect.types';
import type {
  Task,
  TaskStatus,
  TaskMetadata,
  Subtask,
  TaskComplexity,
  TaskPriority,
  TaskCategory,
} from '../../../../shared/types/task';

// ============================================
// Types
// ============================================

/**
 * Options for formatting a task for display
 */
export interface FormatTaskOptions {
  /** Include module name in title */
  includeModuleName?: boolean;
  /** Module map for resolving module names */
  modules?: Map<string, ModuleDefinition>;
  /** Maximum length for description (truncate if longer) */
  maxDescriptionLength?: number;
  /** Format for acceptance criteria display */
  criteriaFormat?: 'list' | 'numbered' | 'markdown';
}

/**
 * Options for converting to Kanban format
 */
export interface FormatForKanbanOptions {
  /** Project ID for the Kanban task */
  projectId: string;
  /** Session ID to use as specId prefix */
  sessionId?: string;
  /** Modules for dependency resolution */
  modules?: ModuleDefinition[];
  /** Override default status mapping */
  statusMapping?: Partial<Record<ArchitectTaskStatus, TaskStatus>>;
  /** Category for all exported tasks */
  category?: TaskCategory;
}

/**
 * Formatted task for display purposes
 */
export interface FormattedTask {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  acceptanceCriteriaFormatted: string;
  dependencies: string[];
  dependenciesFormatted: string;
  phase: number;
  phaseLabel: string;
  estimatedEffort: string;
  status: ArchitectTaskStatus;
  statusLabel: string;
  moduleId: string;
  moduleName?: string;
  isValidated: boolean;
  isExported: boolean;
  hasUserEdits: boolean;
}

/**
 * Result of Kanban export
 */
export interface KanbanExportResult {
  tasks: Task[];
  taskIdMap: Map<string, string>; // architect task ID -> kanban task ID
  errors: string[];
  warnings: string[];
}

// ============================================
// Constants
// ============================================

/**
 * Status labels for display
 */
const STATUS_LABELS: Record<ArchitectTaskStatus, string> = {
  draft: 'Draft',
  validated: 'Validated',
  exported: 'Exported',
};

/**
 * Default status mapping from architect task status to Kanban status
 */
const DEFAULT_STATUS_MAPPING: Record<ArchitectTaskStatus, TaskStatus> = {
  draft: 'backlog',
  validated: 'backlog',
  exported: 'backlog', // Already exported tasks start in backlog
};

/**
 * Phase labels for display
 */
function getPhaseLabel(phase: number): string {
  const ordinal = getOrdinal(phase);
  return `Phase ${phase} (${ordinal})`;
}

/**
 * Get ordinal suffix for a number
 */
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================
// Formatting Functions
// ============================================

/**
 * Format a single ArchitectTask for display
 *
 * @param task - The architect task to format
 * @param options - Formatting options
 * @returns Formatted task object for display
 */
export function formatTask(
  task: ArchitectTask,
  options: FormatTaskOptions = {}
): FormattedTask {
  const {
    includeModuleName = false,
    modules,
    maxDescriptionLength,
    criteriaFormat = 'list',
  } = options;

  // Resolve module name if available
  let moduleName: string | undefined;
  if (modules) {
    const module = modules.get(task.moduleId);
    moduleName = module?.name;
  }

  // Get effective title (with user edits if present)
  const effectiveTitle = task.userEdits?.title || task.title;
  const title = includeModuleName && moduleName
    ? `[${moduleName}] ${effectiveTitle}`
    : effectiveTitle;

  // Get effective description (with user edits if present)
  let description = task.userEdits?.description || task.description;
  if (maxDescriptionLength && description.length > maxDescriptionLength) {
    description = description.substring(0, maxDescriptionLength - 3) + '...';
  }

  // Get effective acceptance criteria (with user edits if present)
  const acceptanceCriteria = task.userEdits?.acceptanceCriteria || task.acceptanceCriteria;

  // Format acceptance criteria for display
  const acceptanceCriteriaFormatted = formatAcceptanceCriteria(
    acceptanceCriteria,
    criteriaFormat
  );

  // Format dependencies for display
  const dependenciesFormatted = formatDependencies(task.dependencies, modules);

  return {
    id: task.id,
    title,
    description,
    acceptanceCriteria,
    acceptanceCriteriaFormatted,
    dependencies: task.dependencies,
    dependenciesFormatted,
    phase: task.phase,
    phaseLabel: getPhaseLabel(task.phase),
    estimatedEffort: task.estimatedEffort,
    status: task.status,
    statusLabel: STATUS_LABELS[task.status],
    moduleId: task.moduleId,
    moduleName,
    isValidated: task.status === 'validated' || task.status === 'exported',
    isExported: task.status === 'exported',
    hasUserEdits: !!task.userEdits,
  };
}

/**
 * Format acceptance criteria for display
 *
 * @param criteria - Array of acceptance criteria strings
 * @param format - Output format
 * @returns Formatted string
 */
export function formatAcceptanceCriteria(
  criteria: string[],
  format: 'list' | 'numbered' | 'markdown' = 'list'
): string {
  if (!criteria || criteria.length === 0) {
    return 'No acceptance criteria defined';
  }

  switch (format) {
    case 'numbered':
      return criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
    case 'markdown':
      return criteria.map(c => `- [ ] ${c}`).join('\n');
    case 'list':
    default:
      return criteria.map(c => `• ${c}`).join('\n');
  }
}

/**
 * Format dependencies for display
 *
 * @param dependencyIds - Array of task dependency IDs
 * @param modules - Optional module map for resolving names
 * @returns Formatted dependencies string
 */
export function formatDependencies(
  dependencyIds: string[],
  modules?: Map<string, ModuleDefinition>
): string {
  if (!dependencyIds || dependencyIds.length === 0) {
    return 'No dependencies';
  }

  // If modules provided, try to resolve to more readable names
  const formattedDeps = dependencyIds.map(depId => {
    // Dependencies might be task IDs or module IDs
    if (modules) {
      const module = modules.get(depId);
      if (module) {
        return module.name;
      }
    }
    return depId;
  });

  return formattedDeps.join(', ');
}

/**
 * Format estimated effort for display with icon
 *
 * @param effort - Effort string (e.g., "2-4 hours", "1-2 days")
 * @returns Formatted effort with optional icon
 */
export function formatEstimatedEffort(effort: string): string {
  if (!effort) {
    return 'Not estimated';
  }

  // Add time icon based on effort magnitude
  const lowerEffort = effort.toLowerCase();
  if (lowerEffort.includes('hour')) {
    return `⏱️ ${effort}`;
  } else if (lowerEffort.includes('day')) {
    return `📅 ${effort}`;
  } else if (lowerEffort.includes('week')) {
    return `📆 ${effort}`;
  }

  return effort;
}

// ============================================
// Kanban Export Functions
// ============================================

/**
 * Convert ArchitectTask(s) to Kanban Board format
 *
 * @param tasks - Architect tasks to convert
 * @param options - Export options
 * @returns KanbanExportResult with converted tasks
 */
export function formatForKanban(
  tasks: ArchitectTask | ArchitectTask[],
  options: FormatForKanbanOptions
): KanbanExportResult {
  const {
    projectId,
    sessionId,
    modules = [],
    statusMapping = {},
    category = 'feature',
  } = options;

  const taskArray = Array.isArray(tasks) ? tasks : [tasks];
  const moduleMap = new Map(modules.map(m => [m.id, m]));

  const result: KanbanExportResult = {
    tasks: [],
    taskIdMap: new Map(),
    errors: [],
    warnings: [],
  };

  // Build a map of architect task IDs to their converted Kanban IDs
  // for dependency resolution
  const architectToKanbanId = new Map<string, string>();

  for (const task of taskArray) {
    try {
      const kanbanTask = convertToKanbanTask(task, {
        projectId,
        sessionId,
        moduleMap,
        statusMapping,
        category,
      });

      result.tasks.push(kanbanTask);
      result.taskIdMap.set(task.id, kanbanTask.id);
      architectToKanbanId.set(task.id, kanbanTask.id);

      // Add warnings for tasks that might need attention
      if (task.status !== 'validated' && task.status !== 'exported') {
        result.warnings.push(`Task "${task.title}" is not validated`);
      }

      if (task.acceptanceCriteria.length === 0) {
        result.warnings.push(`Task "${task.title}" has no acceptance criteria`);
      }
    } catch (error) {
      result.errors.push(
        `Failed to convert task "${task.title}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Resolve dependencies to Kanban task IDs
  for (const task of result.tasks) {
    if (task.metadata?.dependencies) {
      task.metadata.dependencies = task.metadata.dependencies.map(depId => {
        return architectToKanbanId.get(depId) || depId;
      });
    }
  }

  return result;
}

/**
 * Convert a single ArchitectTask to Kanban Task format
 *
 * @param task - The architect task to convert
 * @param options - Conversion options
 * @returns Kanban Task
 */
function convertToKanbanTask(
  task: ArchitectTask,
  options: {
    projectId: string;
    sessionId?: string;
    moduleMap: Map<string, ModuleDefinition>;
    statusMapping: Partial<Record<ArchitectTaskStatus, TaskStatus>>;
    category: TaskCategory;
  }
): Task {
  const { projectId, sessionId, moduleMap, statusMapping, category } = options;

  // Generate Kanban task ID
  const kanbanTaskId = generateKanbanTaskId(task.id, sessionId);

  // Generate spec ID (used for file storage)
  const specId = generateSpecId(task.id, sessionId);

  // Map status
  const mergedStatusMapping = { ...DEFAULT_STATUS_MAPPING, ...statusMapping };
  const kanbanStatus = mergedStatusMapping[task.status];

  // Get module info
  const module = moduleMap.get(task.moduleId);

  // Get effective values (with user edits)
  const effectiveTitle = task.userEdits?.title || task.title;
  const effectiveDescription = task.userEdits?.description || task.description;
  const effectiveAcceptanceCriteria =
    task.userEdits?.acceptanceCriteria || task.acceptanceCriteria;

  // Build metadata
  const metadata: TaskMetadata = {
    sourceType: 'roadmap', // Tasks from architect are like roadmap-generated
    category,
    complexity: mapEffortToComplexity(task.estimatedEffort),
    priority: mapPhaseToPriority(task.phase),
    acceptanceCriteria: effectiveAcceptanceCriteria,
    dependencies: task.dependencies,
    estimatedEffort: mapEffortToComplexity(task.estimatedEffort),
    rationale: module ? `Part of ${module.name} module` : undefined,
  };

  // Build description with acceptance criteria
  const fullDescription = buildFullDescription(
    effectiveDescription,
    effectiveAcceptanceCriteria,
    module
  );

  // Build subtasks from acceptance criteria
  const subtasks = buildSubtasksFromCriteria(effectiveAcceptanceCriteria);

  const now = new Date();

  return {
    id: kanbanTaskId,
    specId,
    projectId,
    title: effectiveTitle,
    description: fullDescription,
    status: kanbanStatus,
    subtasks,
    logs: [],
    metadata,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate a Kanban task ID from architect task ID
 */
function generateKanbanTaskId(architectTaskId: string, sessionId?: string): string {
  const prefix = sessionId ? `arch-${sessionId.slice(0, 8)}` : 'arch';
  const suffix = architectTaskId.slice(-8);
  return `${prefix}-${suffix}-${Date.now().toString(36)}`;
}

/**
 * Generate a spec ID for file storage
 */
function generateSpecId(architectTaskId: string, sessionId?: string): string {
  const prefix = sessionId ? sessionId.slice(0, 8) : 'manual';
  const taskPart = architectTaskId.slice(-8);
  return `${prefix}-${taskPart}`;
}

/**
 * Map estimated effort string to TaskComplexity
 */
function mapEffortToComplexity(effort: string): TaskComplexity {
  if (!effort) return 'medium';

  const lowerEffort = effort.toLowerCase();

  // Extract numeric values if present
  const hours = extractHours(lowerEffort);
  const days = extractDays(lowerEffort);

  // Map to complexity based on effort
  if (hours !== null) {
    if (hours <= 2) return 'trivial';
    if (hours <= 4) return 'small';
    if (hours <= 8) return 'medium';
    return 'large';
  }

  if (days !== null) {
    if (days <= 1) return 'medium';
    if (days <= 3) return 'large';
    return 'complex';
  }

  // Fallback to keyword matching
  if (lowerEffort.includes('trivial') || lowerEffort.includes('quick')) {
    return 'trivial';
  }
  if (lowerEffort.includes('small') || lowerEffort.includes('simple')) {
    return 'small';
  }
  if (lowerEffort.includes('large') || lowerEffort.includes('significant')) {
    return 'large';
  }
  if (lowerEffort.includes('complex') || lowerEffort.includes('extensive')) {
    return 'complex';
  }

  return 'medium';
}

/**
 * Extract hours from effort string
 */
function extractHours(effort: string): number | null {
  const match = effort.match(/(\d+)(?:-\d+)?\s*hour/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Extract days from effort string
 */
function extractDays(effort: string): number | null {
  const match = effort.match(/(\d+)(?:-\d+)?\s*day/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Map phase number to priority
 * Earlier phases get higher priority
 */
function mapPhaseToPriority(phase: number): TaskPriority {
  if (phase === 1) return 'urgent';
  if (phase === 2) return 'high';
  if (phase <= 4) return 'medium';
  return 'low';
}

/**
 * Build full description with acceptance criteria and module info
 */
function buildFullDescription(
  description: string,
  acceptanceCriteria: string[],
  module?: ModuleDefinition
): string {
  const parts: string[] = [description];

  if (module) {
    parts.push(`\n\n**Module:** ${module.name}`);
    if (module.description) {
      parts.push(`*${module.description}*`);
    }
  }

  if (acceptanceCriteria.length > 0) {
    parts.push('\n\n**Acceptance Criteria:**');
    parts.push(acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n'));
  }

  return parts.join('\n');
}

/**
 * Build subtasks from acceptance criteria
 */
function buildSubtasksFromCriteria(criteria: string[]): Subtask[] {
  return criteria.map((criterion, index) => ({
    id: `criterion-${index + 1}`,
    title: criterion.length > 60 ? criterion.substring(0, 57) + '...' : criterion,
    description: criterion,
    status: 'pending' as const,
    files: [],
  }));
}

// ============================================
// Batch Operations
// ============================================

/**
 * Group tasks by phase for ordered export
 *
 * @param tasks - Tasks to group
 * @returns Map of phase number to tasks
 */
export function groupTasksByPhase(
  tasks: ArchitectTask[]
): Map<number, ArchitectTask[]> {
  const grouped = new Map<number, ArchitectTask[]>();

  for (const task of tasks) {
    const phase = task.phase;
    if (!grouped.has(phase)) {
      grouped.set(phase, []);
    }
    grouped.get(phase)!.push(task);
  }

  // Sort by phase number
  return new Map([...grouped.entries()].sort((a, b) => a[0] - b[0]));
}

/**
 * Group tasks by module for organization
 *
 * @param tasks - Tasks to group
 * @param modules - Module definitions for names
 * @returns Map of module ID to tasks
 */
export function groupTasksByModule(
  tasks: ArchitectTask[],
  modules: ModuleDefinition[]
): Map<string, { module: ModuleDefinition | null; tasks: ArchitectTask[] }> {
  const moduleMap = new Map(modules.map(m => [m.id, m]));
  const grouped = new Map<
    string,
    { module: ModuleDefinition | null; tasks: ArchitectTask[] }
  >();

  for (const task of tasks) {
    const moduleId = task.moduleId;
    if (!grouped.has(moduleId)) {
      grouped.set(moduleId, {
        module: moduleMap.get(moduleId) || null,
        tasks: [],
      });
    }
    grouped.get(moduleId)!.tasks.push(task);
  }

  return grouped;
}

/**
 * Filter tasks that are ready for export (validated)
 *
 * @param tasks - Tasks to filter
 * @returns Tasks that are ready for export
 */
export function filterExportableTasks(tasks: ArchitectTask[]): ArchitectTask[] {
  return tasks.filter(
    task => task.status === 'validated' || task.status === 'draft'
  );
}

/**
 * Calculate export summary statistics
 *
 * @param tasks - Tasks to summarize
 * @returns Summary statistics
 */
export function getExportSummary(tasks: ArchitectTask[]): {
  total: number;
  byStatus: Record<ArchitectTaskStatus, number>;
  byPhase: Map<number, number>;
  validated: number;
  draft: number;
  exported: number;
  withDependencies: number;
  withAcceptanceCriteria: number;
} {
  const byStatus: Record<ArchitectTaskStatus, number> = {
    draft: 0,
    validated: 0,
    exported: 0,
  };

  const byPhase = new Map<number, number>();

  let withDependencies = 0;
  let withAcceptanceCriteria = 0;

  for (const task of tasks) {
    byStatus[task.status]++;

    const phaseCount = byPhase.get(task.phase) || 0;
    byPhase.set(task.phase, phaseCount + 1);

    if (task.dependencies.length > 0) withDependencies++;
    if (task.acceptanceCriteria.length > 0) withAcceptanceCriteria++;
  }

  return {
    total: tasks.length,
    byStatus,
    byPhase,
    validated: byStatus.validated,
    draft: byStatus.draft,
    exported: byStatus.exported,
    withDependencies,
    withAcceptanceCriteria,
  };
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validate a task is ready for Kanban export
 *
 * @param task - Task to validate
 * @returns Validation result
 */
export function validateTaskForExport(task: ArchitectTask): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!task.title || task.title.trim().length === 0) {
    errors.push('Task title is required');
  }

  if (!task.description || task.description.trim().length === 0) {
    errors.push('Task description is required');
  }

  if (!task.moduleId) {
    errors.push('Task must be associated with a module');
  }

  // Warnings
  if (task.acceptanceCriteria.length === 0) {
    warnings.push('Task has no acceptance criteria');
  }

  if (!task.estimatedEffort) {
    warnings.push('Task has no estimated effort');
  }

  if (task.status === 'draft') {
    warnings.push('Task is still in draft status');
  }

  if (task.status === 'exported') {
    warnings.push('Task has already been exported');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate multiple tasks for batch export
 *
 * @param tasks - Tasks to validate
 * @returns Batch validation result
 */
export function validateTasksForExport(tasks: ArchitectTask[]): {
  isValid: boolean;
  validTasks: ArchitectTask[];
  invalidTasks: { task: ArchitectTask; errors: string[] }[];
  warnings: { task: ArchitectTask; warnings: string[] }[];
} {
  const validTasks: ArchitectTask[] = [];
  const invalidTasks: { task: ArchitectTask; errors: string[] }[] = [];
  const warnings: { task: ArchitectTask; warnings: string[] }[] = [];

  for (const task of tasks) {
    const validation = validateTaskForExport(task);

    if (validation.isValid) {
      validTasks.push(task);
    } else {
      invalidTasks.push({ task, errors: validation.errors });
    }

    if (validation.warnings.length > 0) {
      warnings.push({ task, warnings: validation.warnings });
    }
  }

  return {
    isValid: invalidTasks.length === 0,
    validTasks,
    invalidTasks,
    warnings,
  };
}
