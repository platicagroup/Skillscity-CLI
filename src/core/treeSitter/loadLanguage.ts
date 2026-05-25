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
    return require.resolve(`tree-sitter-wasms/out/tree-sitter-${langName}.wasm`);
  } catch {
    throw new Error(
      `No se pudo encontrar WASM para '${langName}'. ` +
      `Instala con: npm install tree-sitter-wasms`
    );
  }
}