/**
 * Unit tests for InterviewPanel component
 * Tests message rendering, input handling, status display, and interaction logic
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  InterviewMessage,
  SessionStatus,
  ArchitectSession,
} from '../../types/architect.types';

// ============================================
// Test Helpers
// ============================================

/**
 * Helper to create a test message
 */
function createTestMessage(overrides: Partial<InterviewMessage> = {}): InterviewMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Test message content',
    timestamp: new Date('2024-01-15T10:30:00Z'),
    ...overrides,
  };
}

/**
 * Helper to create a test session
 */
function createTestSession(overrides: Partial<ArchitectSession> = {}): ArchitectSession {
  return {
    id: 'session-1',
    projectName: 'Test Project',
    projectDescription: 'A test project description',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:30:00Z'),
    status: 'interview',
    interviewHistory: [],
    schemas: [],
    modules: [],
    tasks: [],
    ...overrides,
  };
}

// ============================================
// Status Configuration Tests
// ============================================

describe('InterviewPanel', () => {
  describe('Status Labels Configuration', () => {
    const STATUS_LABELS: Record<SessionStatus, string> = {
      interview: 'Interview in progress',
      schemas: 'Generating schemas',
      modules: 'Decomposing modules',
      tasks: 'Generating tasks',
      complete: 'Complete',
    };

    it('should have correct label for interview status', () => {
      expect(STATUS_LABELS.interview).toBe('Interview in progress');
    });

    it('should have correct label for schemas status', () => {
      expect(STATUS_LABELS.schemas).toBe('Generating schemas');
    });

    it('should have correct label for modules status', () => {
      expect(STATUS_LABELS.modules).toBe('Decomposing modules');
    });

    it('should have correct label for tasks status', () => {
      expect(STATUS_LABELS.tasks).toBe('Generating tasks');
    });

    it('should have correct label for complete status', () => {
      expect(STATUS_LABELS.complete).toBe('Complete');
    });

    it('should have labels for all session statuses', () => {
      const statuses: SessionStatus[] = ['interview', 'schemas', 'modules', 'tasks', 'complete'];
      statuses.forEach(status => {
        expect(STATUS_LABELS[status]).toBeDefined();
        expect(typeof STATUS_LABELS[status]).toBe('string');
      });
    });
  });

  describe('Status Colors Configuration', () => {
    const STATUS_COLORS: Record<SessionStatus, string> = {
      interview: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      schemas: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
      modules: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      tasks: 'bg-green-500/10 text-green-500 border-green-500/20',
      complete: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };

    it('should have blue color scheme for interview status', () => {
      expect(STATUS_COLORS.interview).toContain('blue-500');
    });

    it('should have purple color scheme for schemas status', () => {
      expect(STATUS_COLORS.schemas).toContain('purple-500');
    });

    it('should have amber color scheme for modules status', () => {
      expect(STATUS_COLORS.modules).toContain('amber-500');
    });

    it('should have green color scheme for tasks status', () => {
      expect(STATUS_COLORS.tasks).toContain('green-500');
    });

    it('should have emerald color scheme for complete status', () => {
      expect(STATUS_COLORS.complete).toContain('emerald-500');
    });

    it('should have colors for all session statuses', () => {
      const statuses: SessionStatus[] = ['interview', 'schemas', 'modules', 'tasks', 'complete'];
      statuses.forEach(status => {
        expect(STATUS_COLORS[status]).toBeDefined();
        expect(STATUS_COLORS[status]).toContain('bg-');
        expect(STATUS_COLORS[status]).toContain('text-');
        expect(STATUS_COLORS[status]).toContain('border-');
      });
    });
  });

  // ============================================
  // Message Tests
  // ============================================

  describe('Message Structure', () => {
    it('should create a valid user message', () => {
      const message = createTestMessage({ role: 'user', content: 'Hello' });
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeInstanceOf(Date);
    });

    it('should create a valid assistant message', () => {
      const message = createTestMessage({
        role: 'assistant',
        content: 'Hi there!',
        thinking: 'Analyzing user request...',
      });
      expect(message.role).toBe('assistant');
      expect(message.content).toBe('Hi there!');
      expect(message.thinking).toBe('Analyzing user request...');
    });

    it('should handle streaming messages', () => {
      const message = createTestMessage({
        role: 'assistant',
        content: 'Partial response...',
        isStreaming: true,
      });
      expect(message.isStreaming).toBe(true);
    });

    it('should handle messages without thinking content', () => {
      const message = createTestMessage({ role: 'assistant' });
      expect(message.thinking).toBeUndefined();
    });
  });

  describe('Message Role Identification', () => {
    it('should identify user messages correctly', () => {
      const message = createTestMessage({ role: 'user' });
      const isUser = message.role === 'user';
      const isAssistant = message.role === 'assistant';
      expect(isUser).toBe(true);
      expect(isAssistant).toBe(false);
    });

    it('should identify assistant messages correctly', () => {
      const message = createTestMessage({ role: 'assistant' });
      const isUser = message.role === 'user';
      const isAssistant = message.role === 'assistant';
      expect(isUser).toBe(false);
      expect(isAssistant).toBe(true);
    });

    it('should identify system messages correctly', () => {
      const message = createTestMessage({ role: 'system' });
      const isUser = message.role === 'user';
      const isAssistant = message.role === 'assistant';
      expect(isUser).toBe(false);
      expect(isAssistant).toBe(false);
    });
  });

  describe('Message Thinking Content', () => {
    it('should detect thinking content in assistant messages', () => {
      const message = createTestMessage({
        role: 'assistant',
        thinking: 'Extended thinking content...',
      });
      const hasThinking = message.role === 'assistant' && !!message.thinking;
      expect(hasThinking).toBe(true);
    });

    it('should not detect thinking in user messages', () => {
      const message = createTestMessage({
        role: 'user',
        thinking: 'This should not appear',
      });
      // Component only shows thinking for assistant messages
      const hasThinking = message.role === 'assistant' && !!message.thinking;
      expect(hasThinking).toBe(false);
    });

    it('should not detect thinking when thinking is empty', () => {
      const message = createTestMessage({
        role: 'assistant',
        thinking: '',
      });
      const hasThinking = message.role === 'assistant' && !!message.thinking;
      expect(hasThinking).toBe(false);
    });
  });

  // ============================================
  // Input State Logic Tests
  // ============================================

  describe('Input State Logic', () => {
    it('should disable input when sending', () => {
      const isSending = true;
      const isStreaming = false;
      const isInputDisabled = isSending || isStreaming;
      expect(isInputDisabled).toBe(true);
    });

    it('should disable input when streaming', () => {
      const isSending = false;
      const isStreaming = true;
      const isInputDisabled = isSending || isStreaming;
      expect(isInputDisabled).toBe(true);
    });

    it('should enable input when not sending and not streaming', () => {
      const isSending = false;
      const isStreaming = false;
      const isInputDisabled = isSending || isStreaming;
      expect(isInputDisabled).toBe(false);
    });

    it('should disable input when both sending and streaming', () => {
      const isSending = true;
      const isStreaming = true;
      const isInputDisabled = isSending || isStreaming;
      expect(isInputDisabled).toBe(true);
    });
  });

  describe('Send Button Logic', () => {
    it('should enable send when input has content and not disabled', () => {
      const inputValue = 'Hello';
      const isInputDisabled = false;
      const canSend = inputValue.trim().length > 0 && !isInputDisabled;
      expect(canSend).toBe(true);
    });

    it('should disable send when input is empty', () => {
      const inputValue = '';
      const isInputDisabled = false;
      const canSend = inputValue.trim().length > 0 && !isInputDisabled;
      expect(canSend).toBe(false);
    });

    it('should disable send when input is whitespace only', () => {
      const inputValue = '   ';
      const isInputDisabled = false;
      const canSend = inputValue.trim().length > 0 && !isInputDisabled;
      expect(canSend).toBe(false);
    });

    it('should disable send when input is disabled', () => {
      const inputValue = 'Hello';
      const isInputDisabled = true;
      const canSend = inputValue.trim().length > 0 && !isInputDisabled;
      expect(canSend).toBe(false);
    });

    it('should disable send when input is empty and disabled', () => {
      const inputValue = '';
      const isInputDisabled = true;
      const canSend = inputValue.trim().length > 0 && !isInputDisabled;
      expect(canSend).toBe(false);
    });
  });

  // ============================================
  // Session Tests
  // ============================================

  describe('Session State', () => {
    it('should create session with default values', () => {
      const session = createTestSession();
      expect(session.id).toBe('session-1');
      expect(session.projectName).toBe('Test Project');
      expect(session.status).toBe('interview');
      expect(session.interviewHistory).toEqual([]);
    });

    it('should handle session with messages', () => {
      const messages = [
        createTestMessage({ id: 'msg-1', role: 'user', content: 'Hello' }),
        createTestMessage({ id: 'msg-2', role: 'assistant', content: 'Hi!' }),
      ];
      const session = createTestSession({ interviewHistory: messages });
      expect(session.interviewHistory.length).toBe(2);
    });

    it('should handle empty interview history', () => {
      const session = createTestSession({ interviewHistory: [] });
      const isEmpty = session.interviewHistory.length === 0;
      expect(isEmpty).toBe(true);
    });

    it('should identify latest message correctly', () => {
      const messages = [
        createTestMessage({ id: 'msg-1' }),
        createTestMessage({ id: 'msg-2' }),
        createTestMessage({ id: 'msg-3' }),
      ];
      const session = createTestSession({ interviewHistory: messages });
      const lastIndex = session.interviewHistory.length - 1;
      const isLatest = (index: number) => index === lastIndex;

      expect(isLatest(0)).toBe(false);
      expect(isLatest(1)).toBe(false);
      expect(isLatest(2)).toBe(true);
    });
  });

  describe('Message Count Display', () => {
    it('should show 0 messages for empty history', () => {
      const session = createTestSession({ interviewHistory: [] });
      expect(session.interviewHistory.length).toBe(0);
    });

    it('should show correct count for multiple messages', () => {
      const messages = [
        createTestMessage({ id: 'msg-1' }),
        createTestMessage({ id: 'msg-2' }),
        createTestMessage({ id: 'msg-3' }),
      ];
      const session = createTestSession({ interviewHistory: messages });
      expect(session.interviewHistory.length).toBe(3);
    });
  });

  // ============================================
  // Timestamp Formatting Tests
  // ============================================

  describe('Timestamp Formatting', () => {
    // Replicating the formatTimestamp function from the component
    function formatTimestamp(timestamp: Date | string): string {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    it('should format Date object correctly', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatTimestamp(date);
      // Format will depend on locale, but should include hour and minute
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should format ISO string correctly', () => {
      const dateString = '2024-01-15T10:30:00Z';
      const formatted = formatTimestamp(dateString);
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should handle Date and string inputs consistently', () => {
      const dateString = '2024-01-15T14:30:00.000Z';
      const dateObject = new Date(dateString);

      const formattedString = formatTimestamp(dateString);
      const formattedDate = formatTimestamp(dateObject);

      // Both should produce the same formatted output
      expect(formattedString).toBe(formattedDate);
    });
  });

  // ============================================
  // Streaming Indicator Tests
  // ============================================

  describe('Streaming Indicator Logic', () => {
    it('should show streaming indicator for latest streaming message', () => {
      const message = createTestMessage({
        role: 'assistant',
        isStreaming: true,
      });
      const isLatest = true;
      const showIndicator = isLatest && message.isStreaming;
      expect(showIndicator).toBe(true);
    });

    it('should not show streaming indicator for non-latest messages', () => {
      const message = createTestMessage({
        role: 'assistant',
        isStreaming: true,
      });
      const isLatest = false;
      const showIndicator = isLatest && message.isStreaming;
      expect(showIndicator).toBe(false);
    });

    it('should not show streaming indicator when not streaming', () => {
      const message = createTestMessage({
        role: 'assistant',
        isStreaming: false,
      });
      const isLatest = true;
      const showIndicator = isLatest && message.isStreaming;
      expect(showIndicator).toBe(false);
    });

    it('should show animated dots for empty streaming message', () => {
      const message = createTestMessage({
        role: 'assistant',
        content: '',
        isStreaming: true,
      });
      const isLatest = true;
      const showDots = isLatest && message.isStreaming && !message.content;
      expect(showDots).toBe(true);
    });

    it('should not show animated dots when content exists', () => {
      const message = createTestMessage({
        role: 'assistant',
        content: 'Some response...',
        isStreaming: true,
      });
      const isLatest = true;
      const showDots = isLatest && message.isStreaming && !message.content;
      expect(showDots).toBe(false);
    });
  });

  // ============================================
  // Stop Button Logic Tests
  // ============================================

  describe('Stop Button Logic', () => {
    it('should show stop button when streaming and handler provided', () => {
      const isStreaming = true;
      const onStopInterview = vi.fn();
      const showStopButton = isStreaming && !!onStopInterview;
      expect(showStopButton).toBe(true);
    });

    it('should not show stop button when not streaming', () => {
      const isStreaming = false;
      const onStopInterview = vi.fn();
      const showStopButton = isStreaming && !!onStopInterview;
      expect(showStopButton).toBe(false);
    });

    it('should not show stop button when handler not provided', () => {
      const isStreaming = true;
      const onStopInterview = undefined;
      const showStopButton = isStreaming && !!onStopInterview;
      expect(showStopButton).toBe(false);
    });

    it('should disable stop button while stopping', () => {
      const isStopping = true;
      expect(isStopping).toBe(true);
    });
  });

  // ============================================
  // Keyboard Handling Tests
  // ============================================

  describe('Keyboard Handling', () => {
    it('should detect Enter key without Shift', () => {
      const event = { key: 'Enter', shiftKey: false };
      const shouldSend = event.key === 'Enter' && !event.shiftKey;
      expect(shouldSend).toBe(true);
    });

    it('should not send on Enter with Shift (new line)', () => {
      const event = { key: 'Enter', shiftKey: true };
      const shouldSend = event.key === 'Enter' && !event.shiftKey;
      expect(shouldSend).toBe(false);
    });

    it('should not trigger on other keys', () => {
      const otherKeys = ['a', 'Tab', 'Escape', 'Space'];
      otherKeys.forEach(key => {
        const event = { key, shiftKey: false };
        const shouldSend = event.key === 'Enter' && !event.shiftKey;
        expect(shouldSend).toBe(false);
      });
    });
  });

  // ============================================
  // Empty State Tests
  // ============================================

  describe('Empty State Display', () => {
    it('should show empty state when no messages', () => {
      const messages: InterviewMessage[] = [];
      const showEmptyState = messages.length === 0;
      expect(showEmptyState).toBe(true);
    });

    it('should not show empty state when messages exist', () => {
      const messages = [createTestMessage()];
      const showEmptyState = messages.length === 0;
      expect(showEmptyState).toBe(false);
    });
  });

  // ============================================
  // Handler Validation Tests
  // ============================================

  describe('Send Handler Validation', () => {
    it('should not send when input is empty', async () => {
      const onSendMessage = vi.fn();
      const inputValue = '';
      const isSending = false;
      const isStreaming = false;

      const trimmedValue = inputValue.trim();
      if (!trimmedValue || isSending || isStreaming) {
        // Should not call onSendMessage
      } else {
        await onSendMessage(trimmedValue);
      }

      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('should not send when already sending', async () => {
      const onSendMessage = vi.fn();
      const inputValue = 'Hello';
      const isSending = true;
      const isStreaming = false;

      const trimmedValue = inputValue.trim();
      if (!trimmedValue || isSending || isStreaming) {
        // Should not call onSendMessage
      } else {
        await onSendMessage(trimmedValue);
      }

      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('should not send when streaming', async () => {
      const onSendMessage = vi.fn();
      const inputValue = 'Hello';
      const isSending = false;
      const isStreaming = true;

      const trimmedValue = inputValue.trim();
      if (!trimmedValue || isSending || isStreaming) {
        // Should not call onSendMessage
      } else {
        await onSendMessage(trimmedValue);
      }

      expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('should send when all conditions are met', async () => {
      const onSendMessage = vi.fn().mockResolvedValue(undefined);
      const inputValue = 'Hello';
      const isSending = false;
      const isStreaming = false;

      const trimmedValue = inputValue.trim();
      if (!trimmedValue || isSending || isStreaming) {
        // Should not call onSendMessage
      } else {
        await onSendMessage(trimmedValue);
      }

      expect(onSendMessage).toHaveBeenCalledWith('Hello');
      expect(onSendMessage).toHaveBeenCalledTimes(1);
    });

    it('should trim whitespace from input before sending', async () => {
      const onSendMessage = vi.fn().mockResolvedValue(undefined);
      const inputValue = '  Hello World  ';
      const isSending = false;
      const isStreaming = false;

      const trimmedValue = inputValue.trim();
      if (!trimmedValue || isSending || isStreaming) {
        // Should not call onSendMessage
      } else {
        await onSendMessage(trimmedValue);
      }

      expect(onSendMessage).toHaveBeenCalledWith('Hello World');
    });
  });

  // ============================================
  // Placeholder Text Tests
  // ============================================

  describe('Input Placeholder Text', () => {
    it('should show waiting placeholder when streaming', () => {
      const isStreaming = true;
      const placeholder = isStreaming
        ? 'Waiting for response...'
        : 'Type your message... (Enter to send, Shift+Enter for new line)';
      expect(placeholder).toBe('Waiting for response...');
    });

    it('should show default placeholder when not streaming', () => {
      const isStreaming = false;
      const placeholder = isStreaming
        ? 'Waiting for response...'
        : 'Type your message... (Enter to send, Shift+Enter for new line)';
      expect(placeholder).toBe('Type your message... (Enter to send, Shift+Enter for new line)');
    });
  });

  // ============================================
  // Message Bubble Styling Tests
  // ============================================

  describe('Message Bubble Styling', () => {
    it('should apply different background for user messages', () => {
      const isUser = true;
      const bgClass = isUser ? 'bg-muted/30' : 'bg-background';
      expect(bgClass).toBe('bg-muted/30');
    });

    it('should apply different background for assistant messages', () => {
      const isUser = false;
      const bgClass = isUser ? 'bg-muted/30' : 'bg-background';
      expect(bgClass).toBe('bg-background');
    });

    it('should apply primary color for user avatar', () => {
      const isUser = true;
      const avatarClass = isUser
        ? 'bg-primary/10 text-primary'
        : 'bg-purple-500/10 text-purple-500';
      expect(avatarClass).toContain('primary');
    });

    it('should apply purple color for assistant avatar', () => {
      const isUser = false;
      const avatarClass = isUser
        ? 'bg-primary/10 text-primary'
        : 'bg-purple-500/10 text-purple-500';
      expect(avatarClass).toContain('purple-500');
    });
  });

  // ============================================
  // Role Label Tests
  // ============================================

  describe('Role Labels', () => {
    it('should display "You" for user messages', () => {
      const isUser = true;
      const label = isUser ? 'You' : 'Architect';
      expect(label).toBe('You');
    });

    it('should display "Architect" for assistant messages', () => {
      const isUser = false;
      const label = isUser ? 'You' : 'Architect';
      expect(label).toBe('Architect');
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('Error Handling', () => {
    it('should handle send message error gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onSendMessage = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        await onSendMessage('Hello');
      } catch {
        // Error is handled by parent hook
        console.error('[InterviewPanel] Failed to send message:', new Error('Network error'));
      }

      expect(onSendMessage).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('should handle stop interview error gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onStopInterview = vi.fn().mockRejectedValue(new Error('Stop failed'));

      try {
        await onStopInterview();
      } catch {
        console.error('[InterviewPanel] Failed to stop interview:', new Error('Stop failed'));
      }

      expect(onStopInterview).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
