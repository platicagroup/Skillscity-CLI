import fs from 'fs-extra';
import path from 'path';
import { LANGUAGE_RULES } from './rules.js';

export interface ProjectStack {
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  hasGit: boolean;
}

export async function detectStack(projectPath: string): Promise<ProjectStack> {
  const stack: ProjectStack = {
    languages: [],
    frameworks: [],
    dependencies: [],
    hasGit: false
  };

  // 1. Detectar repositorio Git local
  stack.hasGit = await fs.pathExists(path.join(projectPath, '.git'));

  // 2. Leer archivos en la raíz para evaluar extensiones como fallback
  const rootFiles = await fs.pathExists(projectPath)
    ? await fs.readdir(projectPath)
    : [];
  const hasExtension = (ext: string) => rootFiles.some(f => f.endsWith(ext));

  for (const rule of LANGUAGE_RULES) {
    let matchesLanguage = false;

    // A. Buscar archivos manifiestos del ecosistema
    for (const manifest of rule.manifests) {
      const manifestPath = path.join(projectPath, manifest);
      if (await fs.pathExists(manifestPath)) {
        matchesLanguage = true;

        // --- Node.js / package.json ---
        if (manifest === 'package.json') {
          try {
            const pkg = await fs.readJson(manifestPath);
            const deps = [
              ...Object.keys(pkg.dependencies || {}),
              ...Object.keys(pkg.devDependencies || {})
            ];
            stack.dependencies.push(...deps);

            if (rule.frameworkRules) {
              for (const fw of rule.frameworkRules) {
                if (fw.manifestIndicator && deps.includes(fw.manifestIndicator)) {
                  stack.frameworks.push(fw.framework);
                }
              }
            }
          } catch (_e) {}
        }

        // --- Python / requirements.txt ---
        if (manifest === 'requirements.txt') {
          try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const deps = content
              .split('\n')
              .map(line => line.split('==')[0].split('>=')[0].split('~=')[0].trim())
              .filter(line => line.length > 0 && !line.startsWith('#'));
            stack.dependencies.push(...deps);

            if (rule.frameworkRules) {
              for (const fw of rule.frameworkRules) {
                if (fw.manifestIndicator && deps.some(d => d.toLowerCase().includes(fw.manifestIndicator!))) {
                  stack.frameworks.push(fw.framework);
                }
              }
            }
          } catch (_e) {}
        }

        // --- Rust / Cargo.toml ---
        if (manifest === 'Cargo.toml') {
          try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const lines = content.split('\n');
            let inDependencies = false;
            for (const line of lines) {
              if (line.startsWith('[dependencies]') || line.startsWith('[dev-dependencies]')) {
                inDependencies = true;
                continue;
              }
              if (line.startsWith('[') && inDependencies) {
                inDependencies = false;
              }
              if (inDependencies && line.includes('=')) {
                const dep = line.split('=')[0].trim();
                stack.dependencies.push(dep);
                if (rule.frameworkRules) {
                  for (const fw of rule.frameworkRules) {
                    if (fw.manifestIndicator && dep === fw.manifestIndicator) {
                      stack.frameworks.push(fw.framework);
                    }
                  }
                }
              }
            }
          } catch (_e) {}
        }

        // --- Go / go.mod ---
        if (manifest === 'go.mod') {
          try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('require ') || (trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('module') && !trimmed.startsWith('go '))) {
                if (rule.frameworkRules) {
                  for (const fw of rule.frameworkRules) {
                    if (fw.manifestIndicator && trimmed.includes(fw.manifestIndicator)) {
                      stack.frameworks.push(fw.framework);
                    }
                  }
                }
              }
            }
          } catch (_e) {}
        }

        // --- PHP / composer.json ---
        if (manifest === 'composer.json') {
          try {
            const pkg = await fs.readJson(manifestPath);
            const deps = [
              ...Object.keys(pkg.require || {}),
              ...Object.keys(pkg['require-dev'] || {})
            ];
            stack.dependencies.push(...deps);
            if (rule.frameworkRules) {
              for (const fw of rule.frameworkRules) {
                if (fw.manifestIndicator && deps.includes(fw.manifestIndicator)) {
                  stack.frameworks.push(fw.framework);
                }
              }
            }
          } catch (_e) {}
        }
      }
    }

    // B. Fallback: detectar por extensión de archivos en la raíz
    if (!matchesLanguage) {
      for (const ext of rule.extensions) {
        if (hasExtension(ext)) {
          matchesLanguage = true;
          break;
        }
      }
    }

    if (matchesLanguage) {
      stack.languages.push(rule.language);
    }
  }

  // De-duplicar todos los arrays
  stack.languages = [...new Set(stack.languages)];
  stack.frameworks = [...new Set(stack.frameworks)];
  stack.dependencies = [...new Set(stack.dependencies)];

  return stack;
}
