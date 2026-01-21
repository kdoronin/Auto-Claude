/**
 * SchemaViewer component for displaying architectural diagrams
 *
 * Features:
 * - Tab navigation for different schema/diagram types
 * - Mermaid diagram rendering with useDiagramRenderer hook
 * - Zoom/pan support for large diagrams
 * - Error fallback showing raw Mermaid code
 * - Schema selection and highlighting
 *
 * Follows patterns from InterviewPanel.tsx and existing UI components.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileCode2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  Layers,
  Workflow,
  Database,
  Share2,
  Box,
  GitBranch,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { ScrollArea } from '../../ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../ui/collapsible';
import { cn } from '../../../lib/utils';
import { useDiagramRenderer } from '../hooks/useDiagramRenderer';
import { getSchemaTypeLabel } from '../utils/schemaParser';
import type { SchemaViewerProps, ArchitectSchema, SchemaType } from '../types/architect.types';

// ============================================
// Constants
// ============================================

/**
 * Icons for each schema type
 */
const SCHEMA_TYPE_ICONS: Record<SchemaType, typeof Layers> = {
  system: Layers,
  entity: Database,
  flow: Workflow,
  component: Box,
  database: Database,
  sequence: GitBranch,
};

/**
 * Colors for each schema type
 */
const SCHEMA_TYPE_COLORS: Record<SchemaType, string> = {
  system: 'text-blue-500',
  entity: 'text-purple-500',
  flow: 'text-green-500',
  component: 'text-amber-500',
  database: 'text-cyan-500',
  sequence: 'text-pink-500',
};

/**
 * Default zoom levels
 */
const ZOOM_LEVELS = {
  min: 0.25,
  max: 3,
  step: 0.25,
  default: 1,
};

// ============================================
// Sub-components
// ============================================

interface DiagramPanelProps {
  schema: ArchitectSchema;
  isActive: boolean;
}

/**
 * Individual diagram panel with rendering and controls
 */
function DiagramPanel({ schema, isActive }: DiagramPanelProps) {
  const [zoom, setZoom] = useState(ZOOM_LEVELS.default);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use the diagram renderer hook
  const { svg, error, isRendering, rerender } = useDiagramRenderer({
    definition: schema.mermaidCode,
    theme: 'dark',
    idPrefix: `schema-${schema.id}`,
  });

  // ============================================
  // Handlers
  // ============================================

  /**
   * Handle zoom in
   */
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_LEVELS.step, ZOOM_LEVELS.max));
  }, []);

  /**
   * Handle zoom out
   */
  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_LEVELS.step, ZOOM_LEVELS.min));
  }, []);

  /**
   * Reset zoom and position
   */
  const handleReset = useCallback(() => {
    setZoom(ZOOM_LEVELS.default);
    setPosition({ x: 0, y: 0 });
  }, []);

  /**
   * Handle mouse down for dragging
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    },
    [position]
  );

  /**
   * Handle mouse move for dragging
   */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  /**
   * Handle mouse up to stop dragging
   */
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  /**
   * Handle mouse wheel for zoom
   */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_LEVELS.step : ZOOM_LEVELS.step;
      setZoom((prev) => {
        const newZoom = prev + delta;
        return Math.max(ZOOM_LEVELS.min, Math.min(ZOOM_LEVELS.max, newZoom));
      });
    }
  }, []);

  /**
   * Copy Mermaid code to clipboard
   */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(schema.mermaidCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [schema.mermaidCode]);

  /**
   * Toggle fullscreen mode
   */
  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // ============================================
  // Effects
  // ============================================

  // Reset position/zoom when schema changes
  useEffect(() => {
    handleReset();
  }, [schema.id, handleReset]);

  // Handle escape key for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // ============================================
  // Render
  // ============================================

  const Icon = SCHEMA_TYPE_ICONS[schema.type];
  const iconColor = SCHEMA_TYPE_COLORS[schema.type];

  return (
    <div
      className={cn(
        'flex flex-col h-full',
        isFullscreen && 'fixed inset-0 z-50 bg-background'
      )}
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', iconColor)} />
          <span className="text-sm font-medium">{schema.title}</span>
          <Badge variant="outline" className="text-[10px]">
            v{schema.version}
          </Badge>
          {isRendering && (
            <Badge variant="outline" className="text-[10px]">
              <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
              Rendering...
            </Badge>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleZoomOut}
            disabled={zoom <= ZOOM_LEVELS.min}
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleZoomIn}
            disabled={zoom >= ZOOM_LEVELS.max}
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleReset}
            title="Reset view"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            title="Copy Mermaid code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Diagram area */}
      <div
        ref={containerRef}
        className={cn(
          'flex-1 overflow-hidden relative bg-muted/20',
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Loading state */}
        {isRendering && !svg && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm text-muted-foreground text-center mb-4">
              Failed to render diagram
            </p>
            <p className="text-xs text-red-400 text-center max-w-md mb-4">
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={rerender}>
              Retry
            </Button>
          </div>
        )}

        {/* Rendered diagram */}
        {svg && !error && (
          <div
            className="absolute inset-0 flex items-center justify-center p-4"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            <div
              className="mermaid-diagram bg-card rounded-lg p-4 shadow-lg"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        )}

        {/* Zoom indicator overlay */}
        {zoom !== ZOOM_LEVELS.default && (
          <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
            {Math.round(zoom * 100)}% • Scroll to zoom • Drag to pan
          </div>
        )}
      </div>

      {/* Code view (collapsible) */}
      <Collapsible open={showCode} onOpenChange={setShowCode}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-8 rounded-none border-t border-border text-xs text-muted-foreground hover:text-foreground"
          >
            <FileCode2 className="h-3 w-3 mr-1" />
            {showCode ? 'Hide' : 'Show'} Mermaid Code
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border bg-muted/30">
            <ScrollArea className="h-48">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words">
                {schema.mermaidCode}
              </pre>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ============================================
// Empty State
// ============================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Share2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h4 className="text-sm font-medium text-muted-foreground mb-1">
        No schemas generated yet
      </h4>
      <p className="text-xs text-muted-foreground/60">
        Complete the interview to generate architectural diagrams and schemas.
      </p>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

/**
 * SchemaViewer - Display and navigate architectural diagrams
 *
 * Features:
 * - Tab navigation for different schema types
 * - Mermaid diagram rendering
 * - Zoom/pan for large diagrams
 * - Error fallback to raw Mermaid code
 * - Schema selection callback
 */
export function SchemaViewer({
  schemas,
  onSchemaSelect,
  selectedSchemaId,
}: SchemaViewerProps) {
  const { t } = useTranslation(['common']);

  // Group schemas by type for tab organization
  const schemasByType = useMemo(() => {
    const grouped = new Map<SchemaType, ArchitectSchema[]>();

    for (const schema of schemas) {
      const existing = grouped.get(schema.type) || [];
      grouped.set(schema.type, [...existing, schema]);
    }

    return grouped;
  }, [schemas]);

  // Get available schema types
  const availableTypes = useMemo(() => {
    return Array.from(schemasByType.keys());
  }, [schemasByType]);

  // Determine active schema
  const [activeType, setActiveType] = useState<SchemaType | null>(
    availableTypes[0] || null
  );

  // Update active type when schemas change
  useEffect(() => {
    if (availableTypes.length > 0 && !availableTypes.includes(activeType as SchemaType)) {
      setActiveType(availableTypes[0]);
    }
  }, [availableTypes, activeType]);

  // Get schemas for the active type
  const activeSchemas = useMemo(() => {
    if (!activeType) return [];
    return schemasByType.get(activeType) || [];
  }, [activeType, schemasByType]);

  // Determine selected schema (or first of active type)
  const selectedSchema = useMemo(() => {
    if (selectedSchemaId) {
      return schemas.find((s) => s.id === selectedSchemaId);
    }
    return activeSchemas[0];
  }, [selectedSchemaId, schemas, activeSchemas]);

  // ============================================
  // Handlers
  // ============================================

  /**
   * Handle tab change
   */
  const handleTabChange = useCallback(
    (value: string) => {
      const type = value as SchemaType;
      setActiveType(type);

      // Select first schema of this type
      const schemasOfType = schemasByType.get(type);
      if (schemasOfType && schemasOfType.length > 0 && onSchemaSelect) {
        onSchemaSelect(schemasOfType[0].id);
      }
    },
    [schemasByType, onSchemaSelect]
  );

  /**
   * Handle schema selection within a type
   */
  const handleSchemaClick = useCallback(
    (schemaId: string) => {
      if (onSchemaSelect) {
        onSchemaSelect(schemaId);
      }
    },
    [onSchemaSelect]
  );

  // ============================================
  // Render
  // ============================================

  if (schemas.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Schema Viewer</h3>
            <Badge variant="outline" className="text-[10px]">
              0 schemas
            </Badge>
          </div>
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with tabs */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Schema Viewer</h3>
            <Badge variant="outline" className="text-[10px]">
              {schemas.length} {schemas.length === 1 ? 'schema' : 'schemas'}
            </Badge>
          </div>
        </div>

        {/* Schema type tabs */}
        {availableTypes.length > 1 && (
          <Tabs
            value={activeType || undefined}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="w-full justify-start h-8 bg-muted/50">
              {availableTypes.map((type) => {
                const Icon = SCHEMA_TYPE_ICONS[type];
                const count = schemasByType.get(type)?.length || 0;

                return (
                  <TabsTrigger
                    key={type}
                    value={type}
                    className="text-xs h-6 px-2 data-[state=active]:bg-background"
                  >
                    <Icon className={cn('h-3 w-3 mr-1', SCHEMA_TYPE_COLORS[type])} />
                    {getSchemaTypeLabel(type)}
                    {count > 1 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 h-4 px-1 text-[10px]"
                      >
                        {count}
                      </Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}

        {/* Schema selector within type (if multiple) */}
        {activeSchemas.length > 1 && (
          <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
            {activeSchemas.map((schema) => (
              <Button
                key={schema.id}
                variant={selectedSchema?.id === schema.id ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs shrink-0"
                onClick={() => handleSchemaClick(schema.id)}
              >
                {schema.title}
                <Badge
                  variant="outline"
                  className="ml-1 text-[9px] h-3.5 px-1"
                >
                  v{schema.version}
                </Badge>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Diagram viewer */}
      <div className="flex-1 min-h-0">
        {selectedSchema ? (
          <DiagramPanel
            schema={selectedSchema}
            isActive={true}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

export default SchemaViewer;
