import fs from 'fs-extra';
import path from 'path';
import fg from 'fast-glob';
import ignore from 'ignore';
import pc from 'picocolors';
import os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { spinner, cancel } from '@clack/prompts';
import { printBanner, printBox, printSuccess, printError } from '../utils/ui.js';
import { stripComments, countTokens } from '../utils/cleaner.js';

// ---------------------------------------------------------------------------
// Hilo Secundario (Worker Thread)
// ---------------------------------------------------------------------------

if (!isMainThread) {
  const runWorker = async () => {
    const { filePaths, absoluteTargetDir, compress } = workerData as {
      filePaths: string[];
      absoluteTargetDir: string;
      compress: boolean;
    };

    const results = [];
    for (const filePath of filePaths) {
      const absoluteFilePath = path.join(absoluteTargetDir, filePath);
      let content = await fs.readFile(absoluteFilePath, 'utf-8');

      if (compress) {
        content = stripComments(content, filePath);
      }

      const tokens = countTokens(content);

      results.push({
        path: filePath,
        content,
        tokens
      });
    }

    parentPort?.postMessage(results);
  };

  runWorker().catch(err => {
    console.error('Error en el worker:', err);
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Hilo Principal
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.pdf',
  '.zip', '.gz', '.tar', '.mp4', '.mp3', '.woff', '.woff2', '.eot', '.ttf',
  '.exe', '.bin', '.dll', '.so', '.dylib', '.lock', '.sqlite', '.db',
  '.class', '.jar', '.war', '.ear', '.docx', '.xlsx', '.pptx'
]);

interface PackOptions {
  output: string;
  style: 'xml' | 'markdown' | 'json';
  exclude?: string[];
  compress: boolean;
}

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
}

// ---------------------------------------------------------------------------
// Helpers para la Estructura de Directorios (Árbol)
// ---------------------------------------------------------------------------

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '.', children: new Map(), isFile: false };
  for (const p of paths) {
    const parts = p.split(path.sep).join('/').split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      const isLast = i === parts.length - 1;
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          children: new Map(),
          isFile: isLast
        });
      }
      current = current.children.get(part)!;
    }
  }
  return root;
}

function renderTree(node: TreeNode, prefix = ''): string {
  let result = '';
  const entries = Array.from(node.children.entries()).sort((a, b) => {
    if (a[1].isFile !== b[1].isFile) {
      return a[1].isFile ? 1 : -1;
    }
    return a[0].localeCompare(b[0]);
  });

  for (let i = 0; i < entries.length; i++) {
    const [name, child] = entries[i];
    const isLast = i === entries.length - 1;
    const marker = isLast ? '└── ' : '├── ';
    result += `${prefix}${marker}${name}${child.isFile ? '' : '/'}\n`;
    if (!child.isFile) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      result += renderTree(child, newPrefix);
    }
  }
  return result;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Comando Principal: pack
// ---------------------------------------------------------------------------

export async function packCommand(targetDir: string, options: PackOptions) {
  if (!isMainThread) return;

  printBanner();

  const s = spinner();
  s.start('Iniciando el empaquetado del repositorio...');

  try {
    const absoluteTargetDir = path.resolve(targetDir);
    const absoluteOutputFile = path.resolve(options.output);

    // 1. Configurar reglas de ignorado
    const ignoreFilter = ignore();

    // Reglas por defecto
    ignoreFilter.add([
      '.git',
      'node_modules',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      path.relative(absoluteTargetDir, absoluteOutputFile) // Ignorar el propio archivo de salida
    ]);

    // Leer .gitignore
    const gitignorePath = path.join(absoluteTargetDir, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      ignoreFilter.add(content);
    }

    // Leer .skillsignore o .repomixignore
    const skillsignorePath = path.join(absoluteTargetDir, '.skillsignore');
    if (await fs.pathExists(skillsignorePath)) {
      const content = await fs.readFile(skillsignorePath, 'utf-8');
      ignoreFilter.add(content);
    }

    const repomixignorePath = path.join(absoluteTargetDir, '.repomixignore');
    if (await fs.pathExists(repomixignorePath)) {
      const content = await fs.readFile(repomixignorePath, 'utf-8');
      ignoreFilter.add(content);
    }

    // Agregar exclusiones manuales del comando
    if (options.exclude && options.exclude.length > 0) {
      ignoreFilter.add(options.exclude);
    }

    // 2. Escanear archivos recursivamente usando fast-glob
    s.message('Buscando archivos en el directorio...');
    const allFiles = await fg('**/*', {
      cwd: absoluteTargetDir,
      dot: true,
      onlyFiles: true
    });

    // 3. Filtrar archivos usando las reglas de ignorado y tipos binarios
    const relativeOutputFile = path.relative(absoluteTargetDir, absoluteOutputFile).replace(/\\/g, '/');
    const filteredFiles = allFiles.filter(filePath => {
      if (filePath === relativeOutputFile) return false;
      const ext = path.extname(filePath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) return false;
      return !ignoreFilter.ignores(filePath);
    });

    if (filteredFiles.length === 0) {
      s.stop('Proceso cancelado');
      cancel('No se encontraron archivos válidos para empaquetar.');
      process.exit(1);
    }

    // 4. Generar el árbol de directorios
    s.message('Generando estructura de directorios...');
    const treeRoot = buildTree(filteredFiles);
    const directoryTree = renderTree(treeRoot);

    // 5. Procesar archivos en paralelo con Workers
    s.message(`Procesando ${filteredFiles.length} archivos en paralelo...`);
    
    // Determinar la cantidad óptima de workers
    const cpuCount = os.cpus().length || 1;
    const workerCount = Math.min(cpuCount, 4); // Límite de 4 workers para evitar sobrecarga
    const chunkSize = Math.ceil(filteredFiles.length / workerCount);
    const fileChunks = chunkArray(filteredFiles, chunkSize);

    const workerPromises = fileChunks.map(chunk => {
      return new Promise<any[]>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), {
          workerData: {
            filePaths: chunk,
            absoluteTargetDir,
            compress: options.compress
          }
        });
        
        worker.on('message', (message) => resolve(message));
        worker.on('error', (err) => reject(err));
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Worker finalizó con código de salida ${code}`));
        });
      });
    });

    const chunkResults = await Promise.all(workerPromises);
    const processedFiles = chunkResults.flat();

    // 6. Construir contenido de salida
    s.message('Dando formato a los archivos procesados...');
    let finalOutput = '';

    if (options.style === 'xml') {
      finalOutput = `This file is a merged representation of the codebase, combined into a single document by SkillsCity CLI.

<file_summary>
This section contains a summary of the packed codebase.
Total Files: ${processedFiles.length}
Output Format: XML representation
</file_summary>

<directory_structure>
${directoryTree}</directory_structure>

<files>
`;
      for (const file of processedFiles) {
        finalOutput += `<file path="${file.path}">
${file.content}
</file>
`;
      }
      finalOutput += `</files>\n`;

    } else if (options.style === 'markdown') {
      finalOutput = `# Repository Context

This file is a merged representation of the codebase.

## Directory Structure
\`\`\`text
${directoryTree}\`\`\`

## Files
`;
      for (const file of processedFiles) {
        const ext = path.extname(file.path).slice(1);
        finalOutput += `\n### File: ${file.path}\n\`\`\`${ext}\n${file.content}\n\`\`\`\n`;
      }

    } else if (options.style === 'json') {
      finalOutput = JSON.stringify({
        fileSummary: {
          purpose: 'Packed representation of repository contents for AI systems',
          totalFiles: processedFiles.length,
          timestamp: new Date().toISOString()
        },
        directoryStructure: directoryTree,
        files: processedFiles.map(f => ({ path: f.path, content: f.content, tokens: f.tokens }))
      }, null, 2);
    }

    // 7. Escribir archivo consolidado
    s.message('Escribiendo archivo final...');
    await fs.ensureDir(path.dirname(absoluteOutputFile));
    await fs.writeFile(absoluteOutputFile, finalOutput, 'utf-8');

    // 8. Contar los tokens finales del archivo consolidado completo
    const totalTokensCount = countTokens(finalOutput);

    s.stop('Empaquetado completado');

    printSuccess(`Repositorio empaquetado exitosamente.`);
    printBox('Resumen del Empaquetado', [
      `Archivos procesados  : ${pc.bold(String(processedFiles.length))}`,
      `Estilo de formato    : ${pc.bold(options.style.toUpperCase())}`,
      `Compresión activa    : ${options.compress ? pc.green('Sí') : pc.yellow('No')}`,
      `Tokens del output    : ${pc.bold(pc.green(totalTokensCount.toLocaleString()))}`,
      `Archivo generado     : ${pc.cyan(options.output)}`
    ]);

  } catch (error) {
    s.stop('Error durante el empaquetado');
    printError(`Ocurrió un error inesperado.`);
    console.error(error);
    process.exit(1);
  }
}
