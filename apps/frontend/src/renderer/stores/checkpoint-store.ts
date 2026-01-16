/**
 * Checkpoint store for Semi-Auto execution mode.
 *
 * Story Reference: Story 5.4 - Implement Checkpoint Approval Flow
 * Architecture Source: architecture.md#Checkpoint-Service
 *
 * Manages checkpoint state for the UI, including the currently displayed
 * checkpoint and processing state.
 */

import { create } from 'zustand';
import type { CheckpointInfo, CheckpointFeedback } from '../components/checkpoints/types';

export interface CheckpointState {
  /** Currently displayed checkpoint, or null if no checkpoint dialog is open */
  currentCheckpoint: CheckpointInfo | null;
  /** Whether a checkpoint action is being processed */
  isProcessing: boolean;
  /** Feedback history for the current checkpoint */
  feedbackHistory: CheckpointFeedback[];
  /** Error message from the last operation, if any */
  error: string | null;
}

export interface CheckpointActions {
  /** Set the current checkpoint to display */
  setCheckpoint: (checkpoint: CheckpointInfo | null) => void;
  /** Set the processing state */
  setProcessing: (isProcessing: boolean) => void;
  /** Set the feedback history */
  setFeedbackHistory: (history: CheckpointFeedback[]) => void;
  /** Add a feedback entry to history */
  addFeedback: (feedback: CheckpointFeedback) => void;
  /** Set error message */
  setError: (error: string | null) => void;
  /** Clear checkpoint state (e.g., after closing dialog) */
  clearCheckpoint: () => void;
}

export type CheckpointStore = CheckpointState & CheckpointActions;

export const useCheckpointStore = create<CheckpointStore>((set) => ({
  // Initial state
  currentCheckpoint: null,
  isProcessing: false,
  feedbackHistory: [],
  error: null,

  // Actions
  setCheckpoint: (checkpoint) =>
    set({
      currentCheckpoint: checkpoint,
      feedbackHistory: [],
      error: null,
    }),

  setProcessing: (isProcessing) =>
    set({ isProcessing }),

  setFeedbackHistory: (history) =>
    set({ feedbackHistory: history }),

  addFeedback: (feedback) =>
    set((state) => ({
      feedbackHistory: [...state.feedbackHistory, feedback],
    })),

  setError: (error) =>
    set({ error }),

  clearCheckpoint: () =>
    set({
      currentCheckpoint: null,
      isProcessing: false,
      feedbackHistory: [],
      error: null,
    }),
}));
