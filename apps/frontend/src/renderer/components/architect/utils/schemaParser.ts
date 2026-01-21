/**
 * Schema Parser Utility
 * Extracts and parses Mermaid diagram code blocks from AI output text.
 *
 * Supports detection of various Mermaid diagram types and maps them to
 * ArchitectSchema types for the architect feature.
 */

import type { SchemaType, ParsedSchemaResult, ArchitectSchema } from '../types/architect.types';

// ============================================
// Constants
// ============================================

/**
 * Regex pattern to match Mermaid code blocks in markdown
 * Matches: ```mermaid ... ``` with optional language hint variations
 */
const MERMAID_CODE_BLOCK_REGEX = /```(?:mermaid|mmd)\s*\n([\s\S]*?)```/gi;

/**
 * Regex pattern to match any fenced code block (for fallback parsing)
 */
const GENERIC_CODE_BLOCK_REGEX = /```(\w*)\s*\n([\s\S]*?)```/gi;

/**
 * Mermaid diagram type keywords and their mapping to SchemaType
 */
const MERMAID_TYPE_MAP: Record<string, SchemaType> = {
  // Flow diagrams
  'flowchart': 'flow',
  'flowchart tb': 'flow',
  'flowchart td': 'flow',
  'flowchart bt': 'flow',
  'flowchart lr': 'flow',
  'flowchart rl': 'flow',
  'graph': 'flow',
  'graph tb': 'flow',
  'graph td': 'flow',
  'graph bt': 'flow',
  'graph lr': 'flow',
  'graph rl': 'flow',

  // Entity relationship diagrams
  'erdiagram': 'entity',
  'er': 'entity',

  // Class diagrams (typically for entity relationships in architecture)
  'classdiagram': 'entity',
  'class': 'entity',

  // Sequence diagrams
  'sequencediagram': 'sequence',
  'sequence': 'sequence',

  // C4 diagrams (architecture)
  'c4context': 'system',
  'c4container': 'component',
  'c4component': 'component',
  'c4deployment': 'component',
  'c4dynamic': 'flow',

  // State diagrams
  'statediagram': 'flow',
  'statediagram-v2': 'flow',
  'state': 'flow',

  // Mindmap and other
  'mindmap': 'system',
  'journey': 'flow',
  'quadrantchart': 'system',
  'pie': 'system',
  'block-beta': 'component',
  'architecture-beta': 'component',

  // Database-specific
  'entityrelationship': 'database',
};

/**
 * Title extraction patterns
 */
const TITLE_PATTERNS = [
  // Mermaid title directive: title My Title
  /^---[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m,
  // Mermaid title directive inline
  /^\s*title\s+(.+)$/m,
  // Markdown header above code block (captured separately)
  /^#+\s+(.+)$/m,
];

// ============================================
// Helper Functions
// ============================================

/**
 * Detect the Mermaid diagram type from the code
 * @param code - Mermaid diagram code
 * @returns The detected SchemaType, or 'system' as default
 */
export function detectMermaidType(code: string): SchemaType {
  // Normalize the code for matching
  const normalizedCode = code.trim().toLowerCase();

  // Check each known type
  for (const [keyword, schemaType] of Object.entries(MERMAID_TYPE_MAP)) {
    // Match at the beginning of the code
    if (normalizedCode.startsWith(keyword)) {
      return schemaType;
    }
  }

  // Additional pattern matching for diagram types
  if (normalizedCode.includes('erdiagram') || normalizedCode.match(/^\s*er\b/)) {
    return 'entity';
  }
  if (normalizedCode.includes('sequencediagram') || normalizedCode.match(/participant\s+\w/i)) {
    return 'sequence';
  }
  if (normalizedCode.includes('classdiagram') || normalizedCode.match(/class\s+\w+\s*[{[]/)) {
    return 'entity';
  }

  // Default to 'system' for unrecognized types
  return 'system';
}

/**
 * Extract title from Mermaid code or surrounding context
 * @param code - Mermaid diagram code
 * @param context - Optional surrounding text context
 * @returns Extracted title or a generated default
 */
export function extractTitle(code: string, context?: string): string {
  // Try to extract title from the code itself
  for (const pattern of TITLE_PATTERNS) {
    const match = code.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Try to extract from context (markdown header before the code block)
  if (context) {
    const headerMatch = context.match(/#{1,6}\s+([^\n]+)\s*$/);
    if (headerMatch && headerMatch[1]) {
      return headerMatch[1].trim();
    }
  }

  // Generate title based on diagram type
  const diagramType = detectMermaidType(code);
  const typeLabels: Record<SchemaType, string> = {
    system: 'System Overview',
    entity: 'Entity Relationships',
    flow: 'Data Flow',
    component: 'Component Architecture',
    database: 'Database Schema',
    sequence: 'Sequence Diagram',
  };

  return typeLabels[diagramType] || 'Architecture Diagram';
}

/**
 * Extract description from code comments or context
 * @param code - Mermaid diagram code
 * @param context - Optional surrounding text context
 * @returns Extracted description or undefined
 */
function extractDescription(code: string, context?: string): string | undefined {
  // Look for %% comment descriptions in Mermaid
  const commentMatch = code.match(/%%\s*(?:description|desc):\s*(.+)/i);
  if (commentMatch && commentMatch[1]) {
    return commentMatch[1].trim();
  }

  // Look for description in frontmatter
  const frontmatterMatch = code.match(/^---[\s\S]*?description:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m);
  if (frontmatterMatch && frontmatterMatch[1]) {
    return frontmatterMatch[1].trim();
  }

  // Extract from context - look for description paragraph before code block
  if (context) {
    const lines = context.split('\n');
    const lastNonEmptyLine = lines.filter(l => l.trim()).pop();
    if (lastNonEmptyLine && !lastNonEmptyLine.startsWith('#')) {
      return lastNonEmptyLine.trim();
    }
  }

  return undefined;
}

/**
 * Validate Mermaid code has basic structure
 * @param code - Mermaid code to validate
 * @returns True if the code appears to be valid Mermaid
 */
export function isValidMermaidCode(code: string): boolean {
  if (!code || typeof code !== 'string') {
    return false;
  }

  const trimmed = code.trim();
  if (trimmed.length < 5) {
    return false;
  }

  // Check if it starts with a known Mermaid keyword
  const normalizedCode = trimmed.toLowerCase();
  const knownStarts = [
    'flowchart', 'graph', 'sequencediagram', 'classDiagram', 'erdiagram',
    'statediagram', 'gantt', 'pie', 'journey', 'mindmap', 'timeline',
    'gitgraph', 'c4context', 'c4container', 'c4component', 'c4deployment',
    'quadrantchart', 'requirementdiagram', 'block-beta', 'architecture-beta',
    '---', // Frontmatter
  ];

  for (const start of knownStarts) {
    if (normalizedCode.startsWith(start.toLowerCase())) {
      return true;
    }
  }

  // Also accept if it has typical Mermaid syntax elements
  if (normalizedCode.match(/-->/g) || normalizedCode.match(/--->/g)) {
    return true;
  }
  if (normalizedCode.match(/participant\s+/gi)) {
    return true;
  }
  if (normalizedCode.match(/\|[^|]+\|/g)) {
    return true; // ER diagram relationships
  }

  return false;
}

/**
 * Clean and normalize Mermaid code
 * @param code - Raw Mermaid code
 * @returns Cleaned code ready for rendering
 */
export function cleanMermaidCode(code: string): string {
  if (!code) return '';

  return code
    .trim()
    // Remove any leading/trailing quotes
    .replace(/^["']|["']$/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    // Remove excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================
// Main Parsing Functions
// ============================================

/**
 * Extract Mermaid code blocks from AI output text
 * @param text - AI output text containing Mermaid code blocks
 * @returns Array of extracted Mermaid code strings with their context
 */
export function extractMermaidBlocks(text: string): Array<{ code: string; context: string }> {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const results: Array<{ code: string; context: string }> = [];

  // Reset regex state
  MERMAID_CODE_BLOCK_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MERMAID_CODE_BLOCK_REGEX.exec(text)) !== null) {
    const code = match[1];
    // Get context (text before this match)
    const startIndex = Math.max(0, match.index - 200);
    const context = text.substring(startIndex, match.index);

    if (code && code.trim()) {
      results.push({
        code: cleanMermaidCode(code),
        context: context,
      });
    }
  }

  return results;
}

/**
 * Parse AI output text and extract schemas
 * This is the main entry point for schema parsing.
 *
 * @param text - AI output text containing Mermaid diagrams
 * @returns ParsedSchemaResult with extracted schemas and any errors
 */
export function parseSchemas(text: string): ParsedSchemaResult {
  const parseErrors: string[] = [];
  const schemas: Omit<ArchitectSchema, 'id' | 'sessionId' | 'createdAt' | 'updatedAt' | 'version'>[] = [];

  if (!text || typeof text !== 'string') {
    return {
      schemas: [],
      rawText: text || '',
      parseErrors: ['Input text is empty or invalid'],
    };
  }

  // Extract Mermaid blocks
  const blocks = extractMermaidBlocks(text);

  if (blocks.length === 0) {
    // Try fallback: look for generic code blocks that might be Mermaid
    const fallbackBlocks = extractFallbackMermaidBlocks(text);
    blocks.push(...fallbackBlocks);
  }

  // Process each extracted block
  for (let i = 0; i < blocks.length; i++) {
    const { code, context } = blocks[i];

    if (!isValidMermaidCode(code)) {
      parseErrors.push(`Block ${i + 1}: Invalid Mermaid code structure`);
      continue;
    }

    try {
      const type = detectMermaidType(code);
      const title = extractTitle(code, context);
      const description = extractDescription(code, context);

      schemas.push({
        type,
        title,
        mermaidCode: code,
        description,
      });
    } catch (error) {
      parseErrors.push(`Block ${i + 1}: Error parsing - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    schemas,
    rawText: text,
    parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
  };
}

/**
 * Fallback extraction for code blocks not explicitly marked as Mermaid
 * @param text - Input text
 * @returns Array of potential Mermaid blocks
 */
function extractFallbackMermaidBlocks(text: string): Array<{ code: string; context: string }> {
  const results: Array<{ code: string; context: string }> = [];

  // Reset regex state
  GENERIC_CODE_BLOCK_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = GENERIC_CODE_BLOCK_REGEX.exec(text)) !== null) {
    const language = match[1]?.toLowerCase() || '';
    const code = match[2];

    // Skip if already Mermaid (would have been caught by main regex)
    if (language === 'mermaid' || language === 'mmd') {
      continue;
    }

    // Check if the content looks like Mermaid
    if (code && isValidMermaidCode(code)) {
      const startIndex = Math.max(0, match.index - 200);
      const context = text.substring(startIndex, match.index);

      results.push({
        code: cleanMermaidCode(code),
        context: context,
      });
    }
  }

  return results;
}

/**
 * Parse a single Mermaid code string into a schema object
 * Useful when you already have extracted Mermaid code
 *
 * @param mermaidCode - Mermaid diagram code
 * @param options - Optional title and description overrides
 * @returns Partial ArchitectSchema or null if invalid
 */
export function parseSingleSchema(
  mermaidCode: string,
  options?: { title?: string; description?: string }
): Omit<ArchitectSchema, 'id' | 'sessionId' | 'createdAt' | 'updatedAt' | 'version'> | null {
  const cleaned = cleanMermaidCode(mermaidCode);

  if (!isValidMermaidCode(cleaned)) {
    return null;
  }

  return {
    type: detectMermaidType(cleaned),
    title: options?.title || extractTitle(cleaned),
    mermaidCode: cleaned,
    description: options?.description || extractDescription(cleaned),
  };
}

/**
 * Count the number of Mermaid diagrams in text without fully parsing them
 * Useful for progress indicators
 *
 * @param text - Text to scan
 * @returns Number of Mermaid code blocks found
 */
export function countMermaidDiagrams(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // Reset regex state
  MERMAID_CODE_BLOCK_REGEX.lastIndex = 0;

  let count = 0;
  while (MERMAID_CODE_BLOCK_REGEX.exec(text) !== null) {
    count++;
  }

  return count;
}

/**
 * Get a human-readable label for a SchemaType
 * @param type - Schema type
 * @returns Human-readable label
 */
export function getSchemaTypeLabel(type: SchemaType): string {
  const labels: Record<SchemaType, string> = {
    system: 'System Overview',
    entity: 'Entity Relationships',
    flow: 'Data Flow',
    component: 'Component Architecture',
    database: 'Database Schema',
    sequence: 'Sequence Diagram',
  };

  return labels[type] || 'Diagram';
}

/**
 * Get suggested Mermaid diagram types for architecture documentation
 * @returns Array of suggested diagram configurations
 */
export function getSuggestedDiagramTypes(): Array<{ type: SchemaType; mermaidStart: string; description: string }> {
  return [
    {
      type: 'system',
      mermaidStart: 'C4Context',
      description: 'High-level system context showing external actors and systems',
    },
    {
      type: 'component',
      mermaidStart: 'C4Container',
      description: 'Container diagram showing major technology choices',
    },
    {
      type: 'entity',
      mermaidStart: 'erDiagram',
      description: 'Entity relationships showing data model',
    },
    {
      type: 'flow',
      mermaidStart: 'flowchart TD',
      description: 'Data flow diagram showing how data moves through the system',
    },
    {
      type: 'sequence',
      mermaidStart: 'sequenceDiagram',
      description: 'Sequence diagram showing interactions between components',
    },
    {
      type: 'database',
      mermaidStart: 'erDiagram',
      description: 'Database schema showing tables and relationships',
    },
  ];
}
