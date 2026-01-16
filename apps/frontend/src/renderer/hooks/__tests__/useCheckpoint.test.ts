/**
 * @vitest-environment jsdom
 */
/**
 * Unit tests for useCheckpoint hook
 *
 * Story Reference: Story 5.4 - Implement Checkpoint Approval Flow
 * Tests hook for managing checkpoint operations in Semi-Auto mode
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCheckpoint } from '../useCheckpoint';
import { useCheckpointStore } from '../../stores/checkpoint-store';
import type { CheckpointInfo, FeedbackAttachment } from '../../components/checkpoints/types';

// Mock electronAPI
const mockApprove = vi.fn();
const mockRevise = vi.fn();
const mockCancel = vi.fn();
const mockOnCheckpointReached = vi.fn();
const mockOnCheckpointResumed = vi.fn();

// Store the callbacks so we can trigger events
let checkpointReachedCallback: ((taskId: string, checkpoint: CheckpointInfo) => void) | null = null;
let checkpointResumedCallback: ((taskId: string, checkpointId: string, decision: string) => void) | null = null;

beforeEach(() => {
  // Reset callbacks
  checkpointReachedCallback = null;
  checkpointResumedCallback = null;

  // Setup mock implementation that captures callbacks
  mockOnCheckpointReached.mockImplementation((callback) => {
    checkpointReachedCallback = callback;
    return vi.fn(); // Return cleanup function
  });

  mockOnCheckpointResumed.mockImplementation((callback) => {
    checkpointResumedCallback = callback;
    return vi.fn(); // Return cleanup function
  });

  // Default success responses
  mockApprove.mockResolvedValue({ success: true, data: { success: true, message: 'Approved', resumed: true } });
  mockRevise.mockResolvedValue({ success: true, data: { success: true, message: 'Revised', resumed: true } });
  mockCancel.mockResolvedValue({ success: true, data: { success: true, message: 'Cancelled', stopped: true } });

  // Mock window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    value: {
      checkpoints: {
        approve: mockApprove,
        revise: mockRevise,
        cancel: mockCancel,
        onCheckpointReached: mockOnCheckpointReached,
        onCheckpointResumed: mockOnCheckpointResumed,
      },
    },
    writable: true,
  });

  // Reset store
  useCheckpointStore.setState({
    currentCheckpoint: null,
    isProcessing: false,
    feedbackHistory: [],
    error: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// Helper to create test checkpoint
function createTestCheckpoint(overrides: Partial<CheckpointInfo> = {}): CheckpointInfo {
  return {
    checkpointId: 'after_planning',
    name: 'Planning Review',
    description: 'Review implementation plan before coding begins',
    phase: 'planning',
    taskId: 'task-123',
    pausedAt: new Date().toISOString(),
    artifacts: [],
    decisions: [],
    warnings: [],
    requiresApproval: true,
    summary: 'Test checkpoint',
    ...overrides,
  };
}

describe('useCheckpoint', () => {
  describe('initial state', () => {
    it('should return null checkpoint initially', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));

      expect(result.current.checkpoint).toBeNull();
      expect(result.current.isOpen).toBe(false);
    });

    it('should not be processing initially', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));

      expect(result.current.isProcessing).toBe(false);
    });

    it('should have empty feedback history initially', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));

      expect(result.current.feedbackHistory).toHaveLength(0);
    });

    it('should have no error initially', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));

      expect(result.current.error).toBeNull();
    });
  });

  describe('event listeners', () => {
    it('should register checkpoint-reached listener on mount', () => {
      renderHook(() => useCheckpoint('task-123'));

      expect(mockOnCheckpointReached).toHaveBeenCalledTimes(1);
      expect(mockOnCheckpointReached).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should register checkpoint-resumed listener on mount', () => {
      renderHook(() => useCheckpoint('task-123'));

      expect(mockOnCheckpointResumed).toHaveBeenCalledTimes(1);
      expect(mockOnCheckpointResumed).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should set checkpoint when checkpoint-reached event fires', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      // Simulate checkpoint-reached event
      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      expect(result.current.checkpoint).toEqual(checkpoint);
      expect(result.current.isOpen).toBe(true);
    });

    it('should ignore checkpoint-reached for different task', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint({ taskId: 'different-task' });

      // Simulate checkpoint-reached event for different task
      act(() => {
        checkpointReachedCallback?.('different-task', checkpoint);
      });

      expect(result.current.checkpoint).toBeNull();
      expect(result.current.isOpen).toBe(false);
    });

    it('should clear checkpoint when checkpoint-resumed event fires', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      // First set a checkpoint
      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      expect(result.current.checkpoint).not.toBeNull();

      // Simulate checkpoint-resumed event
      act(() => {
        checkpointResumedCallback?.('task-123', 'after_planning', 'approve');
      });

      expect(result.current.checkpoint).toBeNull();
      expect(result.current.isProcessing).toBe(false);
    });

    it('should ignore checkpoint-resumed for different task', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      // First set a checkpoint
      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      // Simulate checkpoint-resumed event for different task
      act(() => {
        checkpointResumedCallback?.('different-task', 'after_planning', 'approve');
      });

      // Checkpoint should still be there
      expect(result.current.checkpoint).not.toBeNull();
    });
  });

  describe('approve', () => {
    it('should call electronAPI.checkpoints.approve', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      // Set checkpoint first
      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      // Call approve
      await act(async () => {
        await result.current.approve();
      });

      expect(mockApprove).toHaveBeenCalledWith('task-123', 'after_planning', undefined, undefined);
    });

    it('should call approve with feedback', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      await act(async () => {
        await result.current.approve('Good work!');
      });

      expect(mockApprove).toHaveBeenCalledWith('task-123', 'after_planning', 'Good work!', undefined);
    });

    it('should call approve with attachments', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();
      const attachments: FeedbackAttachment[] = [
        { id: 'attach-1', type: 'file', path: '/path/to/file.txt', name: 'file.txt' },
      ];

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      await act(async () => {
        await result.current.approve('Feedback', attachments);
      });

      expect(mockApprove).toHaveBeenCalledWith('task-123', 'after_planning', 'Feedback', attachments);
    });

    it('should set processing state during approve', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      // Make approve hang to check processing state
      let resolveApprove: (value: unknown) => void;
      mockApprove.mockImplementation(() => new Promise((resolve) => {
        resolveApprove = resolve;
      }));

      let approvePromise: Promise<void>;
      act(() => {
        approvePromise = result.current.approve();
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(true);
      });

      // Resolve
      await act(async () => {
        resolveApprove!({ success: true, data: { success: true, resumed: true } });
        await approvePromise;
      });
    });

    it('should set error on failure', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      mockApprove.mockResolvedValue({ success: false, error: 'Approval failed' });

      await act(async () => {
        await result.current.approve();
      });

      expect(result.current.error).toBe('Approval failed');
      expect(result.current.isProcessing).toBe(false);
    });

    it('should set error without checkpoint', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));

      await act(async () => {
        await result.current.approve();
      });

      expect(result.current.error).toBe('No checkpoint or task to approve');
    });
  });

  describe('revise', () => {
    it('should call electronAPI.checkpoints.revise with feedback', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      await act(async () => {
        await result.current.revise('Please add error handling');
      });

      expect(mockRevise).toHaveBeenCalledWith('task-123', 'after_planning', 'Please add error handling', undefined);
    });

    it('should require non-empty feedback', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      await act(async () => {
        await result.current.revise('   '); // Whitespace only
      });

      expect(mockRevise).not.toHaveBeenCalled();
      expect(result.current.error).toBe('Feedback is required for revision');
    });

    it('should call revise with attachments', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();
      const attachments: FeedbackAttachment[] = [
        { id: 'attach-1', type: 'file', path: '/path/to/screenshot.png', name: 'screenshot.png' },
      ];

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      await act(async () => {
        await result.current.revise('Check this screenshot', attachments);
      });

      expect(mockRevise).toHaveBeenCalledWith('task-123', 'after_planning', 'Check this screenshot', attachments);
    });

    it('should set error on failure', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      mockRevise.mockResolvedValue({ success: false, error: 'Revision failed' });

      await act(async () => {
        await result.current.revise('Feedback');
      });

      expect(result.current.error).toBe('Revision failed');
    });
  });

  describe('cancel', () => {
    it('should call electronAPI.checkpoints.cancel', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      await act(async () => {
        await result.current.cancel();
      });

      expect(mockCancel).toHaveBeenCalledWith('task-123', 'after_planning');
    });

    it('should set error without checkpoint', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));

      await act(async () => {
        await result.current.cancel();
      });

      expect(result.current.error).toBe('No checkpoint or task to cancel');
    });

    it('should set error on failure', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      mockCancel.mockResolvedValue({ success: false, error: 'Cancel failed' });

      await act(async () => {
        await result.current.cancel();
      });

      expect(result.current.error).toBe('Cancel failed');
    });
  });

  describe('closeDialog', () => {
    it('should clear checkpoint state', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      // Set checkpoint
      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      expect(result.current.isOpen).toBe(true);

      // Close dialog
      act(() => {
        result.current.closeDialog();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.checkpoint).toBeNull();
    });
  });

  describe('store actions exposure', () => {
    it('should expose setCheckpoint', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        result.current.setCheckpoint(checkpoint);
      });

      expect(result.current.checkpoint).toEqual(checkpoint);
    });

    it('should expose setFeedbackHistory', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));

      act(() => {
        result.current.setFeedbackHistory([{
          id: 'feedback-1',
          checkpointId: 'after_planning',
          feedback: 'Test',
          attachments: [],
          createdAt: new Date().toISOString(),
        }]);
      });

      expect(result.current.feedbackHistory).toHaveLength(1);
    });

    it('should expose addFeedback', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));

      act(() => {
        result.current.addFeedback({
          id: 'feedback-1',
          checkpointId: 'after_planning',
          feedback: 'Test',
          attachments: [],
          createdAt: new Date().toISOString(),
        });
      });

      expect(result.current.feedbackHistory).toHaveLength(1);
    });

    it('should expose setError', () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));

      act(() => {
        result.current.setError('Custom error');
      });

      expect(result.current.error).toBe('Custom error');
    });
  });

  describe('without taskId', () => {
    it('should work without taskId (all events)', () => {
      const { result } = renderHook(() => useCheckpoint());
      const checkpoint = createTestCheckpoint({ taskId: 'any-task' });

      // Should receive events for any task
      act(() => {
        checkpointReachedCallback?.('any-task', checkpoint);
      });

      expect(result.current.checkpoint).toEqual(checkpoint);
    });

    it('should fail approve without taskId', async () => {
      const { result } = renderHook(() => useCheckpoint()); // No taskId
      const checkpoint = createTestCheckpoint();

      act(() => {
        result.current.setCheckpoint(checkpoint);
      });

      await act(async () => {
        await result.current.approve();
      });

      expect(result.current.error).toBe('No checkpoint or task to approve');
    });
  });

  describe('exception handling', () => {
    it('should handle approve throwing exception', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      mockApprove.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await result.current.approve();
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.isProcessing).toBe(false);
    });

    it('should handle non-Error exception', async () => {
      const { result } = renderHook(() => useCheckpoint('task-123'));
      const checkpoint = createTestCheckpoint();

      act(() => {
        checkpointReachedCallback?.('task-123', checkpoint);
      });

      mockApprove.mockRejectedValue('String error');

      await act(async () => {
        await result.current.approve();
      });

      expect(result.current.error).toBe('Unknown error');
    });
  });
});
