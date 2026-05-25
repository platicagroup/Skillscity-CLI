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

export interface PackedFile {
  path: string;
  content: string;
}

export async function parsePackedFile(filePath: string): Promise<PackedFile[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  // 1. Try JSON parsing
  if (ext === '.json' || content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.files)) {
        return parsed.files.map((f: any) => ({
          path: f.path || '',
          content: f.content || ''
        }));
      }
    } catch (_e) {
      // fallback
    }
  }

  const files: PackedFile[] = [];

  // 2. XML regex parsing
  const xmlRegex = /<file path="([^"]+)">\r?\n?([\s\S]*?)\r?\n?<\/file>/g;
  let match;
  while ((match = xmlRegex.exec(content)) !== null) {
    files.push({
      path: match[1],
      content: match[2]
    });
  }

  if (files.length > 0) {
    return files;
  }

  // 3. Markdown regex parsing
  const mdRegex = /### File: ([^\r\n]+)\r?\n?```[a-zA-Z0-9-]*\r?\n?([\s\S]*?)\r?\n?```/g;
  while ((match = mdRegex.exec(content)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2]
    });
  }

  return files;
}

export function detectStackFromVirtualFiles(
  files: PackedFile[],
  hasGit: boolean
): ProjectStack {
  const stack: ProjectStack = {
    languages: [],
    frameworks: [],
    dependencies: [],
    hasGit: hasGit
  };

  if (files.some(f => f.path.includes('.gitignore') || f.path.includes('.git/'))) {
    stack.hasGit = true;
  }

  const getFileContent = (filename: string): string | undefined => {
    const file = files.find(f => {
      const p = f.path.replace(/\\/g, '/');
      return p === filename || p.endsWith('/' + filename);
    });
    return file?.content;
  };

  const hasExtension = (ext: string): boolean => {
    return files.some(f => f.path.toLowerCase().endsWith(ext.toLowerCase()));
  };

  for (const rule of LANGUAGE_RULES) {
    let matchesLanguage = false;

    for (const manifest of rule.manifests) {
      const content = getFileContent(manifest);
      if (content !== undefined) {
        matchesLanguage = true;

        if (manifest === 'package.json') {
          try {
            const pkg = JSON.parse(content);
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

        if (manifest === 'requirements.txt') {
          try {
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

        if (manifest === 'Cargo.toml') {
          try {
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

        if (manifest === 'go.mod') {
          try {
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

        if (manifest === 'composer.json') {
          try {
            const pkg = JSON.parse(content);
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

  stack.languages = [...new Set(stack.languages)];
  stack.frameworks = [...new Set(stack.frameworks)];
  stack.dependencies = [...new Set(stack.dependencies)];

  return stack;
}

export async function detectStackFromPackedFile(
  filePath: string,
  hasGit: boolean
): Promise<ProjectStack> {
  const files = await parsePackedFile(filePath);
  return detectStackFromVirtualFiles(files, hasGit);
}
