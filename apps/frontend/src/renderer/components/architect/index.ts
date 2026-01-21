// Architect Mode exports
// AI-powered architectural planning feature

// ============================================
// Main Component
// ============================================
export { ArchitectTab } from './components/ArchitectTab';

// ============================================
// Sub-components
// ============================================
export { InterviewPanel } from './components/InterviewPanel';
export { SchemaViewer } from './components/SchemaViewer';
export { ModuleList } from './components/ModuleList';
export { TaskGenerator } from './components/TaskGenerator';

// ============================================
// Hooks
// ============================================
export { useArchitectSession, useArchitectListeners } from './hooks/useArchitectSession';
export { useDiagramRenderer } from './hooks/useDiagramRenderer';
export { useTaskGeneration } from './hooks/useTaskGeneration';

// ============================================
// Store (re-exported from stores for convenience)
// ============================================
export {
  useArchitectStore,
  startArchitectSession,
  loadArchitectSession,
  deleteArchitectSession,
  sendArchitectMessage,
  saveArchitectSession,
  exportTasksToKanban,
  getArchitectSessions,
  getCurrentSession,
  getCurrentSchemas,
  getCurrentModules,
  getCurrentTasks,
  getValidatedTasks,
  getTasksByPhase,
  getInterviewMessageCount,
  hasUnsavedChanges,
  // Session persistence utilities
  isStoreHydrated,
  waitForHydration,
  hasResumableSession,
  getResumableSessionInfo,
} from '../../stores/architect';

// ============================================
// Utilities
// ============================================
export { parseSchemaFromText, extractMermaidBlocks, validateMermaidSyntax } from './utils/schemaParser';
export { formatTaskForKanban, formatTasksForExport, groupTasksByPhase, sortTasksByDependency } from './utils/taskFormatter';

// ============================================
// Types
// ============================================
export type {
  // Status types
  SessionStatus,
  TaskStatus,
  ModuleComplexity,
  SchemaType,
  MessageRole,
  // Interview types
  InterviewMessage,
  // Schema types
  ArchitectSchema,
  DiagramRenderResult,
  // Module types
  ModuleDefinition,
  // Task types
  ArchitectTask,
  // Session types
  ArchitectSession,
  ArchitectSessionSummary,
  // Store types
  ArchitectState,
  ArchitectActions,
  ArchitectStore,
  // IPC types
  ArchitectInterviewOptions,
  ArchitectStreamMessage,
  ParsedSchemaResult,
  ParsedModuleResult,
  ParsedTaskResult,
  // Props types
  ArchitectTabProps,
  InterviewPanelProps,
  SchemaViewerProps,
  ModuleListProps,
  TaskGeneratorProps,
} from './types/architect.types';
