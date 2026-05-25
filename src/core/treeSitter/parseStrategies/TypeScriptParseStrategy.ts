import type { Node } from 'web-tree-sitter';
import type { ParseContext } from './BaseParseStrategy.js';
import { BaseParseStrategy, type ParseResult } from './BaseParseStrategy.js';

const CAPTURE_TYPES = {
  'comment': 'comment',
  'definition.function': 'definition.function',
  'definition.method': 'definition.method',
  'definition.class': 'definition.class',
  'definition.interface': 'definition.interface',
  'definition.type': 'definition.type',
  'definition.enum': 'definition.enum',
  'definition.import': 'definition.import',
  'definition.property': 'definition.property',
} as const;

type CaptureType = (typeof CAPTURE_TYPES)[keyof typeof CAPTURE_TYPES];

export class TypeScriptParseStrategy extends BaseParseStrategy {
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

    // 2. Preservar imports completos
    if (types.has('definition.import')) {
      const content = this.extractNodeContent(capture.node, lines);
      if (content) return content;
      return null;
    }

    // 3. Interfaces, types, enums: preservar completamente
    if (types.has('definition.interface') || types.has('definition.type') || types.has('definition.enum')) {
      return this.parseTypeOrImport(capture.node, lines, processedChunks);
    }

    // 4. Clases: preservar declaración, procesar métodos recursivamente
    if (types.has('definition.class')) {
      return this.parseClassDefinition(capture.node, lines, processedChunks);
    }

    // 5. Funciones: preservar firma, eliminar cuerpo
    if (types.has('definition.function') || types.has('definition.method')) {
      return this.parseFunctionDefinition(capture.node, lines, processedChunks);
    }

    return null;
  }

  private parseFunctionDefinition(
    node: Node,
    lines: string[],
    processedChunks: Set<string>,
  ): string | null {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;

    // Extraer comentario JSDoc que precede a la función
    const commentLines: string[] = [];
    let commentRow = startRow - 1;
    while (commentRow >= 0) {
      const trimmed = lines[commentRow]?.trim();
      if (trimmed?.startsWith('*') || trimmed?.startsWith('/**')) {
        commentLines.unshift(lines[commentRow]);
        commentRow--;
      } else if (trimmed === '' || trimmed?.startsWith('//')) {
        commentRow--;
      } else {
        break;
      }
    }

    // Extraer decoradores que preceden a la función
    const decoratorLines: string[] = [];
    let decoratorRow = commentLines.length > 0
      ? startRow - commentLines.length - 1
      : startRow - 1;
    while (decoratorRow >= 0 && lines[decoratorRow]?.trim().startsWith('@')) {
      decoratorLines.unshift(lines[decoratorRow]);
      decoratorRow--;
    }

    // Encontrar el final de la firma (cierre de paréntesis de parámetros)
    const sigEnd = this.findSignatureEnd(lines, startRow, endRow);

    // Extraer la firma
    const sigLines = lines.slice(startRow, sigEnd + 1);
    const cleanSig = this.cleanFunctionSignature(sigLines);

    // Construir resultado: decoradores + comentario + firma + ⋮----
    const resultLines = [
      ...decoratorLines,
      ...commentLines,
      ...cleanSig.split('\n'),
      `  ⋮----`,
    ];

    const result = resultLines.join('\n');
    return result;
  }

  private parseClassDefinition(
    node: Node,
    lines: string[],
    processedChunks: Set<string>,
  ): string | null {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;

    // Preservar la línea de declaración de la clase
    const classHeader = lines[startRow];
    const resultLines = [classHeader, '{'];
    const processed = new Set<string>();

    // Recorrer hijos para procesar métodos
    let child = node.firstChild;
    const bodyStart = child ? child.endPosition.row + 1 : startRow + 1;

    for (let row = bodyStart; row < endRow; row++) {
      const line = lines[row];
      const trimmed = line.trim();

      // Buscar method_definition nodes en los hijos
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.type === 'method_definition' && c.startPosition.row === row) {
          const methodResult = this.parseFunctionDefinition(c, lines, processed);
          if (methodResult) {
            resultLines.push(methodResult);
            row = c.endPosition.row;
          }
          break;
        }
      }

      // Preservar propiedades (líneas que no son métodos ni bodies)
      if (row < endRow && !trimmed.startsWith('}') && trimmed.length > 0) {
        // Verificar que no estamos dentro del cuerpo de un método
        let insideMethod = false;
        for (let c = node.firstChild; c; c = c.nextSibling) {
          if (c.type === 'method_definition' && row > c.startPosition.row && row <= c.endPosition.row) {
            insideMethod = true;
            break;
          }
        }
        if (!insideMethod) {
          resultLines.push(line);
        }
      }
    }

    resultLines.push('}');
    return resultLines.join('\n');
  }

  private parseTypeOrImport(
    node: Node,
    lines: string[],
    processedChunks: Set<string>,
  ): string | null {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    const content = this.extractLines(lines, startRow, endRow);
    if (!content) return null;

    const result = content.join('\n');
    if (this.checkAndAddToProcessed(result, processedChunks)) {
      return null;
    }
    return result;
  }

  private findSignatureEnd(lines: string[], startRow: number, endRow: number): number {
    let parenDepth = 0;
    let inParen = false;
    let inString: string | null = null;

    for (let i = startRow; i <= endRow; i++) {
      const line = lines[i];
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        const prev = j > 0 ? line[j - 1] : '';

        if (inString) {
          if (ch === inString && prev !== '\\') inString = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
        if (ch === '(') { parenDepth++; inParen = true; }
        else if (ch === ')') {
          parenDepth--;
          if (parenDepth === 0 && inParen) return i;
        }
      }
      if (inParen && parenDepth === 0) return i;
    }
    return endRow;
  }

  private cleanFunctionSignature(sigLines: string[]): string {
    return sigLines.map((l, i) => {
      if (i === 0) return l.trimStart();
      return l;
    }).join('\n');
  }

  private extractNodeContent(node: Node, lines: string[]): string | null {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    const content = this.extractLines(lines, startRow, endRow);
    return content ? content.join('\n') : null;
  }
}