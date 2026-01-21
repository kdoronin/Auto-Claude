/**
 * useDiagramRenderer hook for Mermaid diagram rendering
 *
 * Handles Mermaid.js initialization and diagram rendering with:
 * - Single initialization with security settings
 * - Unique IDs for each render to avoid conflicts
 * - Graceful error handling with fallback display
 * - Dark theme support matching app theme
 *
 * @see https://mermaid.js.org/config/setup/modules/mermaidAPI.html
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mermaid from 'mermaid';
import type { DiagramRenderResult } from '../types/architect.types';

// ============================================
// Constants
// ============================================

/**
 * Counter for generating unique diagram IDs
 * Starts at a high value to avoid collisions with any existing IDs
 */
let diagramIdCounter = Date.now();

/**
 * Track if mermaid has been initialized globally
 * Prevents multiple initialization calls
 */
let isMermaidInitialized = false;

/**
 * Default mermaid configuration
 */
const MERMAID_CONFIG: Parameters<typeof mermaid.initialize>[0] = {
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
  },
  sequence: {
    useMaxWidth: true,
    diagramMarginX: 50,
    diagramMarginY: 10,
    actorMargin: 50,
    width: 150,
    height: 65,
    boxMargin: 10,
    boxTextMargin: 5,
    noteMargin: 10,
    messageMargin: 35,
  },
  er: {
    useMaxWidth: true,
    layoutDirection: 'TB',
    entityPadding: 15,
  },
  class: {
    useMaxWidth: true,
  },
  state: {
    useMaxWidth: true,
  },
  pie: {
    useMaxWidth: true,
  },
  mindmap: {
    useMaxWidth: true,
  },
};

// ============================================
// Types
// ============================================

/**
 * Options for the useDiagramRenderer hook
 */
export interface UseDiagramRendererOptions {
  /** The Mermaid diagram definition code */
  definition: string;
  /** Optional theme override ('dark' | 'light' | 'neutral') */
  theme?: 'dark' | 'light' | 'neutral' | 'default';
  /** Optional unique ID prefix for the diagram */
  idPrefix?: string;
}

/**
 * Return type for the useDiagramRenderer hook
 */
export interface UseDiagramRendererReturn {
  /** Rendered SVG string (empty if error or loading) */
  svg: string;
  /** Error message if rendering failed */
  error: string | null;
  /** Ref to attach to the container element */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Whether the diagram is currently being rendered */
  isRendering: boolean;
  /** Force re-render the diagram */
  rerender: () => void;
  /** The unique ID assigned to this diagram */
  diagramId: string;
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize Mermaid with security-focused configuration
 * Only runs once per application lifecycle
 */
function initializeMermaid(theme: string = 'dark'): void {
  if (isMermaidInitialized) {
    return;
  }

  try {
    mermaid.initialize({
      ...MERMAID_CONFIG,
      theme: theme as 'dark' | 'light' | 'neutral' | 'default',
    });
    isMermaidInitialized = true;
  } catch (err) {
    // Silently fail - individual render calls will handle errors
    console.error('Failed to initialize Mermaid:', err);
  }
}

/**
 * Generate a unique ID for a diagram
 */
function generateDiagramId(prefix?: string): string {
  const id = diagramIdCounter++;
  return prefix ? `${prefix}-diagram-${id}` : `mermaid-diagram-${id}`;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for rendering Mermaid diagrams
 *
 * @param options - Rendering options including the Mermaid definition
 * @returns Render result with SVG, error state, and container ref
 *
 * @example
 * ```tsx
 * function MyDiagram({ code }: { code: string }) {
 *   const { svg, error, containerRef } = useDiagramRenderer({
 *     definition: code,
 *     theme: 'dark'
 *   });
 *
 *   if (error) {
 *     return <div className="text-red-500">Error: {error}</div>;
 *   }
 *
 *   return (
 *     <div
 *       ref={containerRef}
 *       dangerouslySetInnerHTML={{ __html: svg }}
 *     />
 *   );
 * }
 * ```
 */
export function useDiagramRenderer(
  options: UseDiagramRendererOptions | string
): UseDiagramRendererReturn {
  // Normalize options
  const normalizedOptions: UseDiagramRendererOptions = useMemo(() => {
    if (typeof options === 'string') {
      return { definition: options };
    }
    return options;
  }, [options]);

  const { definition, theme = 'dark', idPrefix } = normalizedOptions;

  // State
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderKey, setRenderKey] = useState<number>(0);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const diagramIdRef = useRef<string>(generateDiagramId(idPrefix));

  // Memoized diagram ID
  const diagramId = diagramIdRef.current;

  // Initialize Mermaid on first use
  useEffect(() => {
    initializeMermaid(theme);
  }, [theme]);

  // Render function
  const renderDiagram = useCallback(async () => {
    if (!definition || !definition.trim()) {
      setSvg('');
      setError(null);
      setIsRendering(false);
      return;
    }

    setIsRendering(true);
    setError(null);

    try {
      // Generate a unique ID for this specific render
      // This prevents ID collisions when multiple diagrams are rendered
      const uniqueRenderId = `${diagramId}-${Date.now()}`;

      // Parse and render the diagram
      const { svg: renderedSvg } = await mermaid.render(uniqueRenderId, definition);

      // Clean up any old SVG elements with our ID prefix (from previous renders)
      // Mermaid creates elements in the DOM that can accumulate
      const existingElements = document.querySelectorAll(`[id^="${diagramId}-"]`);
      existingElements.forEach((el) => {
        // Don't remove the element we just created
        if (el.id !== uniqueRenderId) {
          el.remove();
        }
      });

      setSvg(renderedSvg);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram';

      // Clean up error message for user display
      const cleanedError = errorMessage
        .replace(/^Syntax error in text/, 'Syntax error in diagram')
        .replace(/mermaid version [\d.]+/g, '')
        .trim();

      setSvg('');
      setError(cleanedError || 'Failed to render diagram');
    } finally {
      setIsRendering(false);
    }
  }, [definition, diagramId]);

  // Trigger render on definition change or manual rerender
  useEffect(() => {
    renderDiagram();
  }, [renderDiagram, renderKey]);

  // Force rerender function
  const rerender = useCallback(() => {
    setRenderKey((k) => k + 1);
  }, []);

  return {
    svg,
    error,
    containerRef,
    isRendering,
    rerender,
    diagramId,
  };
}

// ============================================
// Additional Utilities
// ============================================

/**
 * Hook for rendering multiple diagrams efficiently
 * Batches initialization and provides a shared theme context
 *
 * @param definitions - Array of Mermaid definitions to render
 * @param options - Shared rendering options
 * @returns Array of render results
 */
export function useDiagramRendererBatch(
  definitions: string[],
  options?: { theme?: 'dark' | 'light' | 'neutral' | 'default' }
): Array<DiagramRenderResult & { isRendering: boolean }> {
  const { theme = 'dark' } = options || {};
  const [results, setResults] = useState<Array<DiagramRenderResult & { isRendering: boolean }>>(
    definitions.map(() => ({ svg: '', error: null, isRendering: true }))
  );

  useEffect(() => {
    initializeMermaid(theme);
  }, [theme]);

  useEffect(() => {
    const renderAll = async () => {
      const newResults: Array<DiagramRenderResult & { isRendering: boolean }> = [];

      for (let i = 0; i < definitions.length; i++) {
        const definition = definitions[i];

        if (!definition || !definition.trim()) {
          newResults.push({ svg: '', error: null, isRendering: false });
          continue;
        }

        try {
          const id = `batch-diagram-${Date.now()}-${i}`;
          const { svg } = await mermaid.render(id, definition);
          newResults.push({ svg, error: null, isRendering: false });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram';
          newResults.push({ svg: '', error: errorMessage, isRendering: false });
        }
      }

      setResults(newResults);
    };

    renderAll();
  }, [definitions, theme]);

  return results;
}

/**
 * Validate Mermaid syntax without rendering
 * Useful for pre-validation before display
 *
 * @param definition - Mermaid definition to validate
 * @returns Promise<{ valid: boolean; error?: string }>
 */
export async function validateMermaidSyntax(
  definition: string
): Promise<{ valid: boolean; error?: string }> {
  if (!definition || !definition.trim()) {
    return { valid: false, error: 'Empty diagram definition' };
  }

  // Initialize if needed
  initializeMermaid();

  try {
    // Use mermaid's parse function for validation without rendering
    await mermaid.parse(definition);
    return { valid: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Invalid diagram syntax';
    return { valid: false, error: errorMessage };
  }
}

/**
 * Reset Mermaid initialization state
 * Useful for testing or when changing global theme
 */
export function resetMermaidInitialization(): void {
  isMermaidInitialized = false;
}

/**
 * Export the default hook as default
 */
export default useDiagramRenderer;
