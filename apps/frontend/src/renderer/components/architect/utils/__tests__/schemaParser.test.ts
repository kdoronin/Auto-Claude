/**
 * Unit tests for Schema Parser Utility
 * Tests extraction and parsing of Mermaid diagrams from AI output
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectMermaidType,
  extractTitle,
  isValidMermaidCode,
  cleanMermaidCode,
  extractMermaidBlocks,
  parseSchemas,
  parseSingleSchema,
  countMermaidDiagrams,
  getSchemaTypeLabel,
  getSuggestedDiagramTypes,
} from '../schemaParser';
import type { SchemaType } from '../../types/architect.types';

describe('schemaParser', () => {
  describe('detectMermaidType', () => {
    describe('flowchart detection', () => {
      it('should detect flowchart TD', () => {
        expect(detectMermaidType('flowchart TD\n  A --> B')).toBe('flow');
      });

      it('should detect flowchart LR', () => {
        expect(detectMermaidType('flowchart LR\n  A --> B')).toBe('flow');
      });

      it('should detect flowchart TB', () => {
        expect(detectMermaidType('flowchart TB\n  A --> B')).toBe('flow');
      });

      it('should detect flowchart BT', () => {
        expect(detectMermaidType('flowchart BT\n  A --> B')).toBe('flow');
      });

      it('should detect flowchart RL', () => {
        expect(detectMermaidType('flowchart RL\n  A --> B')).toBe('flow');
      });

      it('should detect graph TD as flow', () => {
        expect(detectMermaidType('graph TD\n  A --> B')).toBe('flow');
      });

      it('should detect graph LR as flow', () => {
        expect(detectMermaidType('graph LR\n  A --> B')).toBe('flow');
      });
    });

    describe('entity relationship detection', () => {
      it('should detect erDiagram', () => {
        expect(detectMermaidType('erDiagram\n  USER ||--o{ ORDER : places')).toBe('entity');
      });

      it('should detect ER with just er prefix', () => {
        expect(detectMermaidType('erDiagram\n  CUSTOMER')).toBe('entity');
      });

      it('should detect classDiagram as entity', () => {
        expect(detectMermaidType('classDiagram\n  class Animal')).toBe('entity');
      });

      it('should detect class keyword with body', () => {
        const code = 'class User {\n  +name: string\n}';
        expect(detectMermaidType(code)).toBe('entity');
      });
    });

    describe('sequence diagram detection', () => {
      it('should detect sequenceDiagram', () => {
        expect(detectMermaidType('sequenceDiagram\n  Alice->>Bob: Hello')).toBe('sequence');
      });

      it('should detect diagram with participant keyword', () => {
        const code = 'participant Alice\nparticipant Bob';
        expect(detectMermaidType(code)).toBe('sequence');
      });
    });

    describe('C4 diagram detection', () => {
      it('should detect C4Context as system', () => {
        expect(detectMermaidType('C4Context\n  Person(user, "User")')).toBe('system');
      });

      it('should detect C4Container as component', () => {
        expect(detectMermaidType('C4Container\n  Container(app, "App")')).toBe('component');
      });

      it('should detect C4Component as component', () => {
        expect(detectMermaidType('C4Component\n  Component(comp, "Comp")')).toBe('component');
      });

      it('should detect C4Deployment as component', () => {
        expect(detectMermaidType('C4Deployment\n  Node(node, "Node")')).toBe('component');
      });

      it('should detect C4Dynamic as flow', () => {
        expect(detectMermaidType('C4Dynamic\n  RelIndex(1, a, b)')).toBe('flow');
      });
    });

    describe('state diagram detection', () => {
      it('should detect stateDiagram', () => {
        expect(detectMermaidType('stateDiagram\n  [*] --> Active')).toBe('flow');
      });

      it('should detect stateDiagram-v2', () => {
        expect(detectMermaidType('stateDiagram-v2\n  [*] --> Active')).toBe('flow');
      });
    });

    describe('other diagram types', () => {
      it('should detect mindmap as system', () => {
        expect(detectMermaidType('mindmap\n  root((Main))')).toBe('system');
      });

      it('should detect journey as flow', () => {
        expect(detectMermaidType('journey\n  title My Journey')).toBe('flow');
      });

      it('should detect pie as system', () => {
        expect(detectMermaidType('pie\n  title Pie Chart')).toBe('system');
      });

      it('should detect quadrantChart as system', () => {
        expect(detectMermaidType('quadrantChart\n  title Chart')).toBe('system');
      });

      it('should detect block-beta as component', () => {
        expect(detectMermaidType('block-beta\n  columns 3')).toBe('component');
      });
    });

    describe('default behavior', () => {
      it('should default to system for unknown types', () => {
        expect(detectMermaidType('unknown diagram type')).toBe('system');
      });

      it('should handle empty string', () => {
        expect(detectMermaidType('')).toBe('system');
      });

      it('should handle whitespace-only string', () => {
        expect(detectMermaidType('   \n  ')).toBe('system');
      });

      it('should be case-insensitive', () => {
        expect(detectMermaidType('FLOWCHART TD\n  A --> B')).toBe('flow');
        expect(detectMermaidType('ERDIAGRAM\n  A')).toBe('entity');
        expect(detectMermaidType('SequenceDiagram\n  A->>B: Hi')).toBe('sequence');
      });
    });
  });

  describe('extractTitle', () => {
    describe('from code title directive', () => {
      it('should extract title from mermaid title directive', () => {
        const code = 'title My Diagram\nflowchart TD\n  A --> B';
        expect(extractTitle(code)).toBe('My Diagram');
      });

      it('should extract title from frontmatter', () => {
        const code = '---\ntitle: "System Architecture"\n---\nflowchart TD\n  A --> B';
        expect(extractTitle(code)).toBe('System Architecture');
      });

      it('should handle single quotes in frontmatter', () => {
        const code = "---\ntitle: 'Data Flow'\n---\nflowchart TD\n  A --> B";
        expect(extractTitle(code)).toBe('Data Flow');
      });

      it('should handle no quotes in frontmatter', () => {
        const code = '---\ntitle: Component Diagram\n---\nflowchart TD\n  A --> B';
        expect(extractTitle(code)).toBe('Component Diagram');
      });
    });

    describe('from context', () => {
      it('should extract title from markdown header in context', () => {
        const code = 'flowchart TD\n  A --> B';
        const context = '## System Overview\n';
        expect(extractTitle(code, context)).toBe('System Overview');
      });

      it('should extract title from h1 header', () => {
        const code = 'flowchart TD\n  A --> B';
        const context = '# Main Architecture\n';
        expect(extractTitle(code, context)).toBe('Main Architecture');
      });

      it('should extract title from h3 header', () => {
        const code = 'flowchart TD\n  A --> B';
        const context = '### Component Details\n';
        expect(extractTitle(code, context)).toBe('Component Details');
      });
    });

    describe('generated titles', () => {
      it('should generate title based on flowchart type', () => {
        const code = 'flowchart TD\n  A --> B';
        expect(extractTitle(code)).toBe('Data Flow');
      });

      it('should generate title based on erDiagram type', () => {
        const code = 'erDiagram\n  USER ||--o{ ORDER : places';
        expect(extractTitle(code)).toBe('Entity Relationships');
      });

      it('should generate title based on sequenceDiagram type', () => {
        const code = 'sequenceDiagram\n  Alice->>Bob: Hello';
        expect(extractTitle(code)).toBe('Sequence Diagram');
      });

      it('should generate title based on C4Context type', () => {
        const code = 'C4Context\n  Person(user)';
        expect(extractTitle(code)).toBe('System Overview');
      });

      it('should generate title for component type', () => {
        const code = 'C4Container\n  Container(app)';
        expect(extractTitle(code)).toBe('Component Architecture');
      });
    });
  });

  describe('isValidMermaidCode', () => {
    describe('valid code detection', () => {
      it('should accept flowchart', () => {
        expect(isValidMermaidCode('flowchart TD\n  A --> B')).toBe(true);
      });

      it('should accept graph', () => {
        expect(isValidMermaidCode('graph LR\n  A --> B')).toBe(true);
      });

      it('should accept sequenceDiagram', () => {
        expect(isValidMermaidCode('sequenceDiagram\n  Alice->>Bob: Hello')).toBe(true);
      });

      it('should accept classDiagram', () => {
        expect(isValidMermaidCode('classDiagram\n  class Animal')).toBe(true);
      });

      it('should accept erDiagram', () => {
        expect(isValidMermaidCode('erDiagram\n  USER ||--o{ ORDER : places')).toBe(true);
      });

      it('should accept stateDiagram', () => {
        expect(isValidMermaidCode('stateDiagram\n  [*] --> Active')).toBe(true);
      });

      it('should accept gantt', () => {
        expect(isValidMermaidCode('gantt\n  title A Gantt Diagram')).toBe(true);
      });

      it('should accept pie', () => {
        expect(isValidMermaidCode('pie\n  title Pets')).toBe(true);
      });

      it('should accept journey', () => {
        expect(isValidMermaidCode('journey\n  title User Journey')).toBe(true);
      });

      it('should accept mindmap', () => {
        expect(isValidMermaidCode('mindmap\n  root((Main))')).toBe(true);
      });

      it('should accept timeline', () => {
        expect(isValidMermaidCode('timeline\n  title History')).toBe(true);
      });

      it('should accept gitgraph', () => {
        expect(isValidMermaidCode('gitgraph\n  commit')).toBe(true);
      });

      it('should accept C4 diagrams', () => {
        expect(isValidMermaidCode('C4Context\n  Person(user)')).toBe(true);
        expect(isValidMermaidCode('C4Container\n  Container(app)')).toBe(true);
        expect(isValidMermaidCode('C4Component\n  Component(comp)')).toBe(true);
        expect(isValidMermaidCode('C4Deployment\n  Node(node)')).toBe(true);
      });

      it('should accept frontmatter style', () => {
        expect(isValidMermaidCode('---\ntitle: Test\n---\nflowchart TD')).toBe(true);
      });

      it('should accept code with arrow syntax', () => {
        expect(isValidMermaidCode('A --> B\nB --> C')).toBe(true);
      });

      it('should accept code with long arrow syntax', () => {
        expect(isValidMermaidCode('A ---> B')).toBe(true);
      });

      it('should accept ER diagram relationship syntax', () => {
        expect(isValidMermaidCode('USER |o--|{ ORDER')).toBe(true);
      });
    });

    describe('invalid code detection', () => {
      it('should reject null', () => {
        expect(isValidMermaidCode(null as unknown as string)).toBe(false);
      });

      it('should reject undefined', () => {
        expect(isValidMermaidCode(undefined as unknown as string)).toBe(false);
      });

      it('should reject empty string', () => {
        expect(isValidMermaidCode('')).toBe(false);
      });

      it('should reject very short strings', () => {
        expect(isValidMermaidCode('abc')).toBe(false);
      });

      it('should reject plain text', () => {
        expect(isValidMermaidCode('This is just plain text without any diagram syntax')).toBe(false);
      });

      it('should reject non-string types', () => {
        expect(isValidMermaidCode(123 as unknown as string)).toBe(false);
        expect(isValidMermaidCode({} as unknown as string)).toBe(false);
        expect(isValidMermaidCode([] as unknown as string)).toBe(false);
      });
    });
  });

  describe('cleanMermaidCode', () => {
    it('should trim whitespace', () => {
      expect(cleanMermaidCode('  flowchart TD  ')).toBe('flowchart TD');
    });

    it('should remove surrounding quotes', () => {
      expect(cleanMermaidCode('"flowchart TD"')).toBe('flowchart TD');
      expect(cleanMermaidCode("'flowchart TD'")).toBe('flowchart TD');
    });

    it('should normalize line endings', () => {
      expect(cleanMermaidCode('flowchart TD\r\n  A --> B')).toBe('flowchart TD\n  A --> B');
    });

    it('should reduce excessive blank lines', () => {
      expect(cleanMermaidCode('flowchart TD\n\n\n\n  A --> B')).toBe('flowchart TD\n\n  A --> B');
    });

    it('should handle empty input', () => {
      expect(cleanMermaidCode('')).toBe('');
    });

    it('should handle null-ish input', () => {
      expect(cleanMermaidCode(null as unknown as string)).toBe('');
      expect(cleanMermaidCode(undefined as unknown as string)).toBe('');
    });
  });

  describe('extractMermaidBlocks', () => {
    it('should extract single mermaid block', () => {
      const text = 'Some text\n```mermaid\nflowchart TD\n  A --> B\n```\nMore text';
      const blocks = extractMermaidBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].code).toBe('flowchart TD\n  A --> B');
    });

    it('should extract multiple mermaid blocks', () => {
      const text = `Here's diagram 1:
\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

And diagram 2:
\`\`\`mermaid
erDiagram
  USER ||--o{ ORDER : places
\`\`\``;

      const blocks = extractMermaidBlocks(text);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].code).toContain('flowchart TD');
      expect(blocks[1].code).toContain('erDiagram');
    });

    it('should extract mmd format blocks', () => {
      const text = '```mmd\nflowchart TD\n  A --> B\n```';
      const blocks = extractMermaidBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].code).toBe('flowchart TD\n  A --> B');
    });

    it('should provide context before each block', () => {
      const text = '## System Architecture\n```mermaid\nflowchart TD\n  A --> B\n```';
      const blocks = extractMermaidBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].context).toContain('System Architecture');
    });

    it('should handle empty input', () => {
      expect(extractMermaidBlocks('')).toEqual([]);
    });

    it('should handle text with no mermaid blocks', () => {
      expect(extractMermaidBlocks('Just plain text with no diagrams')).toEqual([]);
    });

    it('should handle null input', () => {
      expect(extractMermaidBlocks(null as unknown as string)).toEqual([]);
    });

    it('should skip empty code blocks', () => {
      const text = '```mermaid\n\n```\nSome text';
      const blocks = extractMermaidBlocks(text);

      expect(blocks).toHaveLength(0);
    });
  });

  describe('parseSchemas', () => {
    it('should parse a single valid schema', () => {
      const text = '```mermaid\nflowchart TD\n  A --> B\n```';
      const result = parseSchemas(text);

      expect(result.schemas).toHaveLength(1);
      expect(result.schemas[0].type).toBe('flow');
      expect(result.schemas[0].mermaidCode).toBe('flowchart TD\n  A --> B');
      expect(result.parseErrors).toBeUndefined();
    });

    it('should parse multiple schemas', () => {
      const text = `
# System Overview
\`\`\`mermaid
C4Context
  Person(user, "User")
\`\`\`

# Data Model
\`\`\`mermaid
erDiagram
  USER ||--o{ ORDER : places
\`\`\`
      `;
      const result = parseSchemas(text);

      expect(result.schemas).toHaveLength(2);
      expect(result.schemas[0].type).toBe('system');
      expect(result.schemas[1].type).toBe('entity');
    });

    it('should extract titles and descriptions', () => {
      const text = `
## Authentication Flow
This diagram shows the auth process.
\`\`\`mermaid
sequenceDiagram
  User->>Server: Login
\`\`\`
      `;
      const result = parseSchemas(text);

      expect(result.schemas).toHaveLength(1);
      expect(result.schemas[0].title).toBe('Authentication Flow');
    });

    it('should return raw text', () => {
      const text = '```mermaid\nflowchart TD\n  A --> B\n```';
      const result = parseSchemas(text);

      expect(result.rawText).toBe(text);
    });

    it('should handle invalid blocks with errors', () => {
      const text = `
\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`mermaid
not valid mermaid code
\`\`\`
      `;
      const result = parseSchemas(text);

      // Should have one valid schema and one error
      expect(result.schemas.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty input', () => {
      const result = parseSchemas('');

      expect(result.schemas).toHaveLength(0);
      expect(result.rawText).toBe('');
      expect(result.parseErrors).toContain('Input text is empty or invalid');
    });

    it('should handle null input', () => {
      const result = parseSchemas(null as unknown as string);

      expect(result.schemas).toHaveLength(0);
      expect(result.parseErrors).toContain('Input text is empty or invalid');
    });

    it('should fallback to generic code blocks that look like mermaid', () => {
      const text = '```\nflowchart TD\n  A --> B\n```';
      const result = parseSchemas(text);

      // Should detect the unlabeled block as valid mermaid
      expect(result.schemas.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle text with no diagrams', () => {
      const text = 'Just plain text without any code blocks';
      const result = parseSchemas(text);

      expect(result.schemas).toHaveLength(0);
    });
  });

  describe('parseSingleSchema', () => {
    it('should parse valid mermaid code', () => {
      const result = parseSingleSchema('flowchart TD\n  A --> B');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('flow');
      expect(result?.mermaidCode).toBe('flowchart TD\n  A --> B');
    });

    it('should use provided title', () => {
      const result = parseSingleSchema('flowchart TD\n  A --> B', { title: 'My Custom Title' });

      expect(result?.title).toBe('My Custom Title');
    });

    it('should use provided description', () => {
      const result = parseSingleSchema('flowchart TD\n  A --> B', {
        description: 'Custom description',
      });

      expect(result?.description).toBe('Custom description');
    });

    it('should return null for invalid code', () => {
      const result = parseSingleSchema('not valid mermaid');

      expect(result).toBeNull();
    });

    it('should clean the code', () => {
      const result = parseSingleSchema('  flowchart TD\n  A --> B  ');

      expect(result?.mermaidCode).toBe('flowchart TD\n  A --> B');
    });
  });

  describe('countMermaidDiagrams', () => {
    it('should count single diagram', () => {
      const text = '```mermaid\nflowchart TD\n  A --> B\n```';
      expect(countMermaidDiagrams(text)).toBe(1);
    });

    it('should count multiple diagrams', () => {
      const text = `
\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

\`\`\`mermaid
erDiagram
  A
\`\`\`

\`\`\`mermaid
sequenceDiagram
  A->>B: Hello
\`\`\`
      `;
      expect(countMermaidDiagrams(text)).toBe(3);
    });

    it('should return 0 for empty text', () => {
      expect(countMermaidDiagrams('')).toBe(0);
    });

    it('should return 0 for text without diagrams', () => {
      expect(countMermaidDiagrams('Just plain text')).toBe(0);
    });

    it('should return 0 for null input', () => {
      expect(countMermaidDiagrams(null as unknown as string)).toBe(0);
    });
  });

  describe('getSchemaTypeLabel', () => {
    it('should return correct label for system', () => {
      expect(getSchemaTypeLabel('system')).toBe('System Overview');
    });

    it('should return correct label for entity', () => {
      expect(getSchemaTypeLabel('entity')).toBe('Entity Relationships');
    });

    it('should return correct label for flow', () => {
      expect(getSchemaTypeLabel('flow')).toBe('Data Flow');
    });

    it('should return correct label for component', () => {
      expect(getSchemaTypeLabel('component')).toBe('Component Architecture');
    });

    it('should return correct label for database', () => {
      expect(getSchemaTypeLabel('database')).toBe('Database Schema');
    });

    it('should return correct label for sequence', () => {
      expect(getSchemaTypeLabel('sequence')).toBe('Sequence Diagram');
    });

    it('should return fallback for unknown type', () => {
      expect(getSchemaTypeLabel('unknown' as SchemaType)).toBe('Diagram');
    });
  });

  describe('getSuggestedDiagramTypes', () => {
    it('should return array of suggested types', () => {
      const suggestions = getSuggestedDiagramTypes();

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should include required schema types', () => {
      const suggestions = getSuggestedDiagramTypes();
      const types = suggestions.map((s) => s.type);

      expect(types).toContain('system');
      expect(types).toContain('component');
      expect(types).toContain('entity');
      expect(types).toContain('flow');
      expect(types).toContain('sequence');
    });

    it('should have mermaid start code for each suggestion', () => {
      const suggestions = getSuggestedDiagramTypes();

      suggestions.forEach((suggestion) => {
        expect(suggestion.mermaidStart).toBeTruthy();
        expect(typeof suggestion.mermaidStart).toBe('string');
      });
    });

    it('should have description for each suggestion', () => {
      const suggestions = getSuggestedDiagramTypes();

      suggestions.forEach((suggestion) => {
        expect(suggestion.description).toBeTruthy();
        expect(typeof suggestion.description).toBe('string');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle nested code blocks', () => {
      const text = `
Here's an example:
\`\`\`mermaid
flowchart TD
  A["Code: \`test\`"] --> B
\`\`\`
      `;
      const blocks = extractMermaidBlocks(text);
      expect(blocks).toHaveLength(1);
    });

    it('should handle unicode characters in diagrams', () => {
      const text = '```mermaid\nflowchart TD\n  A["用户"] --> B["订单"]\n```';
      const result = parseSchemas(text);

      expect(result.schemas).toHaveLength(1);
      expect(result.schemas[0].mermaidCode).toContain('用户');
    });

    it('should handle diagrams with HTML entities', () => {
      const text = '```mermaid\nflowchart TD\n  A["&lt;entity&gt;"] --> B\n```';
      const result = parseSchemas(text);

      expect(result.schemas).toHaveLength(1);
    });

    it('should handle very long diagram definitions', () => {
      const nodes = Array.from({ length: 100 }, (_, i) => `  N${i} --> N${i + 1}`).join('\n');
      const text = `\`\`\`mermaid\nflowchart TD\n${nodes}\n\`\`\``;
      const result = parseSchemas(text);

      expect(result.schemas).toHaveLength(1);
    });

    it('should handle consecutive code blocks without separator', () => {
      const text = '```mermaid\nflowchart TD\n  A --> B\n```\n```mermaid\nerDiagram\n  C\n```';
      const result = parseSchemas(text);

      expect(result.schemas).toHaveLength(2);
    });
  });
});
