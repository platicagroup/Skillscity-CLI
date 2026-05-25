import type { Node } from 'web-tree-sitter';
import type { ParseContext } from './BaseParseStrategy.js';
import { BaseParseStrategy, type ParseResult } from './BaseParseStrategy.js';

const CAPTURE_TYPES = {
  'comment': 'comment',
} as const;

type CaptureType = (typeof CAPTURE_TYPES)[keyof typeof CAPTURE_TYPES];

export class DefaultParseStrategy extends BaseParseStrategy {
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

    // Para otros nodos, preservar completamente por defecto
    const content = this.extractNodeContent(capture.node, lines);
    if (!content) return null;

    if (this.checkAndAddToProcessed(content, processedChunks)) {
      return null;
    }
    return content;
  }

  private extractNodeContent(node: Node, lines: string[]): string | null {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    const content = this.extractLines(lines, startRow, endRow);
    return content ? content.join('\n') : null;
  }
}