import type { ParseStrategy } from './parseStrategies/BaseParseStrategy.js';
import { CssParseStrategy } from './parseStrategies/CssParseStrategy.js';
import { DefaultParseStrategy } from './parseStrategies/DefaultParseStrategy.js';
import { GoParseStrategy } from './parseStrategies/GoParseStrategy.js';
import { PythonParseStrategy } from './parseStrategies/PythonParseStrategy.js';
import { TypeScriptParseStrategy } from './parseStrategies/TypeScriptParseStrategy.js';
import { VueParseStrategy } from './parseStrategies/VueParseStrategy.js';
import { queryCss } from './queries/queryCss.js';
import { queryGo } from './queries/queryGo.js';
import { queryJavascript } from './queries/queryJavascript.js';
import { queryPhp } from './queries/queryPhp.js';
import { queryPython } from './queries/queryPython.js';
import { queryRuby } from './queries/queryRuby.js';
import { queryRust } from './queries/queryRust.js';
import { querySolidity } from './queries/querySolidity.js';
import { querySwift } from './queries/querySwift.js';
import { queryTypescript } from './queries/queryTypescript.js';
import { queryVue } from './queries/queryVue.js';
import { queryC } from './queries/queryC.js';
import { queryCpp } from './queries/queryCpp.js';
import { queryCSharp } from './queries/queryCSharp.js';
import { queryDart } from './queries/queryDart.js';
import { queryJava } from './queries/queryJava.js';

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
    query: queryJavascript,
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
    name: 'rust',
    extensions: ['.rs'],
    query: queryRust,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'c',
    extensions: ['.c', '.h'],
    query: queryC,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'cpp',
    extensions: ['.cpp', '.cxx', '.hpp', '.hxx', '.cc', '.hh'],
    query: queryCpp,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'c_sharp',
    extensions: ['.cs'],
    query: queryCSharp,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'css',
    extensions: ['.css', '.scss', '.sass', '.less'],
    query: queryCss,
    createStrategy: () => new CssParseStrategy(),
  },
  {
    name: 'java',
    extensions: ['.java', '.kt', '.kts'],
    query: queryJava,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'ruby',
    extensions: ['.rb'],
    query: queryRuby,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'php',
    extensions: ['.php'],
    query: queryPhp,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'swift',
    extensions: ['.swift'],
    query: querySwift,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'solidity',
    extensions: ['.sol'],
    query: querySolidity,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'dart',
    extensions: ['.dart'],
    query: queryDart,
    createStrategy: () => new DefaultParseStrategy(),
  },
  {
    name: 'vue',
    extensions: ['.vue'],
    query: queryVue,
    createStrategy: () => new VueParseStrategy(),
  },
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
  return { extensionMap: extensionMap!, nameMap: nameMap! };
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