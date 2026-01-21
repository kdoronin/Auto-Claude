/**
 * ArchitectTab - Main container component for AI-powered architectural planning
 *
 * This is the top-level component for the Architect feature, integrating:
 * - InterviewPanel: AI conversation interface
 * - SchemaViewer: Mermaid diagram visualization
 * - ModuleList: Module decomposition display
 * - TaskGenerator: Task management and Kanban export
 *
 * Layout:
 * - Header: Session controls, project info, status
 * - Main content: Split view with interview/schema at top, modules/tasks at bottom
 *
 * Follows patterns from:
 * - RoadmapTabs.tsx for tab-based layouts
 * - RoadmapHeader.tsx for header controls
 */
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Plus,
  FolderOpen,
  Save,
  Trash2,
  RefreshCw,
  ChevronRight,
  Loader2,
  AlertCircle,
  MessageSquare,
  Share2,
  Boxes,
  ListTodo,
  Play,
  Settings,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Card } from '../../ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { ScrollArea } from '../../ui/scroll-area';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../ui/alert-dialog';
import { cn } from '../../../lib/utils';
import { InterviewPanel } from './InterviewPanel';
import { SchemaViewer } from './SchemaViewer';
import { ModuleList } from './ModuleList';
import { TaskGenerator } from './TaskGenerator';
import { useArchitectSession } from '../hooks/useArchitectSession';
import { useArchitectStore } from '../../../stores/architect';
import type {
  ArchitectTabProps,
  ArchitectSession,
  ArchitectSessionSummary,
  SessionStatus,
  ArchitectTask,
} from '../types/architect.types';

// ============================================
// Constants
// ============================================

/**
 * Status labels for workflow stages
 */
const STATUS_LABELS: Record<SessionStatus, string> = {
  interview: 'Interview',
  schemas: 'Schemas',
  modules: 'Modules',
  tasks: 'Tasks',
  complete: 'Complete',
};

/**
 * Status colors
 */
const STATUS_COLORS: Record<SessionStatus, string> = {
  interview: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  schemas: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  modules: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  tasks: 'bg-green-500/10 text-green-500 border-green-500/20',
  complete: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
};

/**
 * Workflow steps for the progress indicator
 */
const WORKFLOW_STEPS: SessionStatus[] = ['interview', 'schemas', 'modules', 'tasks', 'complete'];

/**
 * Tab options for bottom panel
 */
type BottomTab = 'modules' | 'tasks';

// ============================================
// Sub-components
// ============================================

/**
 * Workflow progress indicator
 */
interface WorkflowProgressProps {
  currentStatus: SessionStatus;
  onNavigateToStep?: (status: SessionStatus) => void;
}

function WorkflowProgress({ currentStatus, onNavigateToStep }: WorkflowProgressProps) {
  const currentIndex = WORKFLOW_STEPS.indexOf(currentStatus);

  return (
    <div className="flex items-center gap-1">
      {WORKFLOW_STEPS.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;
        const canNavigate = index <= currentIndex && onNavigateToStep;

        return (
          <div key={step} className="flex items-center">
            <button
              onClick={() => canNavigate && onNavigateToStep(step)}
              disabled={!canNavigate}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                isActive && 'bg-primary text-primary-foreground font-medium',
                isCompleted && 'text-muted-foreground hover:text-foreground cursor-pointer',
                !isActive && !isCompleted && 'text-muted-foreground/40 cursor-not-allowed'
              )}
            >
              {STATUS_LABELS[step]}
            </button>
            {index < WORKFLOW_STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground/40 mx-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Session selector dialog content
 */
interface SessionSelectorProps {
  sessions: ArchitectSessionSummary[];
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  isLoading: boolean;
}

function SessionSelector({ sessions, onSelect, onDelete, isLoading }: SessionSelectorProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground">No previous sessions found</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Start a new session to begin architectural planning
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-64">
      <div className="space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
          >
            <button
              onClick={() => onSelect(session.id)}
              className="flex-1 text-left"
              disabled={isLoading}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{session.projectName}</span>
                <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[session.status])}>
                  {STATUS_LABELS[session.status]}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>{session.schemaCount} schemas</span>
                <span>{session.moduleCount} modules</span>
                <span>{session.taskCount} tasks</span>
              </div>
              <div className="text-[10px] text-muted-foreground/60 mt-1">
                Updated {new Date(session.updatedAt).toLocaleDateString()}
              </div>
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Session</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete the session "{session.projectName}"? This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(session.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

/**
 * New session dialog content
 */
interface NewSessionDialogProps {
  onSubmit: (projectName: string, projectDescription?: string) => void;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NewSessionDialog({ onSubmit, isLoading, open, onOpenChange }: NewSessionDialogProps) {
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');

  const handleSubmit = useCallback(() => {
    if (!projectName.trim()) return;
    onSubmit(projectName.trim(), projectDescription.trim() || undefined);
    setProjectName('');
    setProjectDescription('');
    onOpenChange(false);
  }, [projectName, projectDescription, onSubmit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Architecture Session</DialogTitle>
          <DialogDescription>
            Start a new architecture planning session. The AI architect will guide you through a
            comprehensive interview to understand your project requirements.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Project Name</label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My Project"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Brief description of your project..."
              disabled={isLoading}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!projectName.trim() || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Session
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Empty state when no session is active
 */
interface EmptyStateProps {
  onNewSession: () => void;
  onOpenSession: () => void;
  hasExistingSessions: boolean;
}

function EmptyState({ onNewSession, onOpenSession, hasExistingSessions }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Building2 className="h-16 w-16 text-muted-foreground/30 mb-6" />
      <h2 className="text-xl font-semibold mb-2">AI-Powered Architecture</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Start an architecture session to have an AI architect guide you through comprehensive
        project planning, generate architectural diagrams, and create detailed implementation tasks.
      </p>
      <div className="flex gap-3">
        <Button onClick={onNewSession}>
          <Plus className="h-4 w-4 mr-2" />
          New Session
        </Button>
        {hasExistingSessions && (
          <Button variant="outline" onClick={onOpenSession}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Open Session
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

/**
 * ArchitectTab - Main container for AI-powered architectural planning
 *
 * Features:
 * - Session management (create, load, delete, save)
 * - Interview panel for AI conversation
 * - Schema viewer for Mermaid diagrams
 * - Module list for decomposition
 * - Task generator for Kanban export
 * - Workflow progress indicator
 */
export function ArchitectTab({ onNavigateToTask }: ArchitectTabProps) {
  const { t } = useTranslation(['common']);

  // State
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [showSessionSelector, setShowSessionSelector] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>('modules');
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | undefined>();

  // Use architect session hook
  const {
    session,
    sessions,
    isLoading,
    isStreaming,
    error,
    startSession,
    loadSession,
    deleteSession,
    saveSession,
    clearSession,
    sendMessage,
    stopInterview,
    transitionStatus,
    clearError,
  } = useArchitectSession({
    projectId: 'default', // TODO: Get from props or context
    onNavigateToTask,
  });

  // Store actions for module/task updates
  const validateModule = useArchitectStore((state) => state.validateModule);
  const updateTask = useArchitectStore((state) => state.updateTask);
  const validateTask = useArchitectStore((state) => state.validateTask);
  const exportTasksToKanban = useArchitectStore((state) => state.exportTasksToKanban);

  // ============================================
  // Handlers
  // ============================================

  /**
   * Handle new session creation
   */
  const handleNewSession = useCallback(() => {
    setShowNewSessionDialog(true);
  }, []);

  /**
   * Handle opening session selector
   */
  const handleOpenSession = useCallback(() => {
    setShowSessionSelector(true);
  }, []);

  /**
   * Handle session selection
   */
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      loadSession(sessionId);
      setShowSessionSelector(false);
    },
    [loadSession]
  );

  /**
   * Handle session creation
   */
  const handleCreateSession = useCallback(
    async (projectName: string, projectDescription?: string) => {
      await startSession(projectName, projectDescription);
    },
    [startSession]
  );

  /**
   * Handle schema selection
   */
  const handleSchemaSelect = useCallback((schemaId: string) => {
    setSelectedSchemaId(schemaId);
  }, []);

  /**
   * Handle workflow navigation
   */
  const handleNavigateToStep = useCallback(
    (status: SessionStatus) => {
      transitionStatus(status);
    },
    [transitionStatus]
  );

  /**
   * Handle module validation
   */
  const handleValidateModule = useCallback(
    (moduleId: string, notes?: string) => {
      validateModule(moduleId, notes);
    },
    [validateModule]
  );

  /**
   * Handle task update
   */
  const handleUpdateTask = useCallback(
    (taskId: string, updates: Partial<ArchitectTask>) => {
      updateTask(taskId, updates);
    },
    [updateTask]
  );

  /**
   * Handle task validation
   */
  const handleValidateTask = useCallback(
    (taskId: string) => {
      validateTask(taskId);
    },
    [validateTask]
  );

  /**
   * Handle task export
   */
  const handleExportToKanban = useCallback(
    async (taskIds: string[]) => {
      await exportTasksToKanban(taskIds);
    },
    [exportTasksToKanban]
  );

  // ============================================
  // Computed Values
  // ============================================

  const hasSession = !!session;
  const hasExistingSessions = sessions.length > 0;
  const hasDirtyChanges = session?.isDirty ?? false;

  // Session data
  const schemas = session?.schemas ?? [];
  const modules = session?.modules ?? [];
  const tasks = session?.tasks ?? [];

  // ============================================
  // Render
  // ============================================

  // Show empty state if no active session
  if (!hasSession) {
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-border bg-card/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Architect</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenSession} disabled={!hasExistingSessions}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Open
              </Button>
              <Button size="sm" onClick={handleNewSession}>
                <Plus className="h-4 w-4 mr-2" />
                New Session
              </Button>
            </div>
          </div>
        </div>

        {/* Empty state */}
        <EmptyState
          onNewSession={handleNewSession}
          onOpenSession={handleOpenSession}
          hasExistingSessions={hasExistingSessions}
        />

        {/* Dialogs */}
        <NewSessionDialog
          onSubmit={handleCreateSession}
          isLoading={isLoading}
          open={showNewSessionDialog}
          onOpenChange={setShowNewSessionDialog}
        />

        <Dialog open={showSessionSelector} onOpenChange={setShowSessionSelector}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Open Session</DialogTitle>
              <DialogDescription>Select a previous architecture session to continue.</DialogDescription>
            </DialogHeader>
            <SessionSelector
              sessions={sessions}
              onSelect={handleSelectSession}
              onDelete={deleteSession}
              isLoading={isLoading}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Active session view
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-border bg-card/50">
        <div className="flex items-center justify-between">
          {/* Left: Project info */}
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold">{session.projectName}</h1>
                <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[session.status])}>
                  {STATUS_LABELS[session.status]}
                </Badge>
                {hasDirtyChanges && (
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                    Unsaved
                  </Badge>
                )}
                {isStreaming && (
                  <Badge variant="outline" className="text-[10px]">
                    <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                    Streaming
                  </Badge>
                )}
              </div>
              {session.projectDescription && (
                <p className="text-xs text-muted-foreground truncate max-w-md">
                  {session.projectDescription}
                </p>
              )}
            </div>
          </div>

          {/* Center: Workflow progress */}
          <WorkflowProgress currentStatus={session.status} onNavigateToStep={handleNavigateToStep} />

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => saveSession()} disabled={!hasDirtyChanges || isLoading}>
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={handleOpenSession}>
              <FolderOpen className="h-4 w-4 mr-1" />
              Open
            </Button>
            <Button variant="ghost" size="sm" onClick={handleNewSession}>
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 px-6 py-2 bg-destructive/10 border-b border-destructive/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={clearError} className="text-destructive hover:text-destructive">
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Top section: Interview + Schemas (split horizontally) */}
        <div className="flex-1 min-h-0 flex">
          {/* Interview Panel */}
          <div className="w-1/2 border-r border-border">
            <InterviewPanel
              session={session}
              onSendMessage={sendMessage}
              isStreaming={isStreaming}
              onStopInterview={stopInterview}
            />
          </div>

          {/* Schema Viewer */}
          <div className="w-1/2">
            <SchemaViewer
              schemas={schemas}
              onSchemaSelect={handleSchemaSelect}
              selectedSchemaId={selectedSchemaId}
            />
          </div>
        </div>

        {/* Bottom section: Modules + Tasks (tabbed) */}
        <div className="h-[40%] min-h-[300px] border-t border-border">
          <Tabs
            value={bottomTab}
            onValueChange={(v) => setBottomTab(v as BottomTab)}
            className="h-full flex flex-col"
          >
            <TabsList className="shrink-0 mx-4 mt-2 justify-start">
              <TabsTrigger value="modules" className="text-xs">
                <Boxes className="h-3.5 w-3.5 mr-1.5" />
                Modules
                {modules.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">
                    {modules.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs">
                <ListTodo className="h-3.5 w-3.5 mr-1.5" />
                Tasks
                {tasks.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">
                    {tasks.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="modules" className="flex-1 min-h-0">
              <ModuleList modules={modules} onValidateModule={handleValidateModule} />
            </TabsContent>

            <TabsContent value="tasks" className="flex-1 min-h-0">
              <TaskGenerator
                tasks={tasks}
                modules={modules}
                onUpdateTask={handleUpdateTask}
                onValidateTask={handleValidateTask}
                onExportToKanban={handleExportToKanban}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      <NewSessionDialog
        onSubmit={handleCreateSession}
        isLoading={isLoading}
        open={showNewSessionDialog}
        onOpenChange={setShowNewSessionDialog}
      />

      <Dialog open={showSessionSelector} onOpenChange={setShowSessionSelector}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open Session</DialogTitle>
            <DialogDescription>Select a previous architecture session to continue.</DialogDescription>
          </DialogHeader>
          <SessionSelector
            sessions={sessions}
            onSelect={handleSelectSession}
            onDelete={deleteSession}
            isLoading={isLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ArchitectTab;
