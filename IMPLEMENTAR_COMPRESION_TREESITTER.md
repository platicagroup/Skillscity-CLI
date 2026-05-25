# Implementar Code Compression con Tree-Sitter

Guía para migrar la compresión actual (regex) a tree-sitter AST en SkillsCity-CLI,
basada en la arquitectura de [yamadashy/repomix](https://github.com/yamadashy/repomix).

---

## ¿Por qué Tree-Sitter?

La compresión actual usa regex, que tiene limitaciones:
- No entiende la estructura real del código (strings con `{`/`}` se confunden)
- No puede distinguir entre una interface y un objeto literal
- Las firmas multilínea son difíciles de manejar
- No hay soporte contextual ("esto es un método dentro de una clase")

**Tree-sitter** parsea el código en un AST real, lo que permite:
- Identificar con certeza qué es una función, clase, interface, import, etc.
- Extraer firmas exactas (incluyendo decoradores, genéricos, herencia)
- Saber cuándo un bloque `{}` es cuerpo de función vs definición de interface
- Manejar correctamente todos los casos borde (strings, templates, comentarios)

---

## Arquitectura de Repomix

```
fileProcess.ts
  └── fileProcessContent.ts        ← Llama a parseFile cuando compress=true
        └── treeSitter/
              ├── parseFile.ts      ← Orquestador: AST → capturas → chunks → comprimido
              ├── languageConfig.ts  ← Registro de lenguajes + queries + estrategias
              ├── languageParser.ts  ← Singleton: Parser + Query + Strategy por lenguaje
              ├── loadLanguage.ts    ← Carga WASM de tree-sitter
              ├── queries/
              │   ├── queryTypescript.ts
              │   ├── queryPython.ts
              │   ├── queryGo.ts
              │   └── ... (16 lenguajes)
              └── parseStrategies/
                    ├── BaseParseStrategy.ts     ← Clase abstracta
                    ├── TypeScriptParseStrategy.ts
                    ├── PythonParseStrategy.ts
                    ├── GoParseStrategy.ts
                    ├── CssParseStrategy.ts
                    ├── VueParseStrategy.ts
                    └── DefaultParseStrategy.ts
```

### Flujo de datos

```
1. fileProcessContent.ts recibe rawFile + config
2. Si config.compress=true, llama a parseFile(content, filePath, config)
3. parseFile:
   a. languageParser.guessTheLang(filePath) → 'typescript' | 'python' | etc.
   b. Si no reconoce el lenguaje, retorna el contenido sin cambios
   c. languageParser.getParserForLang(lang) → Parser de tree-sitter (WASM)
   d. Parser.parse(content) → Tree (AST)
   e. languageParser.getQueryForLang(lang) → Query (S-expressions)
   f. Query.captures(tree.rootNode) → Captura[] (nodos del AST etiquetados)
   g. languageParser.getStrategyForLang(lang) → ParseStrategy
   h. Por cada captura:
      - strategy.parseCapture(capture, lines, processedChunks, context)
      - Decide si preservar, comprimir, o ignorar
   i. filterDuplicatedChunks() + mergeAdjacentChunks()
   j. Reconstruye el contenido: líneas preservadas + ⋮---- donde se eliminó
4. Retorna el string comprimido
```

---

## Plan de Implementación

### Fase 1: Dependencias

```bash
npm install web-tree-sitter
```

Tree-sitter requiere archivos WASM por lenguaje. Opciones:
- **Opción A (recomendada)**: Usar `@tree-sitter/tree-sitter-{lang}` packages
- **Opción B (offline)**: Descargar WASM y servir desde `node_modules/tree-sitter-{lang}/`

```bash
npm install \
  @tree-sitter/tree-sitter-typescript \
  @tree-sitter/tree-sitter-python \
  @tree-sitter/tree-sitter-javascript \
  @tree-sitter/tree-sitter-go \
  @tree-sitter/tree-sitter-rust \
  @tree-sitter/tree-sitter-c \
  @tree-sitter/tree-sitter-cpp \
  @tree-sitter/tree-sitter-c-sharp \
  @tree-sitter/tree-sitter-css \
  @tree-sitter/tree-sitter-java \
  @tree-sitter/tree-sitter-ruby \
  @tree-sitter/tree-sitter-php \
  @tree-sitter/tree-sitter-swift \
  @tree-sitter/tree-sitter-solidity \
  @tree-sitter/tree-sitter-dart \
  @tree-sitter/tree-sitter-vue
```

> **Nota**: Los packages `@tree-sitter/tree-sitter-*` expiden WASM vía `require.resolve()`. Repomix los carga con `createRequire` dentro de `loadLanguage.ts`.

---

### Fase 2: Estructura de directorios

```
src/core/
  treeSitter/
    parseFile.ts
    languageConfig.ts
    languageParser.ts
    loadLanguage.ts
    queries/
      queryTypescript.ts
      queryPython.ts
      queryGo.ts
      queryRust.ts
      queryC.ts
      queryCpp.ts
      queryCSharp.ts
      queryCss.ts
      queryJava.ts
      queryJavascript.ts
      queryPhp.ts
      queryRuby.ts
      querySwift.ts
      querySolidity.ts
      queryDart.ts
      queryVue.ts
    parseStrategies/
      BaseParseStrategy.ts
      TypeScriptParseStrategy.ts
      PythonParseStrategy.ts
      GoParseStrategy.ts
      CssParseStrategy.ts
      VueParseStrategy.ts
      DefaultParseStrategy.ts
```

---

### Fase 3: Implementación archivo por archivo

#### 1. `queries/queryTypescript.ts` — Tree-sitter query (S-expressions)

Las queries definen qué nodos del AST capturar y con qué etiqueta:

```typescript
export const queryTypescript = `
; Function declarations
(function_declaration
  name: (identifier) @definition.function
  parameters: (formal_parameters) @definition.function
) @definition.function

; Function expressions assigned to variables
(variable_declarator
  name: (identifier) @definition.function
  value: (function_expression) @definition.function
)

; Arrow functions
(arrow_function) @definition.function

; Class declarations
(class_declaration
  name: (identifier) @definition.class
) @definition.class

; Method definitions inside classes
(method_definition
  name: (property_identifier) @definition.method
  parameters: (formal_parameters) @definition.method
) @definition.method

; Interface declarations
(interface_declaration
  name: (type_identifier) @definition.interface
) @definition.interface

; Type aliases
(type_alias_declaration
  name: (type_identifier) @definition.type
) @definition.type

; Enum declarations
(enum_declaration
  name: (identifier) @definition.enum
) @definition.enum

; Import statements
(import_statement) @definition.import

; Export statements
(export_statement) @definition.import

; Comments
(comment) @comment
`;
```

Cada lenguaje tiene su propio archivo de query. Las etiquetas (`@definition.function`, `@definition.class`, etc.) son luego interpretadas por el `ParseStrategy` correspondiente.

Repite para cada lenguaje. Ejemplo para Python (`queryPython.ts`):

```typescript
export const queryPython = `
; Function definitions
(function_definition
  name: (identifier) @definition.function
  parameters: (parameters) @definition.function
) @definition.function

; Class definitions
(class_definition
  name: (identifier) @definition.class
) @definition.class

; Import statements
(import_statement) @definition.import
(import_from_statement) @definition.import

; Type aliases (Python 3.12+)
(type_alias_statement
  name: (identifier) @definition.type_alias
) @definition.type_alias

; Decorators
(decorator) @definition.decorator

; Comments / docstrings
(comment) @comment
(string) @docstring
`;
```

> Las queries completas para los 16 lenguajes están en el XML de repomix en `src/core/treeSitter/queries/`.

---

#### 2. `loadLanguage.ts` — Carga WASM

```typescript
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Language } from 'web-tree-sitter';

// Ruta base para WASM (configurable via setWasmBasePath)
let wasmBasePath: string | null = null;

export function setWasmBasePath(basePath: string): void {
  wasmBasePath = basePath;
}

function getWasmBasePath(): string | null {
  return wasmBasePath;
}

export async function loadLanguage(langName: string): Promise<Language> {
  const wasmPath = await getWasmPath(langName);
  const wasmBuffer = await fs.readFile(wasmPath);
  return await Language.load(wasmBuffer);
}

async function getWasmPath(langName: string): Promise<string> {
  const basePath = getWasmBasePath();
  if (basePath) {
    return path.join(basePath, `tree-sitter-${langName}.wasm`);
  }
  // Fallback: resolver desde node_modules
  const require = createRequire(import.meta.url);
  try {
    return require.resolve(`@tree-sitter/tree-sitter-${langName}/tree-sitter-${langName}.wasm`);
  } catch {
    throw new Error(
      `No se pudo encontrar WASM para '${langName}'. ` +
      `Instala con: npm install @tree-sitter/tree-sitter-${langName}`
    );
  }
}
```

---

#### 3. `languageConfig.ts` — Registro de lenguajes

```typescript
import type { ParseStrategy } from './parseStrategies/BaseParseStrategy.js';
import { CssParseStrategy } from './parseStrategies/CssParseStrategy.js';
import { DefaultParseStrategy } from './parseStrategies/DefaultParseStrategy.js';
import { GoParseStrategy } from './parseStrategies/GoParseStrategy.js';
import { PythonParseStrategy } from './parseStrategies/PythonParseStrategy.js';
import { TypeScriptParseStrategy } from './parseStrategies/TypeScriptParseStrategy.js';
import { VueParseStrategy } from './parseStrategies/VueParseStrategy.js';
import { queryCss } from './queries/queryCss.js';
import { queryGo } from './queries/queryGo.js';
import { queryPython } from './queries/queryPython.js';
import { queryTypescript } from './queries/queryTypescript.js';
import { queryVue } from './queries/queryVue.js';
// ... importar los demás queries

export type SupportedLang =
  | 'c' | 'c_sharp' | 'cpp' | 'css' | 'dart' | 'go' | 'java'
  | 'javascript' | 'php' | 'python' | 'ruby' | 'rust' | 'solidity'
  | 'swift' | 'typescript' | 'vue';

export interface LanguageConfig {
  name: SupportedLang;
  extensions: string[];
  query: string;
  createStrategy: () => ParseStrategy;
}

// Mapa: extensión → LanguageConfig
const languageConfigs: LanguageConfig[] = [
  {
    name: 'typescript',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    query: queryTypescript,
    createStrategy: () => new TypeScriptParseStrategy(),
  },
  {
    name: 'javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    query: queryTypescript, // Misma query (tree-sitter-typescript parsea JS también)
    createStrategy: () => new TypeScriptParseStrategy(),
  },
  {
    name: 'python',
    extensions: ['.py'],
    query: queryPython,
    createStrategy: () => new PythonParseStrategy(),
  },
  {
    name: 'go',
    extensions: ['.go'],
    query: queryGo,
    createStrategy: () => new GoParseStrategy(),
  },
  {
    name: 'css',
    extensions: ['.css', '.scss', '.sass', '.less'],
    query: queryCss,
    createStrategy: () => new CssParseStrategy(),
  },
  {
    name: 'vue',
    extensions: ['.vue'],
    query: queryVue,
    createStrategy: () => new VueParseStrategy(),
  },
  // ... resto de lenguajes con DefaultParseStrategy
  {
    name: 'java',
    extensions: ['.java', '.kt', '.kts'],
    query: queryJava,
    createStrategy: () => new DefaultParseStrategy(),
  },
  // etc.
];

// Lookup maps (cache)
let extensionMap: Map<string, LanguageConfig> | null = null;
let nameMap: Map<string, LanguageConfig> | null = null;

function buildLookupMaps() {
  if (!extensionMap) {
    extensionMap = new Map();
    nameMap = new Map();
    for (const config of languageConfigs) {
      nameMap.set(config.name, config);
      for (const ext of config.extensions) {
        extensionMap.set(ext, config);
      }
    }
  }
  return { extensionMap, nameMap };
}

export function getLanguageConfigByExtension(extension: string): LanguageConfig | undefined {
  const { extensionMap } = buildLookupMaps();
  return extensionMap.get(extension);
}

export function getLanguageConfigByName(languageName: string): LanguageConfig | undefined {
  const { nameMap } = buildLookupMaps();
  return nameMap.get(languageName);
}

export function getSupportedLanguages(): SupportedLang[] {
  return languageConfigs.map(c => c.name);
}
```

---

#### 4. `languageParser.ts` — Singleton Parser/Query/Strategy

```typescript
import { Parser, Query, Language } from 'web-tree-sitter';
import { getLanguageConfigByExtension, getLanguageConfigByName, type SupportedLang } from './languageConfig.js';
import { loadLanguage } from './loadLanguage.js';
import type { ParseStrategy } from './parseStrategies/BaseParseStrategy.js';

interface LanguageResources {
  lang: SupportedLang;
  parser: Parser;
  query: Query;
  strategy: ParseStrategy;
}

export class LanguageParser {
  private resources = new Map<string, LanguageResources>();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await Parser.init();
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    for (const res of this.resources.values()) {
      res.parser.delete();
    }
    this.resources.clear();
    this.initialized = false;
  }

  guessTheLang(filePath: string): SupportedLang | undefined {
    const ext = this.getFileExtension(filePath);
    const config = getLanguageConfigByExtension(ext);
    return config?.name;
  }

  async getParserForLang(name: SupportedLang): Promise<Parser> {
    const res = await this.getResources(name);
    return res.parser;
  }

  async getQueryForLang(name: SupportedLang): Promise<Query> {
    const res = await this.getResources(name);
    return res.query;
  }

  async getStrategyForLang(name: SupportedLang): Promise<ParseStrategy> {
    const res = await this.getResources(name);
    return res.strategy;
  }

  private async prepareLang(name: SupportedLang): Promise<LanguageResources> {
    const config = getLanguageConfigByName(name);
    if (!config) throw new Error(`Lenguaje no soportado: ${name}`);

    const language = await loadLanguage(name);
    const parser = new Parser();
    parser.setLanguage(language);

    const query = new Query(language, config.query);
    const strategy = config.createStrategy();

    return { lang: name, parser, query, strategy };
  }

  private async getResources(name: SupportedLang): Promise<LanguageResources> {
    const existing = this.resources.get(name);
    if (existing) return existing;

    const res = await this.prepareLang(name);
    this.resources.set(name, res);
    return res;
  }

  private getFileExtension(filePath: string): string {
    const dotIndex = filePath.lastIndexOf('.');
    if (dotIndex === -1) return '';
    const ext = filePath.slice(dotIndex).toLowerCase();
    // Manejar .d.ts → .ts
    if (filePath.endsWith('.d.ts')) return '.ts';
    return ext;
  }
}
```

---

#### 5. `BaseParseStrategy.ts` — Clase base para estrategias

```typescript
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
```

---

#### 6. `TypeScriptParseStrategy.ts` — Estrategia para TypeScript/JavaScript

```typescript
import type { Node } from 'web-tree-sitter';
import type { ParseContext } from './BaseParseStrategy.js';
import { BaseParseStrategy, type ParseResult } from './BaseParseStrategy.js';

const CAPTURE_TYPES = {
  Comment: 'comment',
  Interface: 'definition.interface',
  Type: 'definition.type',
  Enum: 'definition.enum',
  Class: 'definition.class',
  Import: 'definition.import',
  Function: 'definition.function',
  Method: 'definition.method',
  Property: 'definition.property',
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
    if (types.has('import')) {
      const content = this.extractNodeContent(capture.node, lines);
      if (content) return content;
      return null;
    }

    // 3. Interfaces, types, enums: preservar completamente
    if (types.has('interface') || types.has('type') || types.has('enum')) {
      return this.parseTypeOrImport(capture.node, lines, processedChunks);
    }

    // 4. Clases: preservar declaración, procesar métodos recursivamente
    if (types.has('class')) {
      return this.parseClassDefinition(capture.node, lines, processedChunks);
    }

    // 5. Funciones: preservar firma, eliminar cuerpo
    if (types.has('function') || types.has('method')) {
      return this.parseFunctionDefinition(capture.node, lines, processedChunks);
    }

    return null;
  }

  private parseFunctionDefinition(
    node: Node,
    lines: string[],
    processedChunks: Set<string>,
  ): ParseResult {
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
    return this.createResult(result);
  }

  private parseClassDefinition(
    node: Node,
    lines: string[],
    processedChunks: Set<string>,
  ): ParseResult {
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
          if (methodResult.content) {
            resultLines.push(methodResult.content);
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
    return this.createResult(resultLines.join('\n'));
  }

  private parseTypeOrImport(
    node: Node,
    lines: string[],
    processedChunks: Set<string>,
  ): ParseResult {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;
    const content = this.extractLines(lines, startRow, endRow);
    if (!content) return this.createNullResult();

    const result = content.join('\n');
    if (this.checkAndAddToProcessed(result, processedChunks)) {
      return this.createNullResult();
    }
    return this.createResult(result);
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
```

---

#### 7. `PythonParseStrategy.ts` — Estrategia para Python

```typescript
import type { Node } from 'web-tree-sitter';
import type { ParseContext } from './BaseParseStrategy.js';
import { BaseParseStrategy, type ParseResult } from './BaseParseStrategy.js';

const CAPTURE_TYPES = {
  Comment: 'comment',
  Class: 'definition.class',
  Function: 'definition.function',
  Docstring: 'docstring',
  TypeAlias: 'definition.type_alias',
  Decorator: 'definition.decorator',
} as const;

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

    if (types.has('class')) {
      return this.parseClassDefinition(lines, capture.node.startPosition.row, processedChunks);
    }

    if (types.has('function')) {
      return this.parseFunctionDefinition(lines, capture.node.startPosition.row, processedChunks);
    }

    if (types.has('type_alias')) {
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
  ): ParseResult {
    const decorators = this.getDecorators(lines, startRow);
    const header = this.getClassInheritance(lines, startRow);
    if (!header) return this.createNullResult();
    return this.createResult([...decorators, header, '    ⋮----'].join('\n'));
  }

  private parseFunctionDefinition(
    lines: string[],
    startRow: number,
    processedChunks: Set<string>,
  ): ParseResult {
    const decorators = this.getDecorators(lines, startRow);
    const sig = this.getFunctionSignature(lines, startRow);
    if (!sig) return this.createNullResult();
    return this.createResult([...decorators, sig, '    ⋮----'].join('\n'));
  }
}
```

---

#### 8. `parseFile.ts` — Orquestador principal

```typescript
import { LanguageParser } from './languageParser.js';
import type { ParseContext } from './parseStrategies/BaseParseStrategy.js';

interface CapturedChunk {
  content: string;
  startRow: number;
  endRow: number;
}

const DELIMITER = '⋮----';

// Singleton LanguageParser
let languageParser: LanguageParser | null = null;

const getLanguageParserSingleton = async (): Promise<LanguageParser> => {
  if (!languageParser) {
    languageParser = new LanguageParser();
    await languageParser.init();
  }
  return languageParser;
};

export const cleanupLanguageParser = async (): Promise<void> => {
  if (languageParser) {
    await languageParser.dispose();
    languageParser = null;
  }
};

export const parseFile = async (
  fileContent: string,
  filePath: string,
): Promise<string> => {
  const parser = await getLanguageParserSingleton();
  const lang = parser.guessTheLang(filePath);

  if (!lang) {
    return fileContent; // Lenguaje no soportado, retornar sin cambios
  }

  // Parsear a AST
  const tsParser = await parser.getParserForLang(lang);
  const tree = tsParser.parse(fileContent);

  if (!tree) {
    return fileContent;
  }

  // Obtener query y estrategia
  const query = await parser.getQueryForLang(lang);
  const strategy = await parser.getStrategyForLang(lang);

  const lines = fileContent.split('\n');
  const captures = query.captures(tree.rootNode);
  const processedChunks = new Set<string>();
  const chunks: CapturedChunk[] = [];
  const context: ParseContext = {
    fileContent,
    lines,
    tree,
    query,
  };

  // Procesar cada captura
  for (const capture of captures) {
    const result = strategy.parseCapture(capture, lines, processedChunks, context);
    if (result) {
      const node = capture.node;
      chunks.push({
        content: result,
        startRow: node.startPosition.row,
        endRow: node.endPosition.row,
      });
    }
  }

  // Ordenar chunks por posición
  chunks.sort((a, b) => a.startRow - b.startRow);

  // Filtrar duplicados y fusionar adyacentes
  const uniqueChunks = filterDuplicatedChunks(chunks);
  const mergedChunks = mergeAdjacentChunks(uniqueChunks);

  // Reconstruir el contenido
  return rebuildContent(lines, mergedChunks);
};

function rebuildContent(lines: string[], chunks: CapturedChunk[]): string {
  const output: string[] = [];
  let lastEnd = 0;

  for (const chunk of chunks) {
    // Preservar líneas entre chunks (no capturadas)
    for (let i = lastEnd; i < chunk.startRow; i++) {
      output.push(lines[i]);
    }

    // Insertar chunk comprimido
    output.push(chunk.content);

    // Saltar líneas que fueron reemplazadas por el chunk
    lastEnd = chunk.endRow + 1;
  }

  // Líneas restantes después del último chunk
  for (let i = lastEnd; i < lines.length; i++) {
    output.push(lines[i]);
  }

  return output.join('\n');
}

function filterDuplicatedChunks(chunks: CapturedChunk[]): CapturedChunk[] {
  return chunks.filter((chunk, index) => {
    return !chunks.slice(0, index).some(
      (prev) => prev.startRow <= chunk.startRow && prev.endRow >= chunk.endRow,
    );
  });
}

function mergeAdjacentChunks(chunks: CapturedChunk[]): CapturedChunk[] {
  if (chunks.length === 0) return [];

  const merged: CapturedChunk[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const last = merged[merged.length - 1];

    // Si los chunks se solapan o son adyacentes (1 línea de diferencia),
    // preservar el de mayor rango
    if (chunks[i].startRow <= last.endRow + 1) {
      last.endRow = Math.max(last.endRow, chunks[i].endRow);
      last.content = last.content + '\n' + chunks[i].content;
    } else {
      merged.push(chunks[i]);
    }
  }

  return merged;
}
```

---

#### 9. Integrar en `fileProcessContent.ts`

Modificar el archivo actual para usar tree-sitter:

```typescript
import { parseFile, cleanupLanguageParser } from '../treeSitter/parseFile.js';

export const processContent = async (
  rawFile: RawFile,
  config: { compress?: boolean; codeCompress?: boolean },
): Promise<string> => {
  const { content, path: filePath } = rawFile;

  // Si codeCompress está activo, usar tree-sitter
  if (config.codeCompress) {
    try {
      return await parseFile(content, filePath);
    } catch (error) {
      console.error(`Error comprimiendo ${filePath}:`, error);
      return content; // Fallback: devolver original
    }
  }

  // Si compress está activo, usar stripComments (regex tradicional)
  if (config.compress) {
    const { stripComments } = await import('../utils/cleaner.js');
    return stripComments(content, filePath);
  }

  return content;
};
```

---

### Fase 4: Conexión con el CLI

El CLI ya tiene los flags `-c` / `--compress` y `-C` / `--code-compress`. En `pack.ts`,
el worker recibe `codeCompress: boolean`. Cuando está activo, llama a `processContent`
que usa tree-sitter.

No se requieren cambios en el CLI. El worker ya tiene la lógica:

```typescript
// En el worker (pack.ts):
if (codeCompress) {
  content = compressCode(content, filePath);  // ← cambiar a parseFile()
} else if (compress) {
  content = stripComments(content, filePath);
}
```

Solo hay que cambiar la función importada de `compressCode` (regex) a `parseFile` (tree-sitter).

---

### Fase 5: Consideraciones

#### WASM Loading
- `web-tree-sitter` requiere `await Parser.init()` una vez al inicio
- Cada lenguaje tiene su propio WASM (~200-500KB)
- La carga inicial es lazy (solo cuando se encuentra un archivo de ese lenguaje)
- Se puede precargar con `setWasmBasePath()` si se tienen los WASM en local

#### Performance
- El parsing tree-sitter es O(n) en el tamaño del archivo
- Para repos grandes, considerar:
  - Cachear el LanguageParser como singleton (ya implementado)
  - Limitar workers concurrentes (ya hay max 4 en pack.ts)
  - Llamar `cleanupLanguageParser()` al final para liberar memoria

#### Errores
- Si tree-sitter falla para un archivo, retornar el contenido original sin cambios
- Si el WASM de un lenguaje no se encuentra, loguear warning y saltar ese archivo

#### Testing
```bash
# Probar con un archivo TypeScript
skills pack src/utils/codeCompress.ts -o test.xml -C

# Probar con proyecto completo
skills pack . -o test.xml -C

# Comparar tamaño vs sin compresión
skills pack . -o full.xml
skills pack . -o compressed.xml -C
```

---

## Resumen de Archivos a Crear/Modificar

| Archivo | Acción | Líneas aprox |
|---|---|---|
| `src/core/treeSitter/loadLanguage.ts` | Crear | ~40 |
| `src/core/treeSitter/languageConfig.ts` | Crear | ~120 |
| `src/core/treeSitter/languageParser.ts` | Crear | ~90 |
| `src/core/treeSitter/parseFile.ts` | Crear | ~120 |
| `src/core/treeSitter/parseStrategies/BaseParseStrategy.ts` | Crear | ~60 |
| `src/core/treeSitter/parseStrategies/TypeScriptParseStrategy.ts` | Crear | ~150 |
| `src/core/treeSitter/parseStrategies/PythonParseStrategy.ts` | Crear | ~80 |
| `src/core/treeSitter/parseStrategies/GoParseStrategy.ts` | Crear | ~50 |
| `src/core/treeSitter/parseStrategies/CssParseStrategy.ts` | Crear | ~30 |
| `src/core/treeSitter/parseStrategies/VueParseStrategy.ts` | Crear | ~40 |
| `src/core/treeSitter/parseStrategies/DefaultParseStrategy.ts` | Crear | ~20 |
| `src/core/treeSitter/queries/queryTypescript.ts` | Crear | ~60 |
| `src/core/treeSitter/queries/queryPython.ts` | Crear | ~40 |
| `src/core/treeSitter/queries/queryGo.ts` | Crear | ~40 |
| `src/core/treeSitter/queries/queryCss.ts` | Crear | ~30 |
| `src/core/treeSitter/queries/queryVue.ts` | Crear | ~20 |
| `src/core/treeSitter/queries/queryC.ts` | Crear | ~40 |
| `src/core/treeSitter/queries/queryCpp.ts` | Crear | ~40 |
| `src/core/treeSitter/queries/queryCSharp.ts` | Crear | ~30 |
| `src/core/treeSitter/queries/queryDart.ts` | Crear | ~30 |
| `src/core/treeSitter/queries/queryJava.ts` | Crear | ~30 |
| `src/core/treeSitter/queries/queryJavascript.ts` | Crear | ~40 |
| `src/core/treeSitter/queries/queryPhp.ts` | Crear | ~30 |
| `src/core/treeSitter/queries/queryRuby.ts` | Crear | ~30 |
| `src/core/treeSitter/queries/queryRust.ts` | Crear | ~40 |
| `src/core/treeSitter/queries/querySolidity.ts` | Crear | ~20 |
| `src/core/treeSitter/queries/querySwift.ts` | Crear | ~30 |
| `src/core/file/fileProcessContent.ts` | **Modificar** | ~20 |

**Total: ~27 archivos nuevos, ~1 archivo modificado**

---

## Dependencias

```bash
npm install web-tree-sitter
npm install @tree-sitter/tree-sitter-typescript
npm install @tree-sitter/tree-sitter-python
npm install @tree-sitter/tree-sitter-javascript
npm install @tree-sitter/tree-sitter-go
npm install @tree-sitter/tree-sitter-rust
npm install @tree-sitter/tree-sitter-c
npm install @tree-sitter/tree-sitter-cpp
npm install @tree-sitter/tree-sitter-c-sharp
npm install @tree-sitter/tree-sitter-css
npm install @tree-sitter/tree-sitter-java
npm install @tree-sitter/tree-sitter-ruby
npm install @tree-sitter/tree-sitter-php
npm install @tree-sitter/tree-sitter-swift
npm install @tree-sitter/tree-sitter-solidity
npm install @tree-sitter/tree-sitter-dart
```

> **Alternativa WASM**: Si se prefiere no depender de los packages `@tree-sitter/*`,
> descargar los WASM de https://github.com/tree-sitter/tree-sitter/releases
> y servirlos desde un directorio local configurable con `setWasmBasePath()`.
