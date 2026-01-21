/**
 * InterviewPanel component for architect AI conversation
 *
 * Displays the interview conversation between user and AI architect,
 * with message input, streaming support, and conversation history.
 *
 * Follows patterns from:
 * - GenerationProgressScreen.tsx for streaming UI
 * - IdeaDetailPanel.tsx for panel layout
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Square,
  User,
  Bot,
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { ScrollArea } from '../../ui/scroll-area';
import { Textarea } from '../../ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../ui/collapsible';
import { cn } from '../../../lib/utils';
import type {
  InterviewPanelProps,
  InterviewMessage,
  SessionStatus,
} from '../types/architect.types';

// ============================================
// Constants
// ============================================

const STATUS_LABELS: Record<SessionStatus, string> = {
  interview: 'Interview in progress',
  schemas: 'Generating schemas',
  modules: 'Decomposing modules',
  tasks: 'Generating tasks',
  complete: 'Complete',
};

const STATUS_COLORS: Record<SessionStatus, string> = {
  interview: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  schemas: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  modules: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  tasks: 'bg-green-500/10 text-green-500 border-green-500/20',
  complete: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
};

// ============================================
// Sub-components
// ============================================

interface MessageBubbleProps {
  message: InterviewMessage;
  isLatest: boolean;
}

/**
 * Individual message bubble in the conversation
 */
function MessageBubble({ message, isLatest }: MessageBubbleProps) {
  const [showThinking, setShowThinking] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const hasThinking = isAssistant && message.thinking;

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        isUser ? 'bg-muted/30' : 'bg-background'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-primary/10 text-primary'
            : 'bg-purple-500/10 text-purple-500'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Role label */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? 'You' : 'Architect'}
          </span>
          {isLatest && message.isStreaming && (
            <Badge variant="outline" className="text-[10px] py-0 h-4">
              <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
              Thinking...
            </Badge>
          )}
        </div>

        {/* Thinking content (collapsible) */}
        {hasThinking && (
          <Collapsible open={showThinking} onOpenChange={setShowThinking}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Brain className="h-3 w-3 mr-1" />
                Extended thinking
                {showThinking ? (
                  <ChevronUp className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-3 bg-muted/50 rounded-md border border-border/50">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {message.thinking}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Message text */}
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
          {isLatest && message.isStreaming && !message.content && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse delay-150">●</span>
              <span className="animate-pulse delay-300">●</span>
            </span>
          )}
        </div>

        {/* Timestamp */}
        <div className="text-[10px] text-muted-foreground/60">
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format a timestamp for display
 */
function formatTimestamp(timestamp: Date | string): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// Main Component
// ============================================

/**
 * InterviewPanel - AI architect conversation interface
 *
 * Features:
 * - Message history display with user/assistant distinction
 * - Input field with send button
 * - Streaming response indicator
 * - Stop button during streaming
 * - Auto-scroll to latest message
 * - Session status indicator
 */
export function InterviewPanel({
  session,
  onSendMessage,
  isStreaming,
  onStopInterview,
}: InterviewPanelProps & { onStopInterview?: () => Promise<void> }) {
  const { t } = useTranslation(['common']);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get messages from session
  const messages = useMemo(
    () => session.interviewHistory || [],
    [session.interviewHistory]
  );

  // ============================================
  // Auto-scroll on new messages
  // ============================================

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ============================================
  // Handlers
  // ============================================

  /**
   * Handle sending a message
   */
  const handleSend = useCallback(async () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue || isSending || isStreaming) return;

    setIsSending(true);
    setInputValue('');

    try {
      await onSendMessage(trimmedValue);
    } catch (err) {
      // Error is handled by the parent hook
      console.error('[InterviewPanel] Failed to send message:', err);
    } finally {
      setIsSending(false);
      // Focus textarea after sending
      textareaRef.current?.focus();
    }
  }, [inputValue, isSending, isStreaming, onSendMessage]);

  /**
   * Handle keyboard events in textarea
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Send on Enter (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  /**
   * Handle stop button click
   */
  const handleStopClick = useCallback(async () => {
    if (!onStopInterview || isStopping) return;

    setIsStopping(true);
    try {
      await onStopInterview();
    } catch (err) {
      console.error('[InterviewPanel] Failed to stop interview:', err);
    } finally {
      setIsStopping(false);
    }
  }, [onStopInterview, isStopping]);

  // ============================================
  // Render
  // ============================================

  const isInputDisabled = isSending || isStreaming;
  const canSend = inputValue.trim().length > 0 && !isInputDisabled;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Interview</h3>
            <Badge
              variant="outline"
              className={cn('text-[10px]', STATUS_COLORS[session.status])}
            >
              {STATUS_LABELS[session.status]}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {messages.length} messages
            </span>
            {isStreaming && onStopInterview && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopClick}
                disabled={isStopping}
                className="h-6 px-2 text-xs"
              >
                <Square className="h-3 w-3 mr-1" />
                {isStopping ? 'Stopping...' : 'Stop'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/50">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-8">
              <Bot className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h4 className="text-sm font-medium text-muted-foreground mb-1">
                Start the conversation
              </h4>
              <p className="text-xs text-muted-foreground/60">
                Describe your project and the AI architect will help you design
                the architecture through a series of questions.
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLatest={index === messages.length - 1}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="shrink-0 p-4 border-t border-border bg-card/30">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? 'Waiting for response...'
                : 'Type your message... (Enter to send, Shift+Enter for new line)'
            }
            disabled={isInputDisabled}
            className={cn(
              'min-h-[60px] max-h-[200px] resize-none',
              isInputDisabled && 'opacity-50 cursor-not-allowed'
            )}
            rows={2}
          />
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSend}
              disabled={!canSend}
              size="icon"
              className="h-[60px] w-10"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {isStreaming && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>AI is thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default InterviewPanel;
