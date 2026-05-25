import type { SupportedLang } from './languageConfig.js';
import { LanguageParser } from './languageParser.js';
import type { ParseContext } from './parseStrategies/BaseParseStrategy.js';

interface CapturedChunk {
  content: string;
  startRow: number;
  endRow: number;
}

let languageParserSingleton: LanguageParser | null = null;

export const CHUNK_SEPARATOR = '⋮----';

export const parseFile = async (
  fileContent: string,
  filePath: string,
  config?: any,
): Promise<string | undefined> => {
  const languageParser = await getLanguageParserSingleton();

  // Split the file content into individual lines
  const lines = fileContent.split('\n');
  if (lines.length < 1) {
    return '';
  }

  const lang: SupportedLang | undefined = languageParser.guessTheLang(filePath);
  if (lang === undefined) {
    // Language not supported
    return undefined;
  }

  const query = await languageParser.getQueryForLang(lang);
  const parser = await languageParser.getParserForLang(lang);
  const processedChunks = new Set<string>();
  const capturedChunks: CapturedChunk[] = [];

  try {
    // Parse the file content into an Abstract Syntax Tree (AST)
    const tree = parser.parse(fileContent);
    if (!tree) {
      console.error(`Failed to parse file: ${filePath}`);
      return undefined;
    }

    // Get the appropriate parse strategy for the language
    const parseStrategy = await languageParser.getStrategyForLang(lang);

    // Create parse context
    const context: ParseContext = {
      fileContent,
      lines,
      tree,
      query,
      config,
    };

    // Apply the query to the AST and get the captures
    const captures = query.captures(tree.rootNode);

    // Sort captures by their start position
    captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row);

    for (const capture of captures) {
      const capturedChunkContent = parseStrategy.parseCapture(capture, lines, processedChunks, context);
      if (capturedChunkContent !== null) {
        capturedChunks.push({
          content: capturedChunkContent.trim(),
          startRow: capture.node.startPosition.row,
          endRow: capture.node.endPosition.row,
        });
      }
    }
  } catch (error: unknown) {
    console.error(`Error parsing file: ${error}\n`);
  }

  const filteredChunks = filterDuplicatedChunks(capturedChunks);
  const mergedChunks = mergeAdjacentChunks(filteredChunks);

  return mergedChunks
    .map((chunk) => chunk.content)
    .join(`\n${CHUNK_SEPARATOR}\n`)
    .trim();
};

const getLanguageParserSingleton = async () => {
  if (!languageParserSingleton) {
    languageParserSingleton = new LanguageParser();
    await languageParserSingleton.init();
  }
  return languageParserSingleton;
};

/**
 * Clean up the language parser singleton by deleting all loaded parsers
 */
export const cleanupLanguageParser = async (): Promise<void> => {
  if (languageParserSingleton) {
    try {
      await languageParserSingleton.dispose();
    } catch (err) {
      console.error('Language parser dispose threw', err);
    } finally {
      languageParserSingleton = null;
    }
  }
};

const filterDuplicatedChunks = (chunks: CapturedChunk[]): CapturedChunk[] => {
  // Group chunks by their start row
  const chunksByStartRow = new Map<number, CapturedChunk[]>();

  for (const chunk of chunks) {
    const startRow = chunk.startRow;
    if (!chunksByStartRow.has(startRow)) {
      chunksByStartRow.set(startRow, []);
    }
    chunksByStartRow.get(startRow)?.push(chunk);
  }

  // For each start row, keep the chunk with the most content
  const filteredChunks: CapturedChunk[] = [];
  for (const [_, rowChunks] of chunksByStartRow) {
    rowChunks.sort((a, b) => b.content.length - a.content.length);
    filteredChunks.push(rowChunks[0]);
  }

  // Sort filtered chunks by start row
  return filteredChunks.sort((a, b) => a.startRow - b.startRow);
};

const mergeAdjacentChunks = (chunks: CapturedChunk[]): CapturedChunk[] => {
  if (chunks.length <= 1) {
    return chunks;
  }

  const merged: CapturedChunk[] = [];
  let contentParts: string[] = [chunks[0].content];
  let startRow = chunks[0].startRow;
  let endRow = chunks[0].endRow;

  for (let i = 1; i < chunks.length; i++) {
    const current = chunks[i];

    if (endRow + 1 === current.startRow) {
      // Adjacent: accumulate content part
      contentParts.push(current.content);
      endRow = current.endRow;
    } else {
      // Gap: finalize previous merged chunk and start a new one
      merged.push({ content: contentParts.join('\n'), startRow, endRow });
      contentParts = [current.content];
      startRow = current.startRow;
      endRow = current.endRow;
    }
  }

  // Finalize the last merged chunk
  merged.push({ content: contentParts.join('\n'), startRow, endRow });

  return merged;
};
