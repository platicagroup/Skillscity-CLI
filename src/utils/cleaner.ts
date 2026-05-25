import path from 'path';
import { getEncoding } from 'js-tiktoken';

// Inicializar el codificador cl100k_base (compatible con GPT-4 y Claude)
const encoder = getEncoding('cl100k_base');

/**
 * Cuenta los tokens de un texto usando el codificador cl100k_base.
 */
export function countTokens(text: string): number {
  return encoder.encode(text, 'all').length;
}

/**
 * Elimina comentarios de bloque y de línea única, así como líneas vacías redundantes.
 */
export function stripComments(content: string, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  // Para lenguajes de la familia C (JS, TS, JSON, CSS)
  if (['.js', '.jsx', '.ts', '.tsx', '.json', '.css'].includes(ext)) {
    // Eliminar comentarios multilínea /* ... */
    let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '');

    const lines = cleaned.split('\n');
    const processedLines = lines.map(line => {
      const doubleSlashIndex = line.indexOf('//');
      if (doubleSlashIndex !== -1) {
        // Verificar que no sea un link (http:// o https://)
        const isUrl = /https?:\/\//.test(line.substring(Math.max(0, doubleSlashIndex - 6), doubleSlashIndex + 2));
        if (!isUrl) {
          // Verificar que no esté dentro de un string (comillas simples, dobles o backticks antes de //)
          const before = line.substring(0, doubleSlashIndex);
          const singleQuotesCount = (before.match(/'/g) || []).length;
          const doubleQuotesCount = (before.match(/"/g) || []).length;
          const backticksCount = (before.match(/`/g) || []).length;
          
          if (singleQuotesCount % 2 === 0 && doubleQuotesCount % 2 === 0 && backticksCount % 2 === 0) {
            return before.trimEnd();
          }
        }
      }
      return line;
    });

    return processedLines.filter(line => line.trim() !== '').join('\n');
  }

  // Para Python
  if (['.py'].includes(ext)) {
    // Eliminar docstrings (de tres comillas dobles o simples)
    let cleaned = content.replace(/"""[\s\S]*?"""/g, '').replace(/'''[\s\S]*?'''/g, '');
    
    const lines = cleaned.split('\n');
    const processedLines = lines.map(line => {
      const hashIndex = line.indexOf('#');
      if (hashIndex !== -1) {
        // Verificar que no esté dentro de un string antes del #
        const before = line.substring(0, hashIndex);
        const singleQuotesCount = (before.match(/'/g) || []).length;
        const doubleQuotesCount = (before.match(/"/g) || []).length;
        
        if (singleQuotesCount % 2 === 0 && doubleQuotesCount % 2 === 0) {
          return before.trimEnd();
        }
      }
      return line;
    });

    return processedLines.filter(line => line.trim() !== '').join('\n');
  }

  // Para otros archivos: simplemente eliminar líneas vacías redundantes
  return content.split('\n').filter(line => line.trim() !== '').join('\n');
}
