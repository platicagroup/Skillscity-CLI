import type { Node } from 'web-tree-sitter';
import type { ParseContext } from './BaseParseStrategy.js';
import { BaseParseStrategy, type ParseResult } from './BaseParseStrategy.js';

const CAPTURE_TYPES = {
  'comment': 'comment',
  'definition.function': 'definition.function',
  'definition.class': 'definition.class',
  'definition.docstring': 'docstring',
  'definition.type_alias': 'definition.type_alias',
  'definition.decorator': 'definition.decorator',
} as const;

type CaptureType = (typeof CAPTURE_TYPES)[keyof typeof CAPTURE_TYPES];

export class PythonParseStrategy extends BaseParseStrategy {
  parseCapture(
    capture: { node: Node; name: string },
    lines: string[],
    processedChunks: Set<string>,
    _context: ParseContext,
  ): string | null {
    const types = this.getCaptureTypes(capture.name, CAPTURE_TYPES);

    if (types.has('comment')) return '';
    if (types.has('docstring')) return '';

    if (types.has('definition.class')) {
      return this.parseClassDefinition(lines, capture.node.startPosition.row, processedChunks);
    }

    if (types.has('definition.function')) {
      return this.parseFunctionDefinition(lines, capture.node.startPosition.row, processedChunks);
    }

    if (types.has('definition.type_alias')) {
      const endRow = capture.node.endPosition.row;
      const content = this.extractLines(lines, capture.node.startPosition.row, endRow);
      return content ? content.join('\n') : null;
    }

    return null;
  }

  private getDecorators(lines: string[], startRow: number): string[] {
    const decorators: string[] = [];
    let row = startRow - 1;
    while (row >= 0 && lines[row]?.trimStart().startsWith('@')) {
      decorators.unshift(lines[row]);
      row--;
    }
    return decorators;
  }

  private getFunctionSignature(lines: string[], startRow: number): string | null {
    const sigEnd = this.findColonLine(lines, startRow);
    return sigEnd >= startRow ? lines.slice(startRow, sigEnd + 1).join('\n') : null;
  }

  private getClassInheritance(lines: string[], startRow: number): string | null {
    const sigEnd = this.findColonLine(lines, startRow);
    return sigEnd >= startRow ? lines.slice(startRow, sigEnd + 1).join('\n') : null;
  }

  private findColonLine(lines: string[], startRow: number): number {
    for (let i = startRow; i < lines.length; i++) {
      if (lines[i].includes(':')) return i;
      // Handle multi-line parenthesized signatures
      if (lines[i].includes('(') && lines[i].includes(')') && lines[i].includes(':')) return i;
    }
    return startRow;
  }

  private parseClassDefinition(
    lines: string[],
    startRow: number,
    processedChunks: Set<string>,
  ): string | null {
    const decorators = this.getDecorators(lines, startRow);
    const header = this.getClassInheritance(lines, startRow);
    if (!header) return null;
    return [...decorators, header, '    ⋮----'].join('\n');
  }

  private parseFunctionDefinition(
    lines: string[],
    startRow: number,
    processedChunks: Set<string>,
  ): string | null {
    const decorators = this.getDecorators(lines, startRow);
    const sig = this.getFunctionSignature(lines, startRow);
    if (!sig) return null;
    return [...decorators, sig, '    ⋮----'].join('\n');
  }
}