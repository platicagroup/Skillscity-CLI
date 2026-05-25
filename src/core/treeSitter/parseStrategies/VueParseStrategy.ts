import type { Node } from 'web-tree-sitter';
import type { ParseContext } from './BaseParseStrategy.js';
import { BaseParseStrategy, type ParseResult } from './BaseParseStrategy.js';

const CAPTURE_TYPES = {
  'comment': 'comment',
  'definition.script': 'definition.script',
  'definition.style': 'definition.style',
  'definition.template': 'definition.template',
} as const;

type CaptureType = (typeof CAPTURE_TYPES)[keyof typeof CAPTURE_TYPES];

export class VueParseStrategy extends BaseParseStrategy {
  parseCapture(
    capture: { node: Node; name: string },
    lines: string[],
    processedChunks: Set<string>,
    context: ParseContext,
  ): string | null {
    const types = this.getCaptureTypes(capture.name, CAPTURE_TYPES);

    // 1. Eliminar comments
    if (types.has('comment')) {
      return '';
    }

    // 2. Preservar bloques <script> completos
    if (types.has('definition.script')) {
      const content = this.extractNodeContent(capture.node, lines);
      if (content) return content;
      return null;
    }

    // 3. Preservar bloques <style> completos
    if (types.has('definition.style')) {
      const content = this.extractNodeContent(capture.node, lines);
      if (content) return content;
      return null;
    }

    // 4. Preservar bloques <template> completos
    if (types.has('definition.template')) {
      const content = this.extractNodeContent(capture.node, lines);
      if (content) return content;
      return null;
    }

    return null;
  }

  private extractNodeContent(node: Node, lines: string[]): string | null {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    const content = this.extractLines(lines, startRow, endRow);
    return content ? content.join('\n') : null;
  }
}