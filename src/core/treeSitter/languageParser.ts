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