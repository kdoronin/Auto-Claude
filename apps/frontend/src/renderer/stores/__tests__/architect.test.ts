/**
 * Unit tests for Architect Store
 * Tests Zustand store for architect state management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
  hasUnsavedChanges
} from '../architect';
import type {
  ArchitectSession,
  ArchitectSessionSummary,
  ArchitectSchema,
  ModuleDefinition,
  ArchitectTask,
  InterviewMessage,
  SessionStatus,
  ArchitectState
} from '../../components/architect/types/architect.types';

// Helper to create test session
function createTestSession(overrides: Partial<ArchitectSession> = {}): ArchitectSession {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    projectName: 'Test Project',
    projectDescription: 'Test description',
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'interview',
    interviewHistory: [],
    schemas: [],
    modules: [],
    tasks: [],
    isDirty: false,
    ...overrides
  };
}

// Helper to create test session summary
function createTestSessionSummary(overrides: Partial<ArchitectSessionSummary> = {}): ArchitectSessionSummary {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    projectName: 'Test Project',
    status: 'interview',
    schemaCount: 0,
    moduleCount: 0,
    taskCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// Helper to create test schema
function createTestSchema(overrides: Partial<ArchitectSchema> = {}): ArchitectSchema {
  return {
    id: `schema-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    sessionId: 'test-session',
    type: 'system',
    title: 'Test Schema',
    mermaidCode: 'flowchart TD\n  A --> B',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// Helper to create test module
function createTestModule(overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    id: `module-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    sessionId: 'test-session',
    name: 'Test Module',
    description: 'Test module description',
    responsibilities: ['Responsibility 1'],
    entities: ['Entity 1'],
    dependencies: [],
    estimatedComplexity: 'medium',
    ...overrides
  };
}

// Helper to create test task
function createTestTask(overrides: Partial<ArchitectTask> = {}): ArchitectTask {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    moduleId: 'test-module',
    title: 'Test Task',
    description: 'Test task description',
    acceptanceCriteria: ['Criteria 1'],
    dependencies: [],
    phase: 1,
    estimatedEffort: '2-4 hours',
    status: 'draft',
    ...overrides
  };
}

// Helper to create test message
function createTestMessage(overrides: Partial<InterviewMessage> = {}): InterviewMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    role: 'user',
    content: 'Test message',
    timestamp: new Date(),
    ...overrides
  };
}

// Initial state for reset
const initialState: ArchitectState = {
  sessions: [],
  currentSession: null,
  isLoading: false,
  error: null,
  isStreaming: false
};

describe('Architect Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useArchitectStore.setState(initialState);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useArchitectStore.getState();

      expect(state.sessions).toEqual([]);
      expect(state.currentSession).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('startSession', () => {
    it('should create a new session with required fields', async () => {
      await useArchitectStore.getState().startSession('New Project');

      const state = useArchitectStore.getState();
      expect(state.currentSession).not.toBeNull();
      expect(state.currentSession?.projectName).toBe('New Project');
      expect(state.currentSession?.status).toBe('interview');
      expect(state.currentSession?.interviewHistory).toEqual([]);
      expect(state.currentSession?.schemas).toEqual([]);
      expect(state.currentSession?.modules).toEqual([]);
      expect(state.currentSession?.tasks).toEqual([]);
    });

    it('should create a session with optional description', async () => {
      await useArchitectStore.getState().startSession('New Project', 'Project description');

      const state = useArchitectStore.getState();
      expect(state.currentSession?.projectDescription).toBe('Project description');
    });

    it('should add session summary to sessions list', async () => {
      await useArchitectStore.getState().startSession('New Project');

      const state = useArchitectStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].projectName).toBe('New Project');
    });

    it('should prepend new session to sessions list', async () => {
      useArchitectStore.setState({
        ...initialState,
        sessions: [createTestSessionSummary({ id: 'old-session', projectName: 'Old Project' })]
      });

      await useArchitectStore.getState().startSession('New Project');

      const state = useArchitectStore.getState();
      expect(state.sessions).toHaveLength(2);
      expect(state.sessions[0].projectName).toBe('New Project');
      expect(state.sessions[1].projectName).toBe('Old Project');
    });

    it('should set isLoading to false after completion', async () => {
      await useArchitectStore.getState().startSession('New Project');

      expect(useArchitectStore.getState().isLoading).toBe(false);
    });

    it('should generate unique session IDs', async () => {
      await useArchitectStore.getState().startSession('Project 1');
      const session1Id = useArchitectStore.getState().currentSession?.id;

      await useArchitectStore.getState().startSession('Project 2');
      const session2Id = useArchitectStore.getState().currentSession?.id;

      expect(session1Id).not.toBe(session2Id);
    });
  });

  describe('loadSession', () => {
    it('should set error when session not found', async () => {
      await useArchitectStore.getState().loadSession('nonexistent-session');

      const state = useArchitectStore.getState();
      expect(state.error).toContain('not found');
    });

    it('should set isLoading to false after completion', async () => {
      useArchitectStore.setState({
        ...initialState,
        sessions: [createTestSessionSummary({ id: 'existing-session' })]
      });

      await useArchitectStore.getState().loadSession('existing-session');

      expect(useArchitectStore.getState().isLoading).toBe(false);
    });

    it('should clear error when starting load', async () => {
      useArchitectStore.setState({
        ...initialState,
        error: 'Previous error',
        sessions: [createTestSessionSummary({ id: 'existing-session' })]
      });

      await useArchitectStore.getState().loadSession('existing-session');

      // Error is cleared at start but may be set again if load fails
      // In this case it should remain null since session exists
      expect(useArchitectStore.getState().error).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should remove session from sessions list', async () => {
      useArchitectStore.setState({
        ...initialState,
        sessions: [
          createTestSessionSummary({ id: 'session-1' }),
          createTestSessionSummary({ id: 'session-2' })
        ]
      });

      await useArchitectStore.getState().deleteSession('session-1');

      const state = useArchitectStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].id).toBe('session-2');
    });

    it('should clear currentSession if deleted session is active', async () => {
      const session = createTestSession({ id: 'active-session' });
      useArchitectStore.setState({
        ...initialState,
        sessions: [createTestSessionSummary({ id: 'active-session' })],
        currentSession: session
      });

      await useArchitectStore.getState().deleteSession('active-session');

      expect(useArchitectStore.getState().currentSession).toBeNull();
    });

    it('should not clear currentSession if different session is deleted', async () => {
      const session = createTestSession({ id: 'active-session' });
      useArchitectStore.setState({
        ...initialState,
        sessions: [
          createTestSessionSummary({ id: 'active-session' }),
          createTestSessionSummary({ id: 'other-session' })
        ],
        currentSession: session
      });

      await useArchitectStore.getState().deleteSession('other-session');

      expect(useArchitectStore.getState().currentSession?.id).toBe('active-session');
    });

    it('should handle deleting nonexistent session gracefully', async () => {
      useArchitectStore.setState({
        ...initialState,
        sessions: [createTestSessionSummary({ id: 'existing-session' })]
      });

      await useArchitectStore.getState().deleteSession('nonexistent-session');

      expect(useArchitectStore.getState().sessions).toHaveLength(1);
    });
  });

  describe('addMessage', () => {
    it('should add user message to interview history', async () => {
      const session = createTestSession();
      useArchitectStore.setState({ ...initialState, currentSession: session });

      await useArchitectStore.getState().addMessage('Hello AI');

      const state = useArchitectStore.getState();
      expect(state.currentSession?.interviewHistory).toHaveLength(1);
      expect(state.currentSession?.interviewHistory[0].role).toBe('user');
      expect(state.currentSession?.interviewHistory[0].content).toBe('Hello AI');
    });

    it('should set error when no active session', async () => {
      useArchitectStore.setState({ ...initialState, currentSession: null });

      await useArchitectStore.getState().addMessage('Hello');

      expect(useArchitectStore.getState().error).toBe('No active session');
    });

    it('should set isStreaming to true after adding message', async () => {
      const session = createTestSession();
      useArchitectStore.setState({ ...initialState, currentSession: session });

      await useArchitectStore.getState().addMessage('Hello AI');

      expect(useArchitectStore.getState().isStreaming).toBe(true);
    });

    it('should mark session as dirty', async () => {
      const session = createTestSession({ isDirty: false });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      await useArchitectStore.getState().addMessage('Hello AI');

      expect(useArchitectStore.getState().currentSession?.isDirty).toBe(true);
    });

    it('should update session updatedAt timestamp', async () => {
      const oldDate = new Date('2024-01-01');
      const session = createTestSession({ updatedAt: oldDate });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      await useArchitectStore.getState().addMessage('Hello AI');

      expect(useArchitectStore.getState().currentSession?.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });

  describe('handleStreamMessage', () => {
    it('should create new assistant message when no streaming message exists', () => {
      const session = createTestSession({
        interviewHistory: [createTestMessage({ role: 'user', content: 'Hello' })]
      });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().handleStreamMessage({ content: 'Hi there!', isStreaming: true });

      const state = useArchitectStore.getState();
      expect(state.currentSession?.interviewHistory).toHaveLength(2);
      expect(state.currentSession?.interviewHistory[1].role).toBe('assistant');
      expect(state.currentSession?.interviewHistory[1].content).toBe('Hi there!');
    });

    it('should append to existing streaming assistant message', () => {
      const session = createTestSession({
        interviewHistory: [
          createTestMessage({ role: 'user', content: 'Hello' }),
          createTestMessage({ role: 'assistant', content: 'Hi', isStreaming: true })
        ]
      });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().handleStreamMessage({ content: ' there!', isStreaming: true });

      const state = useArchitectStore.getState();
      expect(state.currentSession?.interviewHistory).toHaveLength(2);
      expect(state.currentSession?.interviewHistory[1].content).toBe('Hi there!');
    });

    it('should mark message as not streaming when isStreaming is false', () => {
      const session = createTestSession({
        interviewHistory: [
          createTestMessage({ role: 'user', content: 'Hello' }),
          createTestMessage({ role: 'assistant', content: 'Hi', isStreaming: true })
        ]
      });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().handleStreamMessage({ content: ' there!', isStreaming: false });

      const state = useArchitectStore.getState();
      expect(state.currentSession?.interviewHistory[1].isStreaming).toBe(false);
      expect(state.isStreaming).toBe(false);
    });

    it('should handle thinking content', () => {
      const session = createTestSession({
        interviewHistory: [createTestMessage({ role: 'user', content: 'Hello' })]
      });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().handleStreamMessage({
        content: 'Response',
        thinking: 'Let me think...',
        isStreaming: true
      });

      const state = useArchitectStore.getState();
      expect(state.currentSession?.interviewHistory[1].thinking).toBe('Let me think...');
    });

    it('should do nothing when no current session', () => {
      useArchitectStore.setState({ ...initialState, currentSession: null });

      useArchitectStore.getState().handleStreamMessage({ content: 'Hi', isStreaming: true });

      expect(useArchitectStore.getState().currentSession).toBeNull();
    });
  });

  describe('updateSchema', () => {
    it('should update schema content', () => {
      const schema = createTestSchema({ id: 'schema-1', mermaidCode: 'old code' });
      const session = createTestSession({ schemas: [schema] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateSchema('schema-1', 'new code');

      const state = useArchitectStore.getState();
      expect(state.currentSession?.schemas[0].mermaidCode).toBe('new code');
    });

    it('should increment schema version', () => {
      const schema = createTestSchema({ id: 'schema-1', version: 1 });
      const session = createTestSession({ schemas: [schema] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateSchema('schema-1', 'new code');

      expect(useArchitectStore.getState().currentSession?.schemas[0].version).toBe(2);
    });

    it('should update schema updatedAt timestamp', () => {
      const oldDate = new Date('2024-01-01');
      const schema = createTestSchema({ id: 'schema-1', updatedAt: oldDate });
      const session = createTestSession({ schemas: [schema] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateSchema('schema-1', 'new code');

      expect(useArchitectStore.getState().currentSession?.schemas[0].updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it('should not modify other schemas', () => {
      const schema1 = createTestSchema({ id: 'schema-1', mermaidCode: 'code 1' });
      const schema2 = createTestSchema({ id: 'schema-2', mermaidCode: 'code 2' });
      const session = createTestSession({ schemas: [schema1, schema2] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateSchema('schema-1', 'new code');

      expect(useArchitectStore.getState().currentSession?.schemas[1].mermaidCode).toBe('code 2');
    });

    it('should mark session as dirty', () => {
      const schema = createTestSchema({ id: 'schema-1' });
      const session = createTestSession({ schemas: [schema], isDirty: false });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateSchema('schema-1', 'new code');

      expect(useArchitectStore.getState().currentSession?.isDirty).toBe(true);
    });
  });

  describe('validateModule', () => {
    it('should mark module as validated', () => {
      const module = createTestModule({ id: 'module-1', isValidated: false });
      const session = createTestSession({ modules: [module] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().validateModule('module-1');

      expect(useArchitectStore.getState().currentSession?.modules[0].isValidated).toBe(true);
    });

    it('should add validation notes', () => {
      const module = createTestModule({ id: 'module-1' });
      const session = createTestSession({ modules: [module] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().validateModule('module-1', 'Looks good!');

      expect(useArchitectStore.getState().currentSession?.modules[0].validationNotes).toBe('Looks good!');
    });

    it('should not modify other modules', () => {
      const module1 = createTestModule({ id: 'module-1', isValidated: false });
      const module2 = createTestModule({ id: 'module-2', isValidated: false });
      const session = createTestSession({ modules: [module1, module2] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().validateModule('module-1');

      expect(useArchitectStore.getState().currentSession?.modules[1].isValidated).toBeFalsy();
    });
  });

  describe('updateTask', () => {
    it('should update task with partial data', () => {
      const task = createTestTask({ id: 'task-1', title: 'Original Title' });
      const session = createTestSession({ tasks: [task] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateTask('task-1', { title: 'Updated Title' });

      expect(useArchitectStore.getState().currentSession?.tasks[0].title).toBe('Updated Title');
    });

    it('should preserve other task fields', () => {
      const task = createTestTask({ id: 'task-1', title: 'Title', description: 'Desc' });
      const session = createTestSession({ tasks: [task] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateTask('task-1', { title: 'New Title' });

      expect(useArchitectStore.getState().currentSession?.tasks[0].description).toBe('Desc');
    });

    it('should not modify other tasks', () => {
      const task1 = createTestTask({ id: 'task-1', title: 'Task 1' });
      const task2 = createTestTask({ id: 'task-2', title: 'Task 2' });
      const session = createTestSession({ tasks: [task1, task2] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateTask('task-1', { title: 'Updated' });

      expect(useArchitectStore.getState().currentSession?.tasks[1].title).toBe('Task 2');
    });
  });

  describe('validateTask', () => {
    it('should change task status to validated', () => {
      const task = createTestTask({ id: 'task-1', status: 'draft' });
      const session = createTestSession({ tasks: [task] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().validateTask('task-1');

      expect(useArchitectStore.getState().currentSession?.tasks[0].status).toBe('validated');
    });

    it('should not modify other tasks', () => {
      const task1 = createTestTask({ id: 'task-1', status: 'draft' });
      const task2 = createTestTask({ id: 'task-2', status: 'draft' });
      const session = createTestSession({ tasks: [task1, task2] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().validateTask('task-1');

      expect(useArchitectStore.getState().currentSession?.tasks[1].status).toBe('draft');
    });
  });

  describe('exportTasksToKanban', () => {
    it('should mark tasks as exported', async () => {
      const task1 = createTestTask({ id: 'task-1', status: 'validated' });
      const task2 = createTestTask({ id: 'task-2', status: 'validated' });
      const session = createTestSession({ tasks: [task1, task2] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      await useArchitectStore.getState().exportTasksToKanban(['task-1', 'task-2']);

      const state = useArchitectStore.getState();
      expect(state.currentSession?.tasks[0].status).toBe('exported');
      expect(state.currentSession?.tasks[1].status).toBe('exported');
    });

    it('should only mark specified tasks as exported', async () => {
      const task1 = createTestTask({ id: 'task-1', status: 'validated' });
      const task2 = createTestTask({ id: 'task-2', status: 'validated' });
      const session = createTestSession({ tasks: [task1, task2] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      await useArchitectStore.getState().exportTasksToKanban(['task-1']);

      const state = useArchitectStore.getState();
      expect(state.currentSession?.tasks[0].status).toBe('exported');
      expect(state.currentSession?.tasks[1].status).toBe('validated');
    });

    it('should set error when no active session', async () => {
      useArchitectStore.setState({ ...initialState, currentSession: null });

      await useArchitectStore.getState().exportTasksToKanban(['task-1']);

      expect(useArchitectStore.getState().error).toBe('No active session');
    });

    it('should mark session as dirty', async () => {
      const task = createTestTask({ id: 'task-1', status: 'validated' });
      const session = createTestSession({ tasks: [task], isDirty: false });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      await useArchitectStore.getState().exportTasksToKanban(['task-1']);

      expect(useArchitectStore.getState().currentSession?.isDirty).toBe(true);
    });
  });

  describe('saveSession', () => {
    it('should clear isDirty flag', async () => {
      const session = createTestSession({ isDirty: true });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      await useArchitectStore.getState().saveSession();

      expect(useArchitectStore.getState().currentSession?.isDirty).toBe(false);
    });

    it('should update session summary in sessions list', async () => {
      const session = createTestSession({ id: 'test-session' });
      useArchitectStore.setState({
        ...initialState,
        sessions: [createTestSessionSummary({ id: 'test-session' })],
        currentSession: session
      });

      await useArchitectStore.getState().saveSession();

      expect(useArchitectStore.getState().sessions[0].id).toBe('test-session');
    });

    it('should do nothing when no current session', async () => {
      useArchitectStore.setState({ ...initialState, currentSession: null });

      await useArchitectStore.getState().saveSession();

      // Should not throw
      expect(useArchitectStore.getState().isLoading).toBe(false);
    });
  });

  describe('clearCurrentSession', () => {
    it('should set currentSession to null', () => {
      const session = createTestSession();
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().clearCurrentSession();

      expect(useArchitectStore.getState().currentSession).toBeNull();
    });

    it('should set isStreaming to false', () => {
      const session = createTestSession();
      useArchitectStore.setState({ ...initialState, currentSession: session, isStreaming: true });

      useArchitectStore.getState().clearCurrentSession();

      expect(useArchitectStore.getState().isStreaming).toBe(false);
    });
  });

  describe('setError / clearError', () => {
    it('should set error message', () => {
      useArchitectStore.getState().setError('Something went wrong');

      expect(useArchitectStore.getState().error).toBe('Something went wrong');
    });

    it('should clear error with clearError', () => {
      useArchitectStore.setState({ ...initialState, error: 'Some error' });

      useArchitectStore.getState().clearError();

      expect(useArchitectStore.getState().error).toBeNull();
    });

    it('should clear error with setError(null)', () => {
      useArchitectStore.setState({ ...initialState, error: 'Some error' });

      useArchitectStore.getState().setError(null);

      expect(useArchitectStore.getState().error).toBeNull();
    });
  });

  describe('transitionStatus', () => {
    it('should update session status', () => {
      const session = createTestSession({ status: 'interview' });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().transitionStatus('schemas');

      expect(useArchitectStore.getState().currentSession?.status).toBe('schemas');
    });

    it('should transition through all status values', () => {
      const statuses: SessionStatus[] = ['interview', 'schemas', 'modules', 'tasks', 'complete'];

      statuses.forEach(status => {
        const session = createTestSession();
        useArchitectStore.setState({ ...initialState, currentSession: session });

        useArchitectStore.getState().transitionStatus(status);

        expect(useArchitectStore.getState().currentSession?.status).toBe(status);
      });
    });

    it('should mark session as dirty', () => {
      const session = createTestSession({ isDirty: false });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().transitionStatus('schemas');

      expect(useArchitectStore.getState().currentSession?.isDirty).toBe(true);
    });

    it('should update session updatedAt', () => {
      const oldDate = new Date('2024-01-01');
      const session = createTestSession({ updatedAt: oldDate });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().transitionStatus('schemas');

      expect(useArchitectStore.getState().currentSession?.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });

  describe('regenerateSchemas', () => {
    it('should set error when no active session', async () => {
      useArchitectStore.setState({ ...initialState, currentSession: null });

      await useArchitectStore.getState().regenerateSchemas();

      expect(useArchitectStore.getState().error).toBe('No active session');
    });

    it('should set isLoading during operation', async () => {
      const session = createTestSession();
      useArchitectStore.setState({ ...initialState, currentSession: session });

      // Just verify it completes without error for now (actual IPC not implemented yet)
      await useArchitectStore.getState().regenerateSchemas();

      expect(useArchitectStore.getState().isLoading).toBe(false);
    });
  });

  describe('generateModules', () => {
    it('should set error when no active session', async () => {
      useArchitectStore.setState({ ...initialState, currentSession: null });

      await useArchitectStore.getState().generateModules();

      expect(useArchitectStore.getState().error).toBe('No active session');
    });
  });

  describe('generateTasks', () => {
    it('should set error when no active session', async () => {
      useArchitectStore.setState({ ...initialState, currentSession: null });

      await useArchitectStore.getState().generateTasks();

      expect(useArchitectStore.getState().error).toBe('No active session');
    });
  });

  // Tests for action helper functions (for use outside React)
  describe('Action Helper Functions', () => {
    describe('startArchitectSession', () => {
      it('should call store startSession', async () => {
        await startArchitectSession('Test Project', 'Description');

        expect(useArchitectStore.getState().currentSession?.projectName).toBe('Test Project');
      });
    });

    describe('loadArchitectSession', () => {
      it('should call store loadSession', async () => {
        useArchitectStore.setState({
          ...initialState,
          sessions: [createTestSessionSummary({ id: 'test-session' })]
        });

        await loadArchitectSession('test-session');

        // Should not throw, session exists
        expect(useArchitectStore.getState().error).toBeNull();
      });
    });

    describe('deleteArchitectSession', () => {
      it('should call store deleteSession', async () => {
        useArchitectStore.setState({
          ...initialState,
          sessions: [createTestSessionSummary({ id: 'test-session' })]
        });

        await deleteArchitectSession('test-session');

        expect(useArchitectStore.getState().sessions).toHaveLength(0);
      });
    });

    describe('sendArchitectMessage', () => {
      it('should call store addMessage', async () => {
        const session = createTestSession();
        useArchitectStore.setState({ ...initialState, currentSession: session });

        await sendArchitectMessage('Hello');

        expect(useArchitectStore.getState().currentSession?.interviewHistory).toHaveLength(1);
      });
    });

    describe('saveArchitectSession', () => {
      it('should call store saveSession', async () => {
        const session = createTestSession({ isDirty: true });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        await saveArchitectSession();

        expect(useArchitectStore.getState().currentSession?.isDirty).toBe(false);
      });
    });

    describe('exportTasksToKanban (helper)', () => {
      it('should call store exportTasksToKanban', async () => {
        const task = createTestTask({ id: 'task-1', status: 'validated' });
        const session = createTestSession({ tasks: [task] });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        await exportTasksToKanban(['task-1']);

        expect(useArchitectStore.getState().currentSession?.tasks[0].status).toBe('exported');
      });
    });
  });

  // Tests for selectors
  describe('Selectors', () => {
    describe('getArchitectSessions', () => {
      it('should return empty array when no sessions', () => {
        expect(getArchitectSessions()).toEqual([]);
      });

      it('should return all sessions', () => {
        useArchitectStore.setState({
          ...initialState,
          sessions: [
            createTestSessionSummary({ id: 'session-1' }),
            createTestSessionSummary({ id: 'session-2' })
          ]
        });

        expect(getArchitectSessions()).toHaveLength(2);
      });
    });

    describe('getCurrentSession', () => {
      it('should return null when no current session', () => {
        expect(getCurrentSession()).toBeNull();
      });

      it('should return current session', () => {
        const session = createTestSession({ id: 'test-session' });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        expect(getCurrentSession()?.id).toBe('test-session');
      });
    });

    describe('getCurrentSchemas', () => {
      it('should return empty array when no current session', () => {
        expect(getCurrentSchemas()).toEqual([]);
      });

      it('should return schemas from current session', () => {
        const schemas = [createTestSchema({ id: 'schema-1' }), createTestSchema({ id: 'schema-2' })];
        const session = createTestSession({ schemas });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        expect(getCurrentSchemas()).toHaveLength(2);
      });
    });

    describe('getCurrentModules', () => {
      it('should return empty array when no current session', () => {
        expect(getCurrentModules()).toEqual([]);
      });

      it('should return modules from current session', () => {
        const modules = [createTestModule({ id: 'module-1' })];
        const session = createTestSession({ modules });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        expect(getCurrentModules()).toHaveLength(1);
      });
    });

    describe('getCurrentTasks', () => {
      it('should return empty array when no current session', () => {
        expect(getCurrentTasks()).toEqual([]);
      });

      it('should return tasks from current session', () => {
        const tasks = [createTestTask({ id: 'task-1' }), createTestTask({ id: 'task-2' })];
        const session = createTestSession({ tasks });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        expect(getCurrentTasks()).toHaveLength(2);
      });
    });

    describe('getValidatedTasks', () => {
      it('should return empty array when no current session', () => {
        expect(getValidatedTasks()).toEqual([]);
      });

      it('should return only validated tasks', () => {
        const tasks = [
          createTestTask({ id: 'task-1', status: 'draft' }),
          createTestTask({ id: 'task-2', status: 'validated' }),
          createTestTask({ id: 'task-3', status: 'exported' })
        ];
        const session = createTestSession({ tasks });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        const validatedTasks = getValidatedTasks();
        expect(validatedTasks).toHaveLength(1);
        expect(validatedTasks[0].id).toBe('task-2');
      });
    });

    describe('getTasksByPhase', () => {
      it('should return empty object when no current session', () => {
        expect(getTasksByPhase()).toEqual({});
      });

      it('should group tasks by phase', () => {
        const tasks = [
          createTestTask({ id: 'task-1', phase: 1 }),
          createTestTask({ id: 'task-2', phase: 1 }),
          createTestTask({ id: 'task-3', phase: 2 }),
          createTestTask({ id: 'task-4', phase: 3 })
        ];
        const session = createTestSession({ tasks });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        const tasksByPhase = getTasksByPhase();
        expect(tasksByPhase[1]).toHaveLength(2);
        expect(tasksByPhase[2]).toHaveLength(1);
        expect(tasksByPhase[3]).toHaveLength(1);
      });
    });

    describe('getInterviewMessageCount', () => {
      it('should return 0 when no current session', () => {
        expect(getInterviewMessageCount()).toBe(0);
      });

      it('should return message count', () => {
        const messages = [
          createTestMessage({ id: 'msg-1' }),
          createTestMessage({ id: 'msg-2' }),
          createTestMessage({ id: 'msg-3' })
        ];
        const session = createTestSession({ interviewHistory: messages });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        expect(getInterviewMessageCount()).toBe(3);
      });
    });

    describe('hasUnsavedChanges', () => {
      it('should return false when no current session', () => {
        expect(hasUnsavedChanges()).toBe(false);
      });

      it('should return true when session has unsaved changes', () => {
        const session = createTestSession({ isDirty: true });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        expect(hasUnsavedChanges()).toBe(true);
      });

      it('should return false when session has no unsaved changes', () => {
        const session = createTestSession({ isDirty: false });
        useArchitectStore.setState({ ...initialState, currentSession: session });

        expect(hasUnsavedChanges()).toBe(false);
      });
    });
  });

  // Edge cases
  describe('Edge Cases', () => {
    it('should handle empty interview history correctly', () => {
      const session = createTestSession({ interviewHistory: [] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().handleStreamMessage({ content: 'Hello', isStreaming: true });

      expect(useArchitectStore.getState().currentSession?.interviewHistory).toHaveLength(1);
    });

    it('should handle updating nonexistent schema gracefully', () => {
      const session = createTestSession({ schemas: [] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateSchema('nonexistent', 'new code');

      // Should not throw, schemas remain empty
      expect(useArchitectStore.getState().currentSession?.schemas).toHaveLength(0);
    });

    it('should handle validating nonexistent module gracefully', () => {
      const session = createTestSession({ modules: [] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().validateModule('nonexistent');

      // Should not throw, modules remain empty
      expect(useArchitectStore.getState().currentSession?.modules).toHaveLength(0);
    });

    it('should handle updating nonexistent task gracefully', () => {
      const session = createTestSession({ tasks: [] });
      useArchitectStore.setState({ ...initialState, currentSession: session });

      useArchitectStore.getState().updateTask('nonexistent', { title: 'New Title' });

      // Should not throw, tasks remain empty
      expect(useArchitectStore.getState().currentSession?.tasks).toHaveLength(0);
    });

    it('should handle concurrent session operations', async () => {
      // Start two sessions in parallel
      const promise1 = useArchitectStore.getState().startSession('Project 1');
      const promise2 = useArchitectStore.getState().startSession('Project 2');

      await Promise.all([promise1, promise2]);

      // Last session should be current, both should be in sessions list
      expect(useArchitectStore.getState().sessions).toHaveLength(2);
    });
  });
});
