/**
 * Unit tests for useDiagramRenderer hook
 * Tests Mermaid diagram rendering functionality
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useDiagramRenderer,
  useDiagramRendererBatch,
  validateMermaidSyntax,
  resetMermaidInitialization,
} from '../useDiagramRenderer';

// Mock mermaid module
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
    parse: vi.fn(),
  },
}));

import mermaid from 'mermaid';

describe('useDiagramRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMermaidInitialization();

    // Default mock implementations
    (mermaid.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {});
    (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValue({
      svg: '<svg>Rendered diagram</svg>',
    });
    (mermaid.parse as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize mermaid on first render', async () => {
      renderHook(() => useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' }));

      await waitFor(() => {
        expect(mermaid.initialize).toHaveBeenCalled();
      });
    });

    it('should initialize with dark theme by default', async () => {
      renderHook(() => useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' }));

      await waitFor(() => {
        expect(mermaid.initialize).toHaveBeenCalledWith(
          expect.objectContaining({
            theme: 'dark',
          })
        );
      });
    });

    it('should initialize with custom theme', async () => {
      renderHook(() =>
        useDiagramRenderer({
          definition: 'flowchart TD\n  A --> B',
          theme: 'light',
        })
      );

      await waitFor(() => {
        expect(mermaid.initialize).toHaveBeenCalledWith(
          expect.objectContaining({
            theme: 'light',
          })
        );
      });
    });

    it('should initialize with strict security level', async () => {
      renderHook(() => useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' }));

      await waitFor(() => {
        expect(mermaid.initialize).toHaveBeenCalledWith(
          expect.objectContaining({
            securityLevel: 'strict',
          })
        );
      });
    });

    it('should initialize with startOnLoad: false', async () => {
      renderHook(() => useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' }));

      await waitFor(() => {
        expect(mermaid.initialize).toHaveBeenCalledWith(
          expect.objectContaining({
            startOnLoad: false,
          })
        );
      });
    });

    it('should only initialize mermaid once across multiple renders', async () => {
      const { rerender } = renderHook(
        (props) => useDiagramRenderer(props),
        { initialProps: { definition: 'flowchart TD\n  A --> B' } }
      );

      rerender({ definition: 'flowchart TD\n  C --> D' });
      rerender({ definition: 'flowchart TD\n  E --> F' });

      await waitFor(() => {
        expect(mermaid.initialize).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('rendering', () => {
    it('should render diagram and return SVG', async () => {
      const mockSvg = '<svg>Test diagram</svg>';
      (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValue({ svg: mockSvg });

      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' })
      );

      await waitFor(() => {
        expect(result.current.svg).toBe(mockSvg);
      });
    });

    it('should call mermaid.render with definition', async () => {
      const definition = 'flowchart TD\n  A --> B';
      renderHook(() => useDiagramRenderer({ definition }));

      await waitFor(() => {
        expect(mermaid.render).toHaveBeenCalledWith(
          expect.any(String),
          definition
        );
      });
    });

    it('should generate unique diagram IDs', async () => {
      const { result: result1 } = renderHook(() =>
        useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' })
      );

      const { result: result2 } = renderHook(() =>
        useDiagramRenderer({ definition: 'flowchart TD\n  C --> D' })
      );

      await waitFor(() => {
        expect(result1.current.diagramId).not.toBe(result2.current.diagramId);
      });
    });

    it('should use custom ID prefix when provided', async () => {
      const { result } = renderHook(() =>
        useDiagramRenderer({
          definition: 'flowchart TD\n  A --> B',
          idPrefix: 'custom',
        })
      );

      await waitFor(() => {
        expect(result.current.diagramId).toContain('custom');
      });
    });

    it('should set isRendering to true during rendering', async () => {
      let resolveRender: ((value: { svg: string }) => void) | undefined;
      (mermaid.render as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRender = resolve;
          })
      );

      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' })
      );

      // Initially rendering
      expect(result.current.isRendering).toBe(true);

      // Complete the render
      await act(async () => {
        resolveRender?.({ svg: '<svg>Done</svg>' });
      });

      await waitFor(() => {
        expect(result.current.isRendering).toBe(false);
      });
    });

    it('should set isRendering to false after successful render', async () => {
      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' })
      );

      await waitFor(() => {
        expect(result.current.isRendering).toBe(false);
        expect(result.current.svg).toBeTruthy();
      });
    });

    it('should re-render when definition changes', async () => {
      const { result, rerender } = renderHook(
        (props) => useDiagramRenderer(props),
        { initialProps: { definition: 'flowchart TD\n  A --> B' } }
      );

      await waitFor(() => {
        expect(mermaid.render).toHaveBeenCalledTimes(1);
      });

      rerender({ definition: 'flowchart TD\n  C --> D' });

      await waitFor(() => {
        expect(mermaid.render).toHaveBeenCalledTimes(2);
      });
    });

    it('should not render if definition is empty', async () => {
      const { result } = renderHook(() => useDiagramRenderer({ definition: '' }));

      await waitFor(() => {
        expect(result.current.svg).toBe('');
        expect(result.current.error).toBeNull();
        expect(mermaid.render).not.toHaveBeenCalled();
      });
    });

    it('should not render if definition is whitespace only', async () => {
      const { result } = renderHook(() => useDiagramRenderer({ definition: '   \n  ' }));

      await waitFor(() => {
        expect(result.current.svg).toBe('');
        expect(mermaid.render).not.toHaveBeenCalled();
      });
    });
  });

  describe('error handling', () => {
    it('should handle render errors gracefully', async () => {
      const errorMessage = 'Syntax error in text';
      (mermaid.render as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'invalid diagram' })
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.svg).toBe('');
      });
    });

    it('should clean error messages for display', async () => {
      const rawError = 'Syntax error in text mermaid version 10.0.0';
      (mermaid.render as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(rawError));

      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'invalid diagram' })
      );

      await waitFor(() => {
        expect(result.current.error).not.toContain('mermaid version');
      });
    });

    it('should replace "Syntax error in text" with user-friendly message', async () => {
      (mermaid.render as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Syntax error in text')
      );

      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'invalid diagram' })
      );

      await waitFor(() => {
        expect(result.current.error).toContain('diagram');
        expect(result.current.error).not.toContain('text');
      });
    });

    it('should handle non-Error exceptions', async () => {
      (mermaid.render as ReturnType<typeof vi.fn>).mockRejectedValue('String error');

      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'invalid diagram' })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to render diagram');
      });
    });

    it('should set isRendering to false after error', async () => {
      (mermaid.render as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'invalid diagram' })
      );

      await waitFor(() => {
        expect(result.current.isRendering).toBe(false);
      });
    });

    it('should clear error on successful re-render', async () => {
      (mermaid.render as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Error'));

      const { result, rerender } = renderHook(
        (props) => useDiagramRenderer(props),
        { initialProps: { definition: 'invalid' } }
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Mock successful render
      (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValue({ svg: '<svg>OK</svg>' });

      rerender({ definition: 'flowchart TD\n  A --> B' });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.svg).toBeTruthy();
      });
    });
  });

  describe('rerender function', () => {
    it('should provide a rerender function', async () => {
      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' })
      );

      await waitFor(() => {
        expect(typeof result.current.rerender).toBe('function');
      });
    });

    it('should force re-render when called', async () => {
      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' })
      );

      await waitFor(() => {
        expect(mermaid.render).toHaveBeenCalledTimes(1);
      });

      act(() => {
        result.current.rerender();
      });

      await waitFor(() => {
        expect(mermaid.render).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('containerRef', () => {
    it('should provide a container ref', async () => {
      const { result } = renderHook(() =>
        useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' })
      );

      expect(result.current.containerRef).toBeDefined();
      expect(result.current.containerRef.current).toBeNull(); // Initially null
    });
  });

  describe('string input shorthand', () => {
    it('should accept string as input instead of options object', async () => {
      const mockSvg = '<svg>Test</svg>';
      (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValue({ svg: mockSvg });

      const { result } = renderHook(() => useDiagramRenderer('flowchart TD\n  A --> B'));

      await waitFor(() => {
        expect(result.current.svg).toBe(mockSvg);
      });
    });
  });
});

describe('useDiagramRendererBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMermaidInitialization();

    (mermaid.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {});
    (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValue({
      svg: '<svg>Batch rendered</svg>',
    });
  });

  it('should render multiple diagrams', async () => {
    const definitions = ['flowchart TD\n  A --> B', 'erDiagram\n  C', 'sequenceDiagram\n  D->>E: Hi'];

    const { result } = renderHook(() => useDiagramRendererBatch(definitions));

    await waitFor(() => {
      expect(result.current).toHaveLength(3);
      result.current.forEach((r) => {
        expect(r.isRendering).toBe(false);
      });
    });
  });

  it('should return SVG for each valid diagram', async () => {
    const definitions = ['flowchart TD\n  A --> B', 'erDiagram\n  C'];

    const { result } = renderHook(() => useDiagramRendererBatch(definitions));

    await waitFor(() => {
      expect(result.current[0].svg).toBe('<svg>Batch rendered</svg>');
      expect(result.current[1].svg).toBe('<svg>Batch rendered</svg>');
    });
  });

  it('should handle empty definitions', async () => {
    const definitions = ['flowchart TD\n  A --> B', '', 'erDiagram\n  C'];

    const { result } = renderHook(() => useDiagramRendererBatch(definitions));

    await waitFor(() => {
      expect(result.current[0].svg).toBeTruthy();
      expect(result.current[1].svg).toBe('');
      expect(result.current[1].error).toBeNull();
      expect(result.current[2].svg).toBeTruthy();
    });
  });

  it('should handle errors in individual diagrams', async () => {
    (mermaid.render as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ svg: '<svg>OK</svg>' })
      .mockRejectedValueOnce(new Error('Bad diagram'))
      .mockResolvedValueOnce({ svg: '<svg>Also OK</svg>' });

    const definitions = ['good', 'bad', 'also good'];

    const { result } = renderHook(() => useDiagramRendererBatch(definitions));

    await waitFor(() => {
      expect(result.current[0].svg).toBe('<svg>OK</svg>');
      expect(result.current[0].error).toBeNull();
      expect(result.current[1].svg).toBe('');
      expect(result.current[1].error).toBeTruthy();
      expect(result.current[2].svg).toBe('<svg>Also OK</svg>');
      expect(result.current[2].error).toBeNull();
    });
  });

  it('should initialize with all diagrams rendering', () => {
    const definitions = ['flowchart TD\n  A --> B', 'erDiagram\n  C'];

    const { result } = renderHook(() => useDiagramRendererBatch(definitions));

    // Initial state should show all as rendering
    expect(result.current).toHaveLength(2);
    result.current.forEach((r) => {
      expect(r.isRendering).toBe(true);
    });
  });

  it('should accept theme option', async () => {
    const definitions = ['flowchart TD\n  A --> B'];

    renderHook(() => useDiagramRendererBatch(definitions, { theme: 'light' }));

    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'light',
        })
      );
    });
  });

  it('should handle empty array', async () => {
    const { result } = renderHook(() => useDiagramRendererBatch([]));

    expect(result.current).toHaveLength(0);
  });

  it('should re-render all when definitions change', async () => {
    const { rerender } = renderHook(
      (props) => useDiagramRendererBatch(props.definitions),
      { initialProps: { definitions: ['flowchart TD\n  A --> B'] } }
    );

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();

    rerender({ definitions: ['flowchart TD\n  C --> D', 'erDiagram\n  E'] });

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledTimes(2);
    });
  });
});

describe('validateMermaidSyntax', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMermaidInitialization();

    (mermaid.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {});
    (mermaid.parse as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it('should return valid for correct syntax', async () => {
    const result = await validateMermaidSyntax('flowchart TD\n  A --> B');

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should call mermaid.parse with definition', async () => {
    const definition = 'flowchart TD\n  A --> B';
    await validateMermaidSyntax(definition);

    expect(mermaid.parse).toHaveBeenCalledWith(definition);
  });

  it('should return invalid for incorrect syntax', async () => {
    (mermaid.parse as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid syntax'));

    const result = await validateMermaidSyntax('not valid mermaid');

    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should return invalid for empty string', async () => {
    const result = await validateMermaidSyntax('');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Empty diagram definition');
  });

  it('should return invalid for whitespace only', async () => {
    const result = await validateMermaidSyntax('   ');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Empty diagram definition');
  });

  it('should initialize mermaid if not already done', async () => {
    await validateMermaidSyntax('flowchart TD\n  A --> B');

    expect(mermaid.initialize).toHaveBeenCalled();
  });

  it('should handle non-Error exceptions', async () => {
    (mermaid.parse as ReturnType<typeof vi.fn>).mockRejectedValue('String error');

    const result = await validateMermaidSyntax('bad');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid diagram syntax');
  });
});

describe('resetMermaidInitialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mermaid.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {});
    (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValue({ svg: '<svg/>' });
  });

  it('should allow re-initialization after reset', async () => {
    // First initialization
    renderHook(() => useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' }));

    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    });

    // Reset
    resetMermaidInitialization();
    vi.clearAllMocks();

    // Second initialization
    renderHook(() => useDiagramRenderer({ definition: 'flowchart TD\n  C --> D' }));

    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    });
  });
});

describe('edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMermaidInitialization();

    (mermaid.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {});
    (mermaid.render as ReturnType<typeof vi.fn>).mockResolvedValue({ svg: '<svg/>' });
  });

  it('should handle rapid definition changes', async () => {
    const { rerender } = renderHook(
      (props) => useDiagramRenderer(props),
      { initialProps: { definition: 'flowchart TD\n  A --> B' } }
    );

    // Rapid changes
    rerender({ definition: 'flowchart TD\n  C --> D' });
    rerender({ definition: 'flowchart TD\n  E --> F' });
    rerender({ definition: 'flowchart TD\n  G --> H' });

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalled();
    });
  });

  it('should handle very long diagram definitions', async () => {
    const nodes = Array.from({ length: 100 }, (_, i) => `  N${i} --> N${i + 1}`).join('\n');
    const definition = `flowchart TD\n${nodes}`;

    const { result } = renderHook(() => useDiagramRenderer({ definition }));

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), definition);
    });
  });

  it('should handle unicode in definitions', async () => {
    const definition = 'flowchart TD\n  A["用户"] --> B["订单"]';

    const { result } = renderHook(() => useDiagramRenderer({ definition }));

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), definition);
    });
  });

  it('should handle special characters in definitions', async () => {
    const definition = 'flowchart TD\n  A["<entity>"] --> B["&amp;test"]';

    const { result } = renderHook(() => useDiagramRenderer({ definition }));

    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), definition);
    });
  });

  it('should handle mermaid initialization failure gracefully', async () => {
    (mermaid.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Init failed');
    });

    // Should not throw
    const { result } = renderHook(() =>
      useDiagramRenderer({ definition: 'flowchart TD\n  A --> B' })
    );

    // Should still attempt to render
    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalled();
    });
  });
});
