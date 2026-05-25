import type { Node } from 'web-tree-sitter';
import type { ParseContext } from './BaseParseStrategy.js';
import { BaseParseStrategy, type ParseResult } from './BaseParseStrategy.js';

const CAPTURE_TYPES = {
  'comment': 'comment',
  'definition.rule': 'definition.rule',
  'definition.at_rule': 'definition.at_rule',
} as const;

type CaptureType = (typeof CAPTURE_TYPES)[keyof typeof CAPTURE_TYPES];

export class CssParseStrategy extends BaseParseStrategy {
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

    // 2. Preservar reglas CSS completas
    if (types.has('definition.rule') || types.has('definition.at_rule')) {
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