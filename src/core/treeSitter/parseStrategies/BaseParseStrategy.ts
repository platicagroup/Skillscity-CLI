import type { Node, Query, Tree } from 'web-tree-sitter';

export interface ParseContext {
  fileContent: string;
  lines: string[];
  tree: Tree;
  query: Query;
}

export interface ParseStrategy {
  parseCapture(
    capture: { node: Node; name: string },
    lines: string[],
    processedChunks: Set<string>,
    context: ParseContext,
  ): string | null;
}

export type ParseResult = {
  content: string | null;
  processedSignatures?: Set<string>;
};

export abstract class BaseParseStrategy implements ParseStrategy {
  abstract parseCapture(
    capture: { node: Node; name: string },
    lines: string[],
    processedChunks: Set<string>,
    context: ParseContext,
  ): string | null;

  protected getCaptureTypes<T extends Record<string, string>>(
    name: string,
    captureTypes: T,
  ): Set<T[keyof T]> {
    const types = new Set<T[keyof T]>();
    for (const [key, value] of Object.entries(captureTypes)) {
      if (name === value) {
        types.add(value as T[keyof T]);
      }
    }
    return types;
  }

  protected checkAndAddToProcessed(content: string, processedChunks: Set<string>): boolean {
    if (processedChunks.has(content)) return true;
    processedChunks.add(content);
    return false;
  }

  protected validateLineExists(lines: string[], startRow: number): boolean {
    return startRow >= 0 && startRow < lines.length;
  }

  protected extractLines(lines: string[], startRow: number, endRow: number): string[] | null {
    if (startRow < 0 || endRow > lines.length || startRow > endRow) return null;
    return lines.slice(startRow, endRow + 1);
  }

  protected createNullResult(): ParseResult {
    return { content: null };
  }

  protected createResult(content: string, processedSignatures?: Set<string>): ParseResult {
    return { content, processedSignatures };
  }
}