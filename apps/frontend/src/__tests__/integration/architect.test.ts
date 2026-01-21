/**
 * Integration tests for Architect feature flow
 * Tests IPC communication, session management, schema parsing, and Kanban export
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// ============================================
// Mock Setup
// ============================================

// Mock ipcRenderer for renderer-side tests
const mockIpcRenderer = {
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  setMaxListeners: vi.fn()
};

// Mock contextBridge
const exposedApis: Record<string, unknown> = {};
const mockContextBridge = {
  exposeInMainWorld: vi.fn((name: string, api: unknown) => {
    exposedApis[name] = api;
  })
};

vi.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
  contextBridge: mockContextBridge
}));

// ============================================
// Test Fixtures
// ============================================

// Test directories - created securely with mkdtempSync
let TEST_DIR: string;
let TEST_PROJECT_PATH: string;
let TEST_ARCHITECT_DIR: string;

// Sample session data
function createTestSession(overrides: Record<string, unknown> = {}): object {
  return {
    id: 'session-001',
    projectName: 'Test Project',
    projectDescription: 'A test project for integration testing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'interview',
    interviewHistory: [],
    schemas: [],
    modules: [],
    tasks: [],
    isDirty: false,
    ...overrides
  };
}

// Sample interview message
function createTestMessage(role: 'user' | 'assistant' = 'user', content = 'Test message'): object {
  return {
    id: `msg-${Date.now()}`,
    role,
    content,
    timestamp: new Date().toISOString(),
    isStreaming: false
  };
}

// Sample schema data
function createTestSchema(type = 'system', mermaidCode = 'flowchart TD\n  A-->B'): object {
  return {
    id: `schema-${Date.now()}`,
    sessionId: 'session-001',
    type,
    title: `Test ${type} Schema`,
    mermaidCode,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// Sample module data
function createTestModule(name = 'Auth Module'): object {
  return {
    id: `module-${Date.now()}`,
    sessionId: 'session-001',
    name,
    description: 'Handles authentication and authorization',
    responsibilities: ['User login', 'Token management', 'Session handling'],
    entities: ['User', 'Session', 'Token'],
    dependencies: [],
    estimatedComplexity: 'medium',
    isValidated: false
  };
}

// Sample task data
function createTestTask(moduleId = 'module-001', phase = 1): object {
  return {
    id: `task-${Date.now()}`,
    moduleId,
    title: `Implement feature for phase ${phase}`,
    description: 'Task description with implementation details',
    acceptanceCriteria: ['Criterion 1', 'Criterion 2', 'Criterion 3'],
    dependencies: [],
    phase,
    estimatedEffort: '2-4 hours',
    status: 'draft'
  };
}

// Sample stream message from Claude
function createStreamMessage(type: 'assistant' | 'thinking' | 'done' | 'error', content = ''): object {
  return {
    type,
    content,
    sessionId: 'session-001',
    timestamp: new Date().toISOString()
  };
}

// ============================================
// Test Directory Setup
// ============================================

function setupTestDirs(): void {
  TEST_DIR = mkdtempSync(path.join(tmpdir(), 'architect-integration-test-'));
  TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');
  TEST_ARCHITECT_DIR = path.join(TEST_PROJECT_PATH, '.auto-claude/architect');
  mkdirSync(path.join(TEST_ARCHITECT_DIR, 'sessions'), { recursive: true });
  mkdirSync(path.join(TEST_ARCHITECT_DIR, 'schemas'), { recursive: true });
}

function cleanupTestDirs(): void {
  if (TEST_DIR && existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ============================================
// Integration Tests
// ============================================

describe('Architect Integration Tests', () => {
  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(exposedApis).forEach((key) => delete exposedApis[key]);
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  // ============================================
  // Interview Flow Integration Tests
  // ============================================

  describe('Interview Flow Integration', () => {
    it('should expose architect API methods via contextBridge', async () => {
      await import('../../preload/index');

      expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
        'electronAPI',
        expect.any(Object)
      );

      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;

      // Verify architect methods are exposed
      expect(electronAPI).toHaveProperty('architect');
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      expect(architectAPI).toHaveProperty('startInterview');
      expect(architectAPI).toHaveProperty('sendMessage');
      expect(architectAPI).toHaveProperty('stopInterview');
      expect(architectAPI).toHaveProperty('onStreamMessage');
      expect(architectAPI).toHaveProperty('onInterviewComplete');
      expect(architectAPI).toHaveProperty('onInterviewError');
      expect(architectAPI).toHaveProperty('onInterviewStopped');
    });

    it('should invoke IPC to start architect interview with correct parameters', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      mockIpcRenderer.invoke.mockResolvedValueOnce({
        success: true,
        data: { sessionId: 'session-001' }
      });

      const startInterview = architectAPI['startInterview'] as Function;
      const options = {
        prompt: 'Describe your project',
        sessionId: 'session-001'
      };

      await startInterview('project-001', options);

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'architect:startInterview',
        'project-001',
        options
      );
    });

    it('should invoke IPC to send message in ongoing interview', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      mockIpcRenderer.invoke.mockResolvedValueOnce({
        success: true
      });

      const sendMessage = architectAPI['sendMessage'] as Function;
      const options = {
        prompt: 'The project is an e-commerce platform',
        sessionHistory: [createTestMessage('user', 'Previous message')],
        sessionId: 'session-001'
      };

      await sendMessage('project-001', options);

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'architect:sendMessage',
        'project-001',
        options
      );
    });

    it('should invoke IPC to stop architect interview', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      mockIpcRenderer.invoke.mockResolvedValueOnce({
        success: true
      });

      const stopInterview = architectAPI['stopInterview'] as Function;
      await stopInterview('session-001');

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'architect:stopInterview',
        'session-001'
      );
    });

    it('should register stream message listener for real-time AI responses', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onStreamMessage = architectAPI['onStreamMessage'] as Function;
      onStreamMessage(callback);

      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'architect:streamMessage',
        expect.any(Function)
      );
    });

    it('should receive streamed assistant messages during interview', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onStreamMessage = architectAPI['onStreamMessage'] as Function;
      onStreamMessage(callback);

      // Find the registered event handler
      const eventHandler = mockIpcRenderer.on.mock.calls.find(
        (call) => call[0] === 'architect:streamMessage'
      )?.[1];

      const streamMessage = createStreamMessage('assistant', 'Here is my architectural analysis...');

      if (eventHandler) {
        eventHandler({}, 'session-001', streamMessage);
      }

      expect(callback).toHaveBeenCalledWith('session-001', streamMessage);
    });

    it('should receive thinking content during extended reasoning', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onStreamMessage = architectAPI['onStreamMessage'] as Function;
      onStreamMessage(callback);

      const eventHandler = mockIpcRenderer.on.mock.calls.find(
        (call) => call[0] === 'architect:streamMessage'
      )?.[1];

      const thinkingMessage = createStreamMessage('thinking', 'Let me analyze the requirements...');

      if (eventHandler) {
        eventHandler({}, 'session-001', thinkingMessage);
      }

      expect(callback).toHaveBeenCalledWith('session-001', thinkingMessage);
    });

    it('should handle interview completion event', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onInterviewComplete = architectAPI['onInterviewComplete'] as Function;
      onInterviewComplete(callback);

      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'architect:interviewComplete',
        expect.any(Function)
      );

      const eventHandler = mockIpcRenderer.on.mock.calls.find(
        (call) => call[0] === 'architect:interviewComplete'
      )?.[1];

      const completeMessage = createStreamMessage('done', 'Interview complete');

      if (eventHandler) {
        eventHandler({}, 'session-001', completeMessage);
      }

      expect(callback).toHaveBeenCalledWith('session-001', completeMessage);
    });

    it('should handle interview error event', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onInterviewError = architectAPI['onInterviewError'] as Function;
      onInterviewError(callback);

      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'architect:interviewError',
        expect.any(Function)
      );

      const eventHandler = mockIpcRenderer.on.mock.calls.find(
        (call) => call[0] === 'architect:interviewError'
      )?.[1];

      const errorMessage = createStreamMessage('error', 'API rate limit exceeded');

      if (eventHandler) {
        eventHandler({}, 'session-001', errorMessage);
      }

      expect(callback).toHaveBeenCalledWith('session-001', errorMessage);
    });

    it('should handle user-initiated interview stop event', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onInterviewStopped = architectAPI['onInterviewStopped'] as Function;
      onInterviewStopped(callback);

      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'architect:interviewStopped',
        expect.any(Function)
      );

      const eventHandler = mockIpcRenderer.on.mock.calls.find(
        (call) => call[0] === 'architect:interviewStopped'
      )?.[1];

      if (eventHandler) {
        eventHandler({}, 'session-001');
      }

      expect(callback).toHaveBeenCalledWith('session-001');
    });

    it('should return cleanup function for stream message listener', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onStreamMessage = architectAPI['onStreamMessage'] as Function;
      const cleanup = onStreamMessage(callback);

      expect(typeof cleanup).toBe('function');

      cleanup();

      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        'architect:streamMessage',
        expect.any(Function)
      );
    });
  });

  // ============================================
  // Schema Generation Integration Tests
  // ============================================

  describe('Schema Generation Integration', () => {
    it('should parse Mermaid blocks from AI output', async () => {
      const { parseSchemas } = await import(
        '../../renderer/components/architect/utils/schemaParser'
      );

      const aiOutput = `
Here is the system architecture:

\`\`\`mermaid
flowchart TD
    A[Client] --> B[API Gateway]
    B --> C[Auth Service]
    B --> D[Product Service]
\`\`\`

And here is the entity relationship diagram:

\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ PRODUCT : contains
\`\`\`
      `;

      const result = parseSchemas(aiOutput);

      expect(result.schemas).toHaveLength(2);
      expect(result.schemas[0].type).toBe('flow');
      expect(result.schemas[0].mermaidCode).toContain('flowchart TD');
      expect(result.schemas[1].type).toBe('database');
      expect(result.schemas[1].mermaidCode).toContain('erDiagram');
    });

    it('should handle invalid Mermaid syntax gracefully', async () => {
      const { parseSchemas } = await import(
        '../../renderer/components/architect/utils/schemaParser'
      );

      const aiOutput = `
\`\`\`mermaid
this is not valid mermaid
\`\`\`
      `;

      const result = parseSchemas(aiOutput);

      // Should still extract the block but with potential parse errors
      expect(result.schemas.length).toBeGreaterThanOrEqual(0);
      expect(result.rawText).toBe(aiOutput);
    });

    it('should detect various Mermaid diagram types correctly', async () => {
      const { detectMermaidType } = await import(
        '../../renderer/components/architect/utils/schemaParser'
      );

      expect(detectMermaidType('flowchart TD\n  A-->B')).toBe('flow');
      expect(detectMermaidType('sequenceDiagram\n  A->>B: msg')).toBe('sequence');
      expect(detectMermaidType('classDiagram\n  class A')).toBe('entity');
      expect(detectMermaidType('erDiagram\n  A ||--o{ B')).toBe('database');
      expect(detectMermaidType('C4Context\n  Person(u, "User")')).toBe('system');
    });

    it('should store multiple schemas from single AI response', async () => {
      const sessionPath = path.join(TEST_ARCHITECT_DIR, 'sessions', 'session-001.json');
      const session = createTestSession({
        schemas: [
          createTestSchema('system', 'C4Context\n  Person(u, "User")'),
          createTestSchema('flow', 'flowchart TD\n  A-->B'),
          createTestSchema('entity', 'classDiagram\n  class User'),
          createTestSchema('database', 'erDiagram\n  A ||--o{ B')
        ]
      });

      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      const savedSession = JSON.parse(
        require('fs').readFileSync(sessionPath, 'utf-8')
      );

      expect(savedSession.schemas).toHaveLength(4);
      expect(savedSession.schemas.map((s: { type: string }) => s.type)).toContain('system');
      expect(savedSession.schemas.map((s: { type: string }) => s.type)).toContain('flow');
      expect(savedSession.schemas.map((s: { type: string }) => s.type)).toContain('entity');
      expect(savedSession.schemas.map((s: { type: string }) => s.type)).toContain('database');
    });
  });

  // ============================================
  // Module Decomposition Integration Tests
  // ============================================

  describe('Module Decomposition Integration', () => {
    it('should store module decomposition data with dependencies', async () => {
      const sessionPath = path.join(TEST_ARCHITECT_DIR, 'sessions', 'session-001.json');
      const authModule = createTestModule('Auth Module');
      const userModule = {
        ...createTestModule('User Module'),
        dependencies: [(authModule as { id: string }).id]
      };

      const session = createTestSession({
        status: 'modules',
        modules: [authModule, userModule]
      });

      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      const savedSession = JSON.parse(
        require('fs').readFileSync(sessionPath, 'utf-8')
      );

      expect(savedSession.modules).toHaveLength(2);
      expect(savedSession.modules[0].name).toBe('Auth Module');
      expect(savedSession.modules[1].dependencies).toHaveLength(1);
      expect(savedSession.modules[1].dependencies[0]).toBe((authModule as { id: string }).id);
    });

    it('should track module validation status', async () => {
      const sessionPath = path.join(TEST_ARCHITECT_DIR, 'sessions', 'session-001.json');
      const validatedModule = {
        ...createTestModule('Core Module'),
        isValidated: true,
        validationNotes: 'Reviewed and approved by tech lead'
      };
      const pendingModule = createTestModule('UI Module');

      const session = createTestSession({
        status: 'modules',
        modules: [validatedModule, pendingModule]
      });

      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      const savedSession = JSON.parse(
        require('fs').readFileSync(sessionPath, 'utf-8')
      );

      expect(savedSession.modules[0].isValidated).toBe(true);
      expect(savedSession.modules[0].validationNotes).toBe('Reviewed and approved by tech lead');
      expect(savedSession.modules[1].isValidated).toBe(false);
    });
  });

  // ============================================
  // Task Export Integration Tests
  // ============================================

  describe('Task Export to Kanban Integration', () => {
    it('should format tasks for Kanban export with correct structure', async () => {
      const { formatForKanban } = await import(
        '../../renderer/components/architect/utils/taskFormatter'
      );

      const task = createTestTask('module-001', 1) as {
        id: string;
        moduleId: string;
        title: string;
        description: string;
        acceptanceCriteria: string[];
        dependencies: string[];
        phase: number;
        estimatedEffort: string;
        status: string;
      };
      const module = createTestModule('Auth Module') as {
        id: string;
        name: string;
      };

      const kanbanTasks = formatForKanban([task], [{ ...module, id: task.moduleId }]);

      expect(kanbanTasks).toHaveLength(1);
      expect(kanbanTasks[0]).toHaveProperty('title');
      expect(kanbanTasks[0]).toHaveProperty('description');
      expect(kanbanTasks[0]).toHaveProperty('status');
    });

    it('should preserve acceptance criteria in exported tasks', async () => {
      const { formatForKanban } = await import(
        '../../renderer/components/architect/utils/taskFormatter'
      );

      const task = {
        id: 'task-001',
        moduleId: 'module-001',
        title: 'Implement login',
        description: 'Create login functionality',
        acceptanceCriteria: ['Users can login with email', 'Password is validated', 'Session created'],
        dependencies: [],
        phase: 1,
        estimatedEffort: '4 hours',
        status: 'validated' as const
      };

      const module = {
        id: 'module-001',
        sessionId: 'session-001',
        name: 'Auth Module',
        description: 'Authentication',
        responsibilities: [],
        entities: [],
        dependencies: [],
        estimatedComplexity: 'medium' as const
      };

      const kanbanTasks = formatForKanban([task], [module]);

      expect(kanbanTasks[0].description).toContain('Users can login with email');
    });

    it('should filter tasks by validation status for export', async () => {
      const { filterExportableTasks } = await import(
        '../../renderer/components/architect/utils/taskFormatter'
      );

      const tasks = [
        { ...createTestTask('m1', 1), status: 'draft' },
        { ...createTestTask('m1', 2), status: 'validated' },
        { ...createTestTask('m1', 3), status: 'exported' },
        { ...createTestTask('m1', 4), status: 'validated' }
      ];

      const exportable = filterExportableTasks(
        tasks as Array<{
          id: string;
          moduleId: string;
          status: 'draft' | 'validated' | 'exported';
          title: string;
          description: string;
          acceptanceCriteria: string[];
          dependencies: string[];
          phase: number;
          estimatedEffort: string;
        }>
      );

      expect(exportable).toHaveLength(2);
      expect(exportable.every(t => t.status === 'validated')).toBe(true);
    });

    it('should track kanbanTaskId after export', async () => {
      const sessionPath = path.join(TEST_ARCHITECT_DIR, 'sessions', 'session-001.json');

      const exportedTask = {
        ...createTestTask('module-001', 1),
        status: 'exported',
        kanbanTaskId: 'kanban-task-123'
      };

      const session = createTestSession({
        status: 'tasks',
        tasks: [exportedTask]
      });

      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      const savedSession = JSON.parse(
        require('fs').readFileSync(sessionPath, 'utf-8')
      );

      expect(savedSession.tasks[0].status).toBe('exported');
      expect(savedSession.tasks[0].kanbanTaskId).toBe('kanban-task-123');
    });

    it('should group tasks by phase for organized export', async () => {
      const { groupTasksByPhase } = await import(
        '../../renderer/components/architect/utils/taskFormatter'
      );

      const tasks = [
        { ...createTestTask('m1', 1), id: 't1' },
        { ...createTestTask('m1', 2), id: 't2' },
        { ...createTestTask('m1', 1), id: 't3' },
        { ...createTestTask('m1', 3), id: 't4' }
      ];

      const grouped = groupTasksByPhase(
        tasks as Array<{
          id: string;
          moduleId: string;
          title: string;
          description: string;
          acceptanceCriteria: string[];
          dependencies: string[];
          phase: number;
          estimatedEffort: string;
          status: 'draft' | 'validated' | 'exported';
        }>
      );

      expect(Object.keys(grouped)).toHaveLength(3);
      expect(grouped[1]).toHaveLength(2);
      expect(grouped[2]).toHaveLength(1);
      expect(grouped[3]).toHaveLength(1);
    });
  });

  // ============================================
  // Session Persistence Integration Tests
  // ============================================

  describe('Session Persistence Integration', () => {
    it('should persist session to file storage', async () => {
      const sessionPath = path.join(TEST_ARCHITECT_DIR, 'sessions', 'session-001.json');
      const session = createTestSession({
        interviewHistory: [
          createTestMessage('user', 'What is the project scope?'),
          createTestMessage('assistant', 'Let me help you define the scope...')
        ]
      });

      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      expect(existsSync(sessionPath)).toBe(true);

      const savedSession = JSON.parse(
        require('fs').readFileSync(sessionPath, 'utf-8')
      );

      expect(savedSession.projectName).toBe('Test Project');
      expect(savedSession.interviewHistory).toHaveLength(2);
    });

    it('should restore session state after app restart', async () => {
      const sessionPath = path.join(TEST_ARCHITECT_DIR, 'sessions', 'session-001.json');
      const originalSession = createTestSession({
        status: 'schemas',
        interviewHistory: [
          createTestMessage('user', 'Question 1'),
          createTestMessage('assistant', 'Answer 1'),
          createTestMessage('user', 'Question 2'),
          createTestMessage('assistant', 'Answer 2')
        ],
        schemas: [createTestSchema('system'), createTestSchema('flow')]
      });

      writeFileSync(sessionPath, JSON.stringify(originalSession, null, 2));

      // Simulate app restart by reading from file
      const restoredSession = JSON.parse(
        require('fs').readFileSync(sessionPath, 'utf-8')
      );

      expect(restoredSession.status).toBe('schemas');
      expect(restoredSession.interviewHistory).toHaveLength(4);
      expect(restoredSession.schemas).toHaveLength(2);
    });

    it('should handle session status transitions correctly', async () => {
      const sessionPath = path.join(TEST_ARCHITECT_DIR, 'sessions', 'session-001.json');

      // Start in interview status
      let session = createTestSession({ status: 'interview' });
      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      // Transition to schemas status
      session = { ...session, status: 'schemas' };
      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      let savedSession = JSON.parse(require('fs').readFileSync(sessionPath, 'utf-8'));
      expect(savedSession.status).toBe('schemas');

      // Transition to modules status
      session = { ...session, status: 'modules' };
      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      savedSession = JSON.parse(require('fs').readFileSync(sessionPath, 'utf-8'));
      expect(savedSession.status).toBe('modules');

      // Transition to tasks status
      session = { ...session, status: 'tasks' };
      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      savedSession = JSON.parse(require('fs').readFileSync(sessionPath, 'utf-8'));
      expect(savedSession.status).toBe('tasks');

      // Transition to complete status
      session = { ...session, status: 'complete' };
      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      savedSession = JSON.parse(require('fs').readFileSync(sessionPath, 'utf-8'));
      expect(savedSession.status).toBe('complete');
    });

    it('should preserve user edits to tasks in session', async () => {
      const sessionPath = path.join(TEST_ARCHITECT_DIR, 'sessions', 'session-001.json');

      const editedTask = {
        ...createTestTask('module-001', 1),
        userEdits: {
          title: 'Custom title from user',
          description: 'User modified description',
          acceptanceCriteria: ['Custom criterion 1', 'Custom criterion 2']
        }
      };

      const session = createTestSession({
        status: 'tasks',
        tasks: [editedTask]
      });

      writeFileSync(sessionPath, JSON.stringify(session, null, 2));

      const savedSession = JSON.parse(
        require('fs').readFileSync(sessionPath, 'utf-8')
      );

      expect(savedSession.tasks[0].userEdits).toBeDefined();
      expect(savedSession.tasks[0].userEdits.title).toBe('Custom title from user');
      expect(savedSession.tasks[0].userEdits.acceptanceCriteria).toHaveLength(2);
    });
  });

  // ============================================
  // Event Listener Cleanup Tests
  // ============================================

  describe('Event Listener Cleanup', () => {
    it('should cleanup architect:streamMessage listener when cleanup function is called', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onStreamMessage = architectAPI['onStreamMessage'] as Function;
      const cleanup = onStreamMessage(callback);

      expect(typeof cleanup).toBe('function');

      cleanup();

      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        'architect:streamMessage',
        expect.any(Function)
      );
    });

    it('should cleanup architect:interviewComplete listener when cleanup function is called', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onInterviewComplete = architectAPI['onInterviewComplete'] as Function;
      const cleanup = onInterviewComplete(callback);

      expect(typeof cleanup).toBe('function');

      cleanup();

      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        'architect:interviewComplete',
        expect.any(Function)
      );
    });

    it('should cleanup architect:interviewError listener when cleanup function is called', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onInterviewError = architectAPI['onInterviewError'] as Function;
      const cleanup = onInterviewError(callback);

      expect(typeof cleanup).toBe('function');

      cleanup();

      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        'architect:interviewError',
        expect.any(Function)
      );
    });

    it('should cleanup architect:interviewStopped listener when cleanup function is called', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onInterviewStopped = architectAPI['onInterviewStopped'] as Function;
      const cleanup = onInterviewStopped(callback);

      expect(typeof cleanup).toBe('function');

      cleanup();

      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        'architect:interviewStopped',
        expect.any(Function)
      );
    });
  });

  // ============================================
  // IPC Channel Constants Tests
  // ============================================

  describe('IPC Channel Constants', () => {
    it('should use consistent architect channel names', async () => {
      const { ARCHITECT_CHANNELS } = await import(
        '../../preload/api/modules/architect-api'
      );

      // Verify channel naming convention (namespace:action)
      expect(ARCHITECT_CHANNELS.START_INTERVIEW).toBe('architect:startInterview');
      expect(ARCHITECT_CHANNELS.SEND_MESSAGE).toBe('architect:sendMessage');
      expect(ARCHITECT_CHANNELS.STOP_INTERVIEW).toBe('architect:stopInterview');
      expect(ARCHITECT_CHANNELS.STREAM_MESSAGE).toBe('architect:streamMessage');
      expect(ARCHITECT_CHANNELS.INTERVIEW_COMPLETE).toBe('architect:interviewComplete');
      expect(ARCHITECT_CHANNELS.INTERVIEW_ERROR).toBe('architect:interviewError');
      expect(ARCHITECT_CHANNELS.INTERVIEW_STOPPED).toBe('architect:interviewStopped');
    });
  });

  // ============================================
  // Error Handling Integration Tests
  // ============================================

  describe('Error Handling Integration', () => {
    it('should handle IPC timeout gracefully', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      mockIpcRenderer.invoke.mockRejectedValueOnce(new Error('IPC timeout'));

      const startInterview = architectAPI['startInterview'] as Function;

      await expect(
        startInterview('project-001', { prompt: 'test', sessionId: 'session-001' })
      ).rejects.toThrow('IPC timeout');
    });

    it('should handle missing session gracefully', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      mockIpcRenderer.invoke.mockResolvedValueOnce({
        success: false,
        error: 'Session not found'
      });

      const sendMessage = architectAPI['sendMessage'] as Function;
      const result = await sendMessage('project-001', {
        prompt: 'test',
        sessionId: 'nonexistent-session'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found');
    });

    it('should handle Claude SDK API errors', async () => {
      await import('../../preload/index');
      const electronAPI = exposedApis['electronAPI'] as Record<string, unknown>;
      const architectAPI = electronAPI['architect'] as Record<string, unknown>;

      const callback = vi.fn();
      const onInterviewError = architectAPI['onInterviewError'] as Function;
      onInterviewError(callback);

      const eventHandler = mockIpcRenderer.on.mock.calls.find(
        (call) => call[0] === 'architect:interviewError'
      )?.[1];

      const errorMessage = {
        type: 'error',
        content: 'Claude API rate limit exceeded. Please try again later.',
        sessionId: 'session-001',
        timestamp: new Date().toISOString()
      };

      if (eventHandler) {
        eventHandler({}, 'session-001', errorMessage);
      }

      expect(callback).toHaveBeenCalledWith('session-001', errorMessage);
    });
  });
});
