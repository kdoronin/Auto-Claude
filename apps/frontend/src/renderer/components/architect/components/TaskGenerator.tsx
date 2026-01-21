/**
 * TaskGenerator component for task management and Kanban export
 *
 * Features:
 * - Task list organized by phase or module
 * - Task editing (title, description, acceptance criteria)
 * - Human-in-the-loop validation
 * - Export to Kanban Board
 * - Task statistics and summary
 *
 * Follows patterns from ModuleList.tsx and InterviewPanel.tsx.
 */
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ListTodo,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Clock,
  Link2,
  Layers,
  Send,
  Loader2,
  PenLine,
  X,
  Plus,
  Trash2,
  ArrowUpRight,
  FileCheck2,
  AlertCircle,
  Filter,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { ScrollArea } from '../../ui/scroll-area';
import { Textarea } from '../../ui/textarea';
import { Input } from '../../ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../ui/collapsible';
import { cn } from '../../../lib/utils';
import type {
  TaskGeneratorProps,
  ArchitectTask,
  ModuleDefinition,
  TaskStatus,
} from '../types/architect.types';

// ============================================
// Constants
// ============================================

/**
 * Status labels for display
 */
const STATUS_LABELS: Record<TaskStatus, string> = {
  draft: 'Draft',
  validated: 'Validated',
  exported: 'Exported',
};

/**
 * Status colors
 */
const STATUS_COLORS: Record<TaskStatus, string> = {
  draft: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  validated: 'bg-green-500/10 text-green-500 border-green-500/20',
  exported: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

/**
 * Status icons
 */
const StatusIcon: Record<TaskStatus, typeof Circle> = {
  draft: Circle,
  validated: CheckCircle2,
  exported: ArrowUpRight,
};

/**
 * View modes for task display
 */
type ViewMode = 'phase' | 'module' | 'list';

// ============================================
// Sub-components
// ============================================

interface TaskCardProps {
  task: ArchitectTask;
  module: ModuleDefinition | undefined;
  isExpanded: boolean;
  isEditing: boolean;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdateTask: (taskId: string, updates: Partial<ArchitectTask>) => void;
  onValidateTask: (taskId: string) => void;
  isSelected: boolean;
  onToggleSelect: () => void;
}

/**
 * Individual task card with details and actions
 */
function TaskCard({
  task,
  module,
  isExpanded,
  isEditing,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onUpdateTask,
  onValidateTask,
  isSelected,
  onToggleSelect,
}: TaskCardProps) {
  const [editTitle, setEditTitle] = useState(task.userEdits?.title || task.title);
  const [editDescription, setEditDescription] = useState(
    task.userEdits?.description || task.description
  );
  const [editCriteria, setEditCriteria] = useState<string[]>(
    task.userEdits?.acceptanceCriteria || task.acceptanceCriteria
  );

  // Get the status icon component
  const StatusIconComponent = StatusIcon[task.status];

  // Effective values (with user edits)
  const effectiveTitle = task.userEdits?.title || task.title;
  const effectiveDescription = task.userEdits?.description || task.description;
  const effectiveCriteria =
    task.userEdits?.acceptanceCriteria || task.acceptanceCriteria;

  // Handle save edit
  const handleSaveEdit = useCallback(() => {
    onUpdateTask(task.id, {
      userEdits: {
        title: editTitle !== task.title ? editTitle : undefined,
        description: editDescription !== task.description ? editDescription : undefined,
        acceptanceCriteria:
          JSON.stringify(editCriteria) !== JSON.stringify(task.acceptanceCriteria)
            ? editCriteria
            : undefined,
      },
    });
    onCancelEdit();
  }, [
    task,
    editTitle,
    editDescription,
    editCriteria,
    onUpdateTask,
    onCancelEdit,
  ]);

  // Handle add criterion
  const handleAddCriterion = useCallback(() => {
    setEditCriteria([...editCriteria, '']);
  }, [editCriteria]);

  // Handle remove criterion
  const handleRemoveCriterion = useCallback((index: number) => {
    setEditCriteria(editCriteria.filter((_, i) => i !== index));
  }, [editCriteria]);

  // Handle update criterion
  const handleUpdateCriterion = useCallback(
    (index: number, value: string) => {
      const newCriteria = [...editCriteria];
      newCriteria[index] = value;
      setEditCriteria(newCriteria);
    },
    [editCriteria]
  );

  // Handle quick validate
  const handleQuickValidate = useCallback(() => {
    onValidateTask(task.id);
  }, [task.id, onValidateTask]);

  return (
    <div
      className={cn(
        'border rounded-lg bg-card/50 transition-colors',
        task.status === 'validated' && 'border-green-500/30 bg-green-500/5',
        task.status === 'exported' && 'border-blue-500/30 bg-blue-500/5',
        isSelected && 'ring-2 ring-primary/50'
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Selection checkbox */}
        {task.status !== 'exported' && (
          <div className="shrink-0 mt-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
              className={cn(
                'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                isSelected
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/40 hover:border-muted-foreground'
              )}
            >
              {isSelected && <CheckCircle2 className="h-3 w-3" />}
            </button>
          </div>
        )}

        {/* Status indicator */}
        <div className="shrink-0 mt-0.5">
          <StatusIconComponent
            className={cn(
              'h-5 w-5',
              task.status === 'draft' && 'text-muted-foreground/40',
              task.status === 'validated' && 'text-green-500',
              task.status === 'exported' && 'text-blue-500'
            )}
          />
        </div>

        {/* Task info */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-medium truncate">{effectiveTitle}</h4>
            <Badge
              variant="outline"
              className={cn('text-[10px]', STATUS_COLORS[task.status])}
            >
              {STATUS_LABELS[task.status]}
            </Badge>
            {task.userEdits && (
              <Badge
                variant="outline"
                className="text-[10px] bg-purple-500/10 text-purple-500 border-purple-500/20"
              >
                Edited
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            {module && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {module.name}
              </span>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {task.estimatedEffort || 'Not estimated'}
            </span>
            <span className="text-xs text-muted-foreground">
              Phase {task.phase}
            </span>
          </div>
        </div>

        {/* Expand indicator */}
        <div className="shrink-0 cursor-pointer" onClick={onToggleExpand}>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50">
          {isEditing ? (
            /* Edit mode */
            <div className="space-y-4">
              {/* Title edit */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Title
                </label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Description edit */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Description
                </label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="min-h-[80px] text-sm"
                />
              </div>

              {/* Acceptance criteria edit */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Acceptance Criteria
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={handleAddCriterion}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {editCriteria.map((criterion, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={criterion}
                        onChange={(e) => handleUpdateCriterion(idx, e.target.value)}
                        placeholder={`Criterion ${idx + 1}`}
                        className="text-xs"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveCriterion(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Edit actions */}
              <div className="flex gap-2 pt-2">
                <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit}>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Save Changes
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={onCancelEdit}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            /* View mode */
            <div className="space-y-4">
              {/* Description */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <FileCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Description
                  </span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {effectiveDescription}
                </p>
              </div>

              {/* Acceptance criteria */}
              {effectiveCriteria.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Acceptance Criteria
                    </span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {effectiveCriteria.length}
                    </Badge>
                  </div>
                  <ul className="space-y-1 pl-5">
                    {effectiveCriteria.map((criterion, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-muted-foreground list-disc"
                      >
                        {criterion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Dependencies */}
              {task.dependencies.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Dependencies
                    </span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {task.dependencies.length}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {task.dependencies.map((depId, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/20"
                      >
                        <Link2 className="h-2.5 w-2.5 mr-1" />
                        {depId}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {task.status !== 'exported' && (
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onStartEdit}
                  >
                    <PenLine className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  {task.status === 'draft' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleQuickValidate}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Validate
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Empty State
// ============================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <ListTodo className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h4 className="text-sm font-medium text-muted-foreground mb-1">
        No tasks yet
      </h4>
      <p className="text-xs text-muted-foreground/60">
        Complete the module decomposition to generate implementation tasks.
      </p>
    </div>
  );
}

// ============================================
// Summary Statistics
// ============================================

interface TaskSummaryProps {
  tasks: ArchitectTask[];
  selectedCount: number;
}

function TaskSummary({ tasks, selectedCount }: TaskSummaryProps) {
  const stats = useMemo(() => {
    const draft = tasks.filter((t) => t.status === 'draft').length;
    const validated = tasks.filter((t) => t.status === 'validated').length;
    const exported = tasks.filter((t) => t.status === 'exported').length;
    const phases = new Set(tasks.map((t) => t.phase)).size;
    const withCriteria = tasks.filter((t) => t.acceptanceCriteria.length > 0).length;

    return { draft, validated, exported, phases, withCriteria };
  }, [tasks]);

  return (
    <div className="flex flex-wrap gap-3 px-4 py-2 border-b border-border/50 bg-muted/20">
      {/* Draft count */}
      <div className="flex items-center gap-1.5">
        <Circle className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs text-muted-foreground">
          {stats.draft} draft
        </span>
      </div>

      {/* Validated count */}
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        <span className="text-xs text-muted-foreground">
          {stats.validated} validated
        </span>
      </div>

      {/* Exported count */}
      <div className="flex items-center gap-1.5">
        <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-xs text-muted-foreground">
          {stats.exported} exported
        </span>
      </div>

      {/* Phases */}
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {stats.phases} phases
        </span>
      </div>

      {/* Selection indicator */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-1.5 text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">
            {selectedCount} selected
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================
// Phase Group Header
// ============================================

interface PhaseGroupProps {
  phase: number;
  tasks: ArchitectTask[];
  children: React.ReactNode;
}

function PhaseGroup({ phase, tasks, children }: PhaseGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  const validatedCount = tasks.filter((t) => t.status === 'validated').length;
  const totalCount = tasks.length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-y border-border/50 cursor-pointer hover:bg-muted/50 transition-colors">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">Phase {phase}</span>
          <Badge variant="secondary" className="text-[10px]">
            {validatedCount}/{totalCount} validated
          </Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-4 space-y-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================
// Main Component
// ============================================

/**
 * TaskGenerator - Manage tasks and export to Kanban Board
 *
 * Features:
 * - Task list organized by phase
 * - Edit task details before export
 * - Human validation gates
 * - Bulk selection and export
 * - Task statistics
 */
export function TaskGenerator({
  tasks,
  modules,
  onUpdateTask,
  onValidateTask,
  onExportToKanban,
}: TaskGeneratorProps) {
  const { t } = useTranslation(['common']);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('phase');
  const [isExporting, setIsExporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

  // Create module map for lookups
  const moduleMap = useMemo(
    () => new Map(modules.map((m) => [m.id, m])),
    [modules]
  );

  // Filter tasks by status
  const filteredTasks = useMemo(() => {
    if (statusFilter === 'all') return tasks;
    return tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  // Group tasks by phase
  const tasksByPhase = useMemo(() => {
    const grouped = new Map<number, ArchitectTask[]>();
    for (const task of filteredTasks) {
      if (!grouped.has(task.phase)) {
        grouped.set(task.phase, []);
      }
      grouped.get(task.phase)!.push(task);
    }
    // Sort by phase
    return new Map([...grouped.entries()].sort((a, b) => a[0] - b[0]));
  }, [filteredTasks]);

  // ============================================
  // Handlers
  // ============================================

  /**
   * Toggle task expansion
   */
  const handleToggleExpand = useCallback((taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  /**
   * Toggle task selection
   */
  const handleToggleSelect = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  /**
   * Select all exportable tasks
   */
  const handleSelectAll = useCallback(() => {
    const exportable = filteredTasks.filter((t) => t.status !== 'exported');
    setSelectedTaskIds(new Set(exportable.map((t) => t.id)));
  }, [filteredTasks]);

  /**
   * Deselect all tasks
   */
  const handleDeselectAll = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  /**
   * Validate all selected tasks
   */
  const handleValidateSelected = useCallback(() => {
    for (const taskId of selectedTaskIds) {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status === 'draft') {
        onValidateTask(taskId);
      }
    }
  }, [selectedTaskIds, tasks, onValidateTask]);

  /**
   * Export selected tasks to Kanban
   */
  const handleExportSelected = useCallback(async () => {
    if (selectedTaskIds.size === 0) return;

    setIsExporting(true);
    try {
      await onExportToKanban(Array.from(selectedTaskIds));
      setSelectedTaskIds(new Set());
    } finally {
      setIsExporting(false);
    }
  }, [selectedTaskIds, onExportToKanban]);

  /**
   * Export all validated tasks
   */
  const handleExportValidated = useCallback(async () => {
    const validatedIds = tasks
      .filter((t) => t.status === 'validated')
      .map((t) => t.id);

    if (validatedIds.length === 0) return;

    setIsExporting(true);
    try {
      await onExportToKanban(validatedIds);
    } finally {
      setIsExporting(false);
    }
  }, [tasks, onExportToKanban]);

  // ============================================
  // Computed values
  // ============================================

  const selectedCount = selectedTaskIds.size;
  const draftSelectedCount = useMemo(
    () =>
      Array.from(selectedTaskIds).filter((id) => {
        const task = tasks.find((t) => t.id === id);
        return task?.status === 'draft';
      }).length,
    [selectedTaskIds, tasks]
  );
  const validatedCount = tasks.filter((t) => t.status === 'validated').length;
  const exportableCount = tasks.filter(
    (t) => t.status === 'validated' || t.status === 'draft'
  ).length;

  // ============================================
  // Render
  // ============================================

  if (tasks.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Task Generation</h3>
            <Badge variant="outline" className="text-[10px]">
              0 tasks
            </Badge>
          </div>
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Task Generation</h3>
            <Badge variant="outline" className="text-[10px]">
              {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
            </Badge>
          </div>

          {/* View mode and filter controls */}
          <div className="flex items-center gap-2">
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
              className="text-xs h-6 px-2 rounded border border-border bg-background"
            >
              <option value="all">All status</option>
              <option value="draft">Draft</option>
              <option value="validated">Validated</option>
              <option value="exported">Exported</option>
            </select>

            {/* View mode toggle */}
            <div className="flex border border-border rounded">
              <Button
                variant={viewMode === 'phase' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 rounded-none rounded-l"
                onClick={() => setViewMode('phase')}
              >
                <Layers className="h-3 w-3" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 rounded-none rounded-r"
                onClick={() => setViewMode('list')}
              >
                <List className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary statistics */}
      <TaskSummary tasks={tasks} selectedCount={selectedCount} />

      {/* Bulk actions bar */}
      <div className="shrink-0 px-4 py-2 border-b border-border/50 bg-muted/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={selectedCount > 0 ? handleDeselectAll : handleSelectAll}
          >
            {selectedCount > 0 ? 'Deselect All' : 'Select All'}
          </Button>
          {draftSelectedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleValidateSelected}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Validate Selected ({draftSelectedCount})
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {validatedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleExportValidated}
              disabled={isExporting}
            >
              <Send className="h-3 w-3 mr-1" />
              Export Validated ({validatedCount})
            </Button>
          )}
          {selectedCount > 0 && (
            <Button
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleExportSelected}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Send className="h-3 w-3 mr-1" />
              )}
              Export to Kanban ({selectedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1">
        {viewMode === 'phase' ? (
          /* Phase grouped view */
          <div>
            {Array.from(tasksByPhase.entries()).map(([phase, phaseTasks]) => (
              <PhaseGroup key={phase} phase={phase} tasks={phaseTasks}>
                {phaseTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    module={moduleMap.get(task.moduleId)}
                    isExpanded={expandedTaskIds.has(task.id)}
                    isEditing={editingTaskId === task.id}
                    onToggleExpand={() => handleToggleExpand(task.id)}
                    onStartEdit={() => setEditingTaskId(task.id)}
                    onCancelEdit={() => setEditingTaskId(null)}
                    onUpdateTask={onUpdateTask}
                    onValidateTask={onValidateTask}
                    isSelected={selectedTaskIds.has(task.id)}
                    onToggleSelect={() => handleToggleSelect(task.id)}
                  />
                ))}
              </PhaseGroup>
            ))}
          </div>
        ) : (
          /* Flat list view */
          <div className="p-4 space-y-3">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                module={moduleMap.get(task.moduleId)}
                isExpanded={expandedTaskIds.has(task.id)}
                isEditing={editingTaskId === task.id}
                onToggleExpand={() => handleToggleExpand(task.id)}
                onStartEdit={() => setEditingTaskId(task.id)}
                onCancelEdit={() => setEditingTaskId(null)}
                onUpdateTask={onUpdateTask}
                onValidateTask={onValidateTask}
                isSelected={selectedTaskIds.has(task.id)}
                onToggleSelect={() => handleToggleSelect(task.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Export footer */}
      {exportableCount > 0 && selectedCount === 0 && (
        <div className="shrink-0 p-4 border-t border-border bg-card/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>
                Select tasks or validate them to export to Kanban Board
              </span>
            </div>
            {validatedCount > 0 && (
              <Button
                size="sm"
                onClick={handleExportValidated}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Export {validatedCount} Validated Tasks
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskGenerator;
