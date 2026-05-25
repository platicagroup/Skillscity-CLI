import path from 'path';

const DELIMITER = '⋮----';

interface SigConfig {
  pattern: RegExp;
  keepBody: boolean;
  isClass: boolean;
}

function findMatchingBrace(lines: string[], start: number): number {
  let depth = 0;
  let inString: string | null = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const prev = j > 0 ? line[j - 1] : '';
      if (inString) {
        if (ch === inString && prev !== '\\') inString = null;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        if (depth === 0) return i;
        depth--;
      }
    }
  }
  return -1;
}

function findSignatureEnd(lines: string[], start: number): number {
  let parenDepth = 0;
  let inParen = false;
  let inString: string | null = null;
  for (let i = start; i < lines.length; i++) {
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
  return start;
}

function isOnlyBraceLine(line: string): boolean {
  return line.trim() === '{' || line.trim() === '}';
}

function getBraceInfo(line: string): { beforeBrace: string; afterBrace: string } | null {
  const idx = line.indexOf('{');
  if (idx === -1) return null;
  return {
    beforeBrace: line.substring(0, idx + 1),
    afterBrace: line.substring(idx + 1),
  };
}

function compressBraceLanguage(content: string, sigConfigs: SigConfig[], keepLinePatterns: RegExp[] = [], skipLinePatterns: RegExp[] = []): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trimEnd();

    if (skipLinePatterns.some(p => p.test(rawLine))) {
      i++;
      continue;
    }

    if (keepLinePatterns.some(p => p.test(rawLine))) {
      result.push(rawLine);
      i++;
      continue;
    }

    const matchedSig = sigConfigs.find(c => c.pattern.test(trimmed));
    if (matchedSig) {
      const sigEnd = findSignatureEnd(lines, i);
      for (let j = i; j <= sigEnd; j++) {
        result.push(lines[j]);
      }
      i = sigEnd + 1;

      if (i >= lines.length) break;

      const nextTrimmed = lines[i].trim();
      const braceInfo = getBraceInfo(lines[i]);

      if (!braceInfo && nextTrimmed !== '{') {
        continue;
      }

      if (matchedSig.keepBody) {
        if (isOnlyBraceLine(lines[i])) {
          result.push(lines[i]);
          i++;
          const closeBrace = findMatchingBrace(lines, i);
          if (closeBrace >= i) {
            for (let j = i; j < closeBrace; j++) {
              result.push(lines[j]);
            }
            result.push(lines[closeBrace]);
            i = closeBrace + 1;
          }
        } else if (braceInfo) {
          result.push(braceInfo.beforeBrace);
          const rest = braceInfo.afterBrace.trim();
          if (rest === '}') {
            if (!isOnlyBraceLine(lines[i])) {
              result.push(braceInfo.beforeBrace.replace('{', ''));
            }
            i++;
          } else {
            const closeBrace = findMatchingBrace(lines, i + 1);
            if (closeBrace >= i + 1) {
              for (let j = i + 1; j < closeBrace; j++) {
                result.push(lines[j]);
              }
              result.push(lines[closeBrace]);
              i = closeBrace + 1;
            }
          }
        }
      } else if (matchedSig.isClass) {
        if (isOnlyBraceLine(lines[i])) {
          result.push(lines[i]);
          i++;
          const closeBrace = findMatchingBrace(lines, i);
          if (closeBrace > i) {
            const bodyLines = lines.slice(i, closeBrace);
            const compressed = compressTypeScript(bodyLines.join('\n'), true);
            result.push(compressed);
            i = closeBrace;
          }
          if (closeBrace >= 0 && closeBrace < lines.length) {
            result.push(lines[closeBrace]);
            i = closeBrace + 1;
          }
        } else if (braceInfo) {
          result.push(braceInfo.beforeBrace);
          const rest = braceInfo.afterBrace.trim();
          if (rest.length > 0 && rest !== '}') {
            const closeBrace = findMatchingBrace(lines, i + 1);
            if (closeBrace > i + 1) {
              const bodyLines = lines.slice(i + 1, closeBrace);
              const compressed = compressTypeScript(bodyLines.join('\n'), true);
              result.push(compressed);
              i = closeBrace;
            }
            if (closeBrace >= 0 && closeBrace < lines.length) {
              result.push(lines[closeBrace]);
              i = closeBrace + 1;
            }
          } else {
            i++;
          }
        }
      } else {
        const openLine = lines[i];
        const bodyBraceInfo = getBraceInfo(openLine);

        if (isOnlyBraceLine(openLine)) {
          result.push(openLine);
          i++;
          const closeBrace = findMatchingBrace(lines, i);
          if (closeBrace > i) {
            result.push('  ' + DELIMITER);
            i = closeBrace;
          }
          if (closeBrace >= 0 && closeBrace < lines.length) {
            result.push(lines[closeBrace]);
            i = closeBrace + 1;
          }
        } else if (bodyBraceInfo) {
          result.push(bodyBraceInfo.beforeBrace);
          const rest = bodyBraceInfo.afterBrace.trim();
          if (rest.length > 0 && rest !== '}') {
            const closeBrace = findMatchingBrace(lines, i + 1);
            if (closeBrace > i + 1) {
              result.push('  ' + DELIMITER);
              i = closeBrace;
            }
            if (closeBrace >= 0 && closeBrace < lines.length) {
              result.push(lines[closeBrace]);
              i = closeBrace + 1;
            }
          } else if (rest === '}') {
            i++;
          } else {
            i++;
          }
        }
      }
      continue;
    }

    result.push(rawLine);
    i++;
  }

  return result.join('\n');
}

function compressTypeScript(content: string, insideClass = false): string {
  const sigConfigs: SigConfig[] = [
    { pattern: /^(export\s+default\s+)?(async\s+)?function\s+\w*/, keepBody: false, isClass: false },
    { pattern: /^(export\s+)?(abstract\s+)?class\s+\w+/, keepBody: false, isClass: true },
    { pattern: /^(export\s+)?interface\s+\w+/, keepBody: true, isClass: false },
    { pattern: /^(export\s+)?type\s+\w+\s*=/, keepBody: true, isClass: false },
    { pattern: /^(export\s+)?enum\s+\w+/, keepBody: true, isClass: false },
    { pattern: /^\s+(private|public|protected|static|readonly|abstract)\s+/, keepBody: false, isClass: false },
    { pattern: /^\s+\[.*\]\s*\(/, keepBody: false, isClass: false },
    { pattern: /^\s*(async\s+)?\*?\s*\w+\s*\(/, keepBody: false, isClass: false },
  ];

  if (!insideClass) {
    sigConfigs.unshift(
      { pattern: /^(export\s+)?(const|let|var)\s+\w+\s*[=:]/, keepBody: false, isClass: false },
      { pattern: /^(export\s+)?(async\s+)?(get|set)\s+\w+\s*\(/, keepBody: false, isClass: false },
    );
  }

  const keepLinePatterns = [
    /^import\s/,
    /^\/\*\*/,
    /^\s*\*/,
    /^\s*\/\//,
    /^@\w+/,
    /^\/\/\/\s/,
    /^export\s+\{/,
    /^export\s+default\s+\{/,
    /^export\s+default\s+\w+/,
    /^export\s+\*/,
    /^\s+@\w+/,
  ];

  const skipLinePatterns: RegExp[] = [];

  return compressBraceLanguage(content, sigConfigs, keepLinePatterns, skipLinePatterns);
}

function compressPython(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;

  const classDef = /^(class)\s+\w+/;
  const funcDef = /^(async\s+)?(def)\s+\w+/;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    if (!trimmed) {
      result.push(line);
      i++;
      continue;
    }

    if (trimmed.startsWith('#') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      result.push(line);
      i++;
      continue;
    }

    if (trimmed.startsWith('@')) {
      result.push(line);
      i++;
      continue;
    }

    if (trimmed.startsWith('import ') || trimmed.startsWith('from ') || trimmed.startsWith('as ')) {
      result.push(line);
      i++;
      continue;
    }

    const currentIndent = line.match(/^(\s*)/)?.[1] || '';

    if (classDef.test(trimmed)) {
      result.push(line);
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trimEnd();
        if (!nextTrimmed) { i++; continue; }
        const nextIndent = nextLine.match(/^(\s*)/)?.[1] || '';
        if (nextIndent.length <= currentIndent.length && nextTrimmed) break;
        if (nextIndent.length > currentIndent.length && funcDef.test(nextTrimmed)) {
          const fi = nextIndent;
          result.push(nextLine);
          i++;
          while (i < lines.length) {
            const bodyLine = lines[i];
            const bodyTrimmed = bodyLine.trimEnd();
            if (!bodyTrimmed) { i++; continue; }
            const bodyIndent = bodyLine.match(/^(\s*)/)?.[1] || '';
            if (bodyIndent.length <= fi.length && bodyTrimmed) break;
            if (bodyIndent.length > fi.length) {
              result.push(fi + '  ' + DELIMITER);
              while (i < lines.length) {
                const skipLine = lines[i];
                const skipTrimmed = skipLine.trimEnd();
                if (!skipTrimmed) { i++; continue; }
                const skipIndent = skipLine.match(/^(\s*)/)?.[1] || '';
                if (skipIndent.length <= fi.length && skipTrimmed) break;
                i++;
              }
              break;
            }
            i++;
          }
          continue;
        }
        if (nextIndent.length > currentIndent.length && !funcDef.test(nextTrimmed) && !nextTrimmed.startsWith('@') && !nextTrimmed.startsWith('#')) {
          result.push(currentIndent + '  ' + DELIMITER);
          while (i < lines.length) {
            const skipLine = lines[i];
            const skipTrimmed = skipLine.trimEnd();
            if (!skipTrimmed) { i++; continue; }
            const skipIndent = skipLine.match(/^(\s*)/)?.[1] || '';
            if (skipIndent.length <= currentIndent.length && skipTrimmed) break;
            i++;
          }
          continue;
        }
        result.push(nextLine);
        i++;
      }
      continue;
    }

    if (funcDef.test(trimmed)) {
      result.push(line);
      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trimEnd();
        if (!nextTrimmed) { i++; continue; }
        const nextIndent = nextLine.match(/^(\s*)/)?.[1] || '';
        if (nextIndent.length <= currentIndent.length && nextTrimmed) break;
        if (nextIndent.length > currentIndent.length) {
          result.push(currentIndent + '  ' + DELIMITER);
          while (i < lines.length) {
            const skipLine = lines[i];
            const skipTrimmed = skipLine.trimEnd();
            if (!skipTrimmed) { i++; continue; }
            const skipIndent = skipLine.match(/^(\s*)/)?.[1] || '';
            if (skipIndent.length <= currentIndent.length && skipTrimmed) break;
            i++;
          }
          break;
        }
        i++;
      }
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

function compressGo(content: string): string {
  const sigConfigs: SigConfig[] = [
    { pattern: /^func\s+\w+/, keepBody: false, isClass: false },
    { pattern: /^func\s+\(/, keepBody: false, isClass: false },
    { pattern: /^type\s+\w+\s+(struct|interface)\s*\{?$/, keepBody: true, isClass: false },
    { pattern: /^type\s+\w+\s/, keepBody: true, isClass: false },
  ];
  const keepLinePatterns = [
    /^import\s/,
    /^package\s/,
    /^const\s/,
    /^var\s/,
  ];
  return compressBraceLanguage(content, sigConfigs, keepLinePatterns);
}

function compressCss(content: string): string {
  const sigConfigs: SigConfig[] = [
    { pattern: /^@media\s/, keepBody: false, isClass: false },
    { pattern: /^@keyframes\s/, keepBody: false, isClass: false },
    { pattern: /^@font-face/, keepBody: false, isClass: false },
    { pattern: /^@supports/, keepBody: false, isClass: false },
    { pattern: /^\./, keepBody: false, isClass: false },
    { pattern: /^#/, keepBody: false, isClass: false },
    { pattern: /^\w[\w-]*\s*\{/, keepBody: false, isClass: false },
  ];
  return compressBraceLanguage(content, sigConfigs);
}

function compressJava(content: string): string {
  const sigConfigs: SigConfig[] = [
    { pattern: /^(public|private|protected|static|final|abstract|synchronized|native)\s.*\(/, keepBody: false, isClass: false },
    { pattern: /^(public|private|protected)?\s*(class|interface|enum|@interface)\s+\w+/, keepBody: true, isClass: false },
  ];
  const keepLinePatterns = [
    /^import\s/,
    /^package\s/,
  ];
  return compressBraceLanguage(content, sigConfigs, keepLinePatterns);
}

function compressRust(content: string): string {
  const sigConfigs: SigConfig[] = [
    { pattern: /^fn\s+\w+/, keepBody: false, isClass: false },
    { pattern: /^(pub|pub\(crate\)|pub\(super\))?\s*(fn|struct|enum|trait|impl|union|mod|type|const|unsafe|async)\s+\w+/, keepBody: true, isClass: false },
    { pattern: /^(pub|pub\(crate\)|pub\(super\))?\s*(struct|enum|trait|impl)\s+\w+/, keepBody: true, isClass: false },
    { pattern: /^#!?\[/, keepBody: false, isClass: false },
  ];
  return compressBraceLanguage(content, sigConfigs);
}

function compressC(content: string): string {
  const sigConfigs: SigConfig[] = [
    { pattern: /^\w+\s+\w+\s*\(/, keepBody: false, isClass: false },
    { pattern: /^(int|void|char|float|double|long|short|unsigned|signed|static|const|struct|enum|union)\s/, keepBody: true, isClass: false },
    { pattern: /^#\s*(include|define|if|ifdef|ifndef|else|elif|endif|pragma|error|warning)/, keepBody: false, isClass: false },
  ];
  return compressBraceLanguage(content, sigConfigs);
}

function compressVue(content: string): string {
  const sections: { start: RegExp; end: RegExp; compressor: (c: string) => string; buffer: string[] }[] = [
    { start: /<script[\s>]/, end: /<\/script>/, compressor: compressTypeScript, buffer: [] },
    { start: /<style[\s>]/, end: /<\/style>/, compressor: compressCss, buffer: [] },
  ];

  const lines = content.split('\n');
  const result: string[] = [];
  let inSection: typeof sections[0] | null = null;
  let inTemplate = false;
  let templateDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inSection) {
      if (inSection.end.test(trimmed)) {
        inSection.buffer.push(line);
        result.push(inSection.compressor(inSection.buffer.join('\n')));
        inSection.buffer = [];
        inSection = null;
      } else {
        inSection.buffer.push(line);
      }
      continue;
    }

    for (const sec of sections) {
      if (sec.start.test(trimmed)) {
        sec.buffer = [line];
        inSection = sec;
        break;
      }
    }
    if (inSection) continue;

    if (/<template[\s>]/.test(trimmed)) {
      inTemplate = true;
      templateDepth = 0;
      result.push(line);
      continue;
    }
    if (inTemplate) {
      if (trimmed.includes('<template')) templateDepth++;
      if (/<\/template>/.test(trimmed)) {
        if (templateDepth <= 0) {
          inTemplate = false;
        } else {
          templateDepth--;
        }
      }
      result.push(line);
      continue;
    }

    result.push(line);
  }

  if (inSection && inSection.buffer.length > 0) {
    result.push(inSection.compressor(inSection.buffer.join('\n')));
  }

  return result.join('\n');
}

const LANGUAGE_CONFIGS: { extensions: string[]; compress: (content: string) => string }[] = [
  { extensions: ['.ts', '.tsx', '.mts', '.cts'], compress: compressTypeScript },
  { extensions: ['.js', '.jsx', '.mjs', '.cjs'], compress: compressTypeScript },
  { extensions: ['.py'], compress: compressPython },
  { extensions: ['.go'], compress: compressGo },
  { extensions: ['.css', '.scss', '.sass', '.less'], compress: compressCss },
  { extensions: ['.java', '.kt', '.kts'], compress: compressJava },
  { extensions: ['.rs'], compress: compressRust },
  { extensions: ['.c', '.h'], compress: compressC },
  { extensions: ['.cpp', '.cxx', '.hpp', '.hxx', '.cc', '.hh'], compress: compressC },
  { extensions: ['.cs'], compress: compressJava },
  { extensions: ['.vue'], compress: compressVue },
  { extensions: ['.swift'], compress: compressJava },
  { extensions: ['.php'], compress: compressTypeScript },
  { extensions: ['.rb'], compress: compressPython },
  { extensions: ['.dart'], compress: compressJava },
];

export function getCodeCompressConfig(ext: string): ((content: string) => string) | null {
  for (const config of LANGUAGE_CONFIGS) {
    if (config.extensions.includes(ext)) {
      return config.compress;
    }
  }
  return null;
}

export function compressCode(content: string, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const compressFn = getCodeCompressConfig(ext);
  if (compressFn) {
    return compressFn(content);
  }
  return content;
}
