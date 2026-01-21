/**
 * ModuleList component for displaying module decomposition
 *
 * Features:
 * - List of decomposed modules with details
 * - Responsibilities and entities display
 * - Dependencies visualization between modules
 * - Complexity indicators
 * - Human-in-the-loop validation support
 *
 * Follows patterns from SchemaViewer.tsx and InterviewPanel.tsx.
 */
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Boxes,
  Box,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Link2,
  ListChecks,
  Sparkles,
  Loader2,
  PenLine,
  AlertTriangle,
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
  ModuleListProps,
  ModuleDefinition,
  ModuleComplexity,
} from '../types/architect.types';

// ============================================
// Constants
// ============================================

/**
 * Complexity level labels
 */
const COMPLEXITY_LABELS: Record<ModuleComplexity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/**
 * Complexity level colors
 */
const COMPLEXITY_COLORS: Record<ModuleComplexity, string> = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
};

/**
 * Complexity icons
 */
const COMPLEXITY_ICONS: Record<ModuleComplexity, string> = {
  low: '●',
  medium: '●●',
  high: '●●●',
};

// ============================================
// Sub-components
// ============================================

interface ModuleCardProps {
  module: ModuleDefinition;
  allModules: ModuleDefinition[];
  onValidate: (moduleId: string, notes?: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

/**
 * Individual module card with details and validation
 */
function ModuleCard({
  module,
  allModules,
  onValidate,
  isExpanded,
  onToggleExpand,
}: ModuleCardProps) {
  const [showValidationInput, setShowValidationInput] = useState(false);
  const [validationNotes, setValidationNotes] = useState(
    module.validationNotes || ''
  );
  const [isValidating, setIsValidating] = useState(false);

  // Get dependency module names from IDs
  const dependencyNames = useMemo(() => {
    return module.dependencies
      .map((depId) => {
        const depModule = allModules.find((m) => m.id === depId);
        return depModule?.name || depId;
      })
      .filter(Boolean);
  }, [module.dependencies, allModules]);

  // Handle validation submission
  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    try {
      onValidate(module.id, validationNotes || undefined);
      setShowValidationInput(false);
    } finally {
      setIsValidating(false);
    }
  }, [module.id, validationNotes, onValidate]);

  // Handle quick validation (no notes)
  const handleQuickValidate = useCallback(() => {
    onValidate(module.id);
  }, [module.id, onValidate]);

  return (
    <div
      className={cn(
        'border rounded-lg bg-card/50 transition-colors',
        module.isValidated
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-border hover:border-border/80'
      )}
    >
      {/* Header */}
      <div
        className="px-4 py-3 cursor-pointer flex items-start gap-3"
        onClick={onToggleExpand}
      >
        {/* Validation status indicator */}
        <div className="shrink-0 mt-0.5">
          {module.isValidated ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground/40" />
          )}
        </div>

        {/* Module info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-medium truncate">{module.name}</h4>
            <Badge
              variant="outline"
              className={cn('text-[10px]', COMPLEXITY_COLORS[module.estimatedComplexity])}
            >
              <span className="mr-1">{COMPLEXITY_ICONS[module.estimatedComplexity]}</span>
              {COMPLEXITY_LABELS[module.estimatedComplexity]}
            </Badge>
            {module.isValidated && (
              <Badge
                variant="outline"
                className="text-[10px] bg-green-500/10 text-green-500 border-green-500/20"
              >
                Validated
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {module.description}
          </p>
        </div>

        {/* Expand indicator */}
        <div className="shrink-0">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50">
          {/* Responsibilities */}
          {module.responsibilities.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Responsibilities
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {module.responsibilities.length}
                </Badge>
              </div>
              <ul className="space-y-1 pl-5">
                {module.responsibilities.map((resp, idx) => (
                  <li
                    key={idx}
                    className="text-xs text-muted-foreground list-disc"
                  >
                    {resp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Entities */}
          {module.entities.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Entities
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {module.entities.length}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {module.entities.map((entity, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="text-[10px] bg-purple-500/10 text-purple-500 border-purple-500/20"
                  >
                    {entity}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Dependencies */}
          {dependencyNames.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Dependencies
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {dependencyNames.length}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {dependencyNames.map((depName, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/20"
                  >
                    <Link2 className="h-2.5 w-2.5 mr-1" />
                    {depName}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Validation notes (if exists) */}
          {module.validationNotes && (
            <div className="mb-4 p-2 rounded bg-muted/30 border border-border/50">
              <div className="flex items-center gap-1.5 mb-1">
                <PenLine className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground">
                  Validation Notes
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {module.validationNotes}
              </p>
            </div>
          )}

          {/* Validation actions */}
          {!module.isValidated && (
            <div className="space-y-2">
              {showValidationInput ? (
                <div className="space-y-2">
                  <Textarea
                    value={validationNotes}
                    onChange={(e) => setValidationNotes(e.target.value)}
                    placeholder="Optional notes about this module (suggestions, concerns, etc.)"
                    className="min-h-[60px] text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleValidate}
                      disabled={isValidating}
                    >
                      {isValidating ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      Validate Module
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowValidationInput(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleQuickValidate}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Validate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowValidationInput(true)}
                  >
                    <PenLine className="h-3 w-3 mr-1" />
                    Add Notes
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Empty State
// ============================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Boxes className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h4 className="text-sm font-medium text-muted-foreground mb-1">
        No modules yet
      </h4>
      <p className="text-xs text-muted-foreground/60">
        Complete the architecture interview and generate schemas to decompose
        the system into modules.
      </p>
    </div>
  );
}

// ============================================
// Summary Statistics
// ============================================

interface ModuleSummaryProps {
  modules: ModuleDefinition[];
}

function ModuleSummary({ modules }: ModuleSummaryProps) {
  const stats = useMemo(() => {
    const validated = modules.filter((m) => m.isValidated).length;
    const byComplexity = {
      low: modules.filter((m) => m.estimatedComplexity === 'low').length,
      medium: modules.filter((m) => m.estimatedComplexity === 'medium').length,
      high: modules.filter((m) => m.estimatedComplexity === 'high').length,
    };
    const totalDependencies = modules.reduce(
      (acc, m) => acc + m.dependencies.length,
      0
    );

    return { validated, byComplexity, totalDependencies };
  }, [modules]);

  return (
    <div className="flex flex-wrap gap-3 px-4 py-2 border-b border-border/50 bg-muted/20">
      {/* Validation progress */}
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        <span className="text-xs text-muted-foreground">
          {stats.validated}/{modules.length} validated
        </span>
      </div>

      {/* Complexity breakdown */}
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {stats.byComplexity.high} high, {stats.byComplexity.medium} med,{' '}
          {stats.byComplexity.low} low
        </span>
      </div>

      {/* Dependencies count */}
      <div className="flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {stats.totalDependencies} dependencies
        </span>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

/**
 * ModuleList - Display and validate module decomposition
 *
 * Features:
 * - List of modules with expandable details
 * - Responsibilities, entities, dependencies display
 * - Complexity indicators (low/medium/high)
 * - Human validation with optional notes
 * - Summary statistics
 */
export function ModuleList({ modules, onValidateModule }: ModuleListProps) {
  const { t } = useTranslation(['common']);
  const [expandedModuleIds, setExpandedModuleIds] = useState<Set<string>>(
    new Set()
  );

  // ============================================
  // Handlers
  // ============================================

  /**
   * Toggle module expansion
   */
  const handleToggleExpand = useCallback((moduleId: string) => {
    setExpandedModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  }, []);

  /**
   * Expand all modules
   */
  const handleExpandAll = useCallback(() => {
    setExpandedModuleIds(new Set(modules.map((m) => m.id)));
  }, [modules]);

  /**
   * Collapse all modules
   */
  const handleCollapseAll = useCallback(() => {
    setExpandedModuleIds(new Set());
  }, []);

  /**
   * Validate all pending modules
   */
  const handleValidateAll = useCallback(() => {
    modules
      .filter((m) => !m.isValidated)
      .forEach((m) => onValidateModule(m.id));
  }, [modules, onValidateModule]);

  // ============================================
  // Computed values
  // ============================================

  const pendingCount = useMemo(
    () => modules.filter((m) => !m.isValidated).length,
    [modules]
  );

  const allExpanded = useMemo(
    () =>
      modules.length > 0 && expandedModuleIds.size === modules.length,
    [modules, expandedModuleIds]
  );

  // ============================================
  // Render
  // ============================================

  if (modules.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Module Decomposition</h3>
            <Badge variant="outline" className="text-[10px]">
              0 modules
            </Badge>
          </div>
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Module Decomposition</h3>
            <Badge variant="outline" className="text-[10px]">
              {modules.length} {modules.length === 1 ? 'module' : 'modules'}
            </Badge>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={allExpanded ? handleCollapseAll : handleExpandAll}
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </Button>
            {pendingCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleValidateAll}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Validate All ({pendingCount})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary statistics */}
      <ModuleSummary modules={modules} />

      {/* Module list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {modules.map((module) => (
            <ModuleCard
              key={module.id}
              module={module}
              allModules={modules}
              onValidate={onValidateModule}
              isExpanded={expandedModuleIds.has(module.id)}
              onToggleExpand={() => handleToggleExpand(module.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default ModuleList;
