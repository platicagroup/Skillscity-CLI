import fs from 'fs-extra';
import path from 'path';

// Utilidades de sistema de archivos del proyecto local

/**
 * Garantiza que un directorio exista, creándolo si no existe.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

/**
 * Escribe un objeto JSON en el disco con indentación legible.
 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, data, { spaces: 2 });
}

/**
 * Escribe un archivo de texto en el disco.
 */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Lee un archivo JSON del disco. Devuelve null si no existe.
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  if (!(await fs.pathExists(filePath))) return null;
  return fs.readJson(filePath) as Promise<T>;
}

/**
 * Devuelve true si existe un lockfile de skills instaladas.
 */
export async function skillsLockfileExists(projectPath: string): Promise<boolean> {
  return fs.pathExists(path.join(projectPath, 'skills.lock.json'));
}

/**
 * Lee el lockfile de skills instaladas o devuelve uno vacío.
 */
export async function readSkillsLockfile(projectPath: string): Promise<Record<string, string>> {
  const lockPath = path.join(projectPath, 'skills.lock.json');
  if (!(await fs.pathExists(lockPath))) return {};
  return fs.readJson(lockPath) as Promise<Record<string, string>>;
}

/**
 * Actualiza el lockfile agregando o actualizando una skill instalada.
 */
export async function updateSkillsLockfile(
  projectPath: string,
  skillName: string,
  version: string
): Promise<void> {
  const lockPath = path.join(projectPath, 'skills.lock.json');
  const existing = await readSkillsLockfile(projectPath);
  existing[skillName] = version;
  await writeJsonFile(lockPath, existing);
}
