import { intro, outro, text, confirm, spinner, note, isCancel, cancel } from '@clack/prompts';
import path from 'path';
import pc from 'picocolors';
import { writeJsonFile, updateSkillsLockfile } from '../utils/filesystem.js';

// ---------------------------------------------------------------------------
// Tipos de la definición de skill
// ---------------------------------------------------------------------------

interface InteractiveQuestion {
  name: string;
  message: string;
  type: 'text' | 'confirm';
  default?: string;
}

interface SkillDefinition {
  name: string;
  version: string;
  description: string;
  interactiveQuestions?: InteractiveQuestion[];
  promptTemplate: string;
}

// ---------------------------------------------------------------------------
// Catálogo local de skills conocidas (en producción: consultado desde la API)
// ---------------------------------------------------------------------------

const SKILL_CATALOG: Record<string, SkillDefinition> = {
  'fullstack-workflow': {
    name: 'fullstack-workflow',
    version: '1.2.0',
    description: 'Automatiza flujos de CI/CD, revisión de código y despliegue para proyectos Next.js',
    interactiveQuestions: [
      { name: 'targetBranch', message: 'Rama principal del proyecto', type: 'text', default: 'main' },
      { name: 'outputPath', message: 'Ruta de salida para archivos del agente', type: 'text', default: './src/agents' },
      { name: 'enableCI', message: 'Habilitar integración continua automatica', type: 'confirm' }
    ],
    promptTemplate:
      'Eres un agente de flujo de trabajo para la rama {{targetBranch}}. Gestiona CI/CD y revisa PRs en el directorio {{outputPath}}.'
  },
  'github-assistant': {
    name: 'github-assistant',
    version: '1.0.3',
    description: 'Optimiza mensajes de commit, gestión de PRs y revisión de código',
    interactiveQuestions: [
      { name: 'repoOwner', message: 'Nombre de usuario u organización en GitHub', type: 'text' },
      { name: 'repoName', message: 'Nombre del repositorio', type: 'text' },
      { name: 'outputPath', message: 'Ruta de salida para el agente', type: 'text', default: './src/agents' }
    ],
    promptTemplate:
      'Eres un asistente de Git para el repositorio {{repoOwner}}/{{repoName}}. Tu archivo de configuracion se encuentra en {{outputPath}}.'
  },
  'supabase-vector-sync': {
    name: 'supabase-vector-sync',
    version: '2.0.1',
    description: 'Sincroniza y consulta colecciones vectoriales en Supabase',
    interactiveQuestions: [
      { name: 'supabaseUrl', message: 'URL del proyecto Supabase', type: 'text', default: 'https://<project>.supabase.co' },
      { name: 'tableName', message: 'Nombre de la tabla de vectores', type: 'text', default: 'embeddings' },
      { name: 'outputPath', message: 'Ruta de salida para el agente', type: 'text', default: './src/agents' }
    ],
    promptTemplate:
      'Eres un agente de sincronizacion vectorial conectado a {{supabaseUrl}}. Gestionas la tabla {{tableName}} en {{outputPath}}.'
  },
  'react-component-architect': {
    name: 'react-component-architect',
    version: '1.1.0',
    description: 'Genera y revisa componentes React con patrones de accesibilidad y rendimiento',
    interactiveQuestions: [
      { name: 'componentDir', message: 'Directorio donde viven tus componentes', type: 'text', default: './src/components' },
      { name: 'outputPath', message: 'Ruta de salida para el agente', type: 'text', default: './src/agents' }
    ],
    promptTemplate:
      'Eres un arquitecto de componentes React. Analiza y mejora los componentes en {{componentDir}}. Guarda la configuracion en {{outputPath}}.'
  },
  'auto-docs-generator': {
    name: 'auto-docs-generator',
    version: '1.0.0',
    description: 'Genera documentación técnica automática para cualquier codebase',
    interactiveQuestions: [
      { name: 'srcPath', message: 'Directorio raiz del codigo fuente', type: 'text', default: './src' },
      { name: 'docsPath', message: 'Directorio destino de la documentacion', type: 'text', default: './docs' },
      { name: 'outputPath', message: 'Ruta de salida para el agente', type: 'text', default: './src/agents' }
    ],
    promptTemplate:
      'Eres un generador de documentacion. Lee el codigo en {{srcPath}} y genera la documentacion en {{docsPath}}. Configuracion en {{outputPath}}.'
  }
};

// ---------------------------------------------------------------------------
// Helper: reemplaza {{placeholder}} en una plantilla
// ---------------------------------------------------------------------------

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ---------------------------------------------------------------------------
// Comando principal: add
// ---------------------------------------------------------------------------

export async function addCommand(skillName: string) {
  intro(pc.black(pc.bgCyan(` SKILLSCITY - INSTALAR: ${skillName} `)));

  const s = spinner();
  s.start(`Buscando la definicion de "${skillName}" en el catalogo...`);
  await new Promise(resolve => setTimeout(resolve, 900));

  // Buscar en catalogo local; en produccion -> fetch a la API
  const skillDef: SkillDefinition | undefined = SKILL_CATALOG[skillName] ?? {
    name: skillName,
    version: '1.0.0',
    description: `Skill personalizada: ${skillName}`,
    interactiveQuestions: [
      { name: 'outputPath', message: 'Ruta donde deseas guardar la skill', type: 'text', default: './src/agents' }
    ],
    promptTemplate: `Eres un agente de la skill "${skillName}". Configurado en {{outputPath}}.`
  };

  s.stop(pc.green('Definicion obtenida'));

  // Mostrar descripcion de la skill
  note(
    [
      `Nombre   : ${pc.cyan(skillDef.name)}`,
      `Version  : ${pc.yellow(skillDef.version)}`,
      `Descripcion: ${skillDef.description}`
    ].join('\n'),
    'Detalles de la Skill'
  );

  // Preguntar confirmacion antes de proceder
  const proceed = await confirm({ message: `Deseas configurar e instalar "${skillDef.name}"?` });
  if (isCancel(proceed) || !proceed) {
    cancel('Instalacion cancelada.');
    process.exit(0);
  }

  // ---------------------------------------------------------------------------
  // Ejecutar preguntas interactivas
  // ---------------------------------------------------------------------------
  const answers: Record<string, string> = {};

  if (skillDef.interactiveQuestions) {
    for (const q of skillDef.interactiveQuestions) {
      if (q.type === 'text') {
        const response = await text({
          message: q.message,
          placeholder: q.default ?? '',
          defaultValue: q.default
        });
        if (isCancel(response)) {
          cancel('Instalacion cancelada.');
          process.exit(0);
        }
        answers[q.name] = response as string;
      } else if (q.type === 'confirm') {
        const response = await confirm({ message: q.message });
        if (isCancel(response)) {
          cancel('Instalacion cancelada.');
          process.exit(0);
        }
        answers[q.name] = String(response);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Inyectar, generar archivo y actualizar lockfile
  // ---------------------------------------------------------------------------
  s.start('Inyectando configuracion y generando archivos...');
  await new Promise(resolve => setTimeout(resolve, 800));

  const finalPrompt = interpolate(skillDef.promptTemplate, answers);
  const outDir = path.resolve(answers['outputPath'] ?? './src/agents');
  const outFile = path.join(outDir, `${skillDef.name}.skill.json`);

  await writeJsonFile(outFile, {
    name: skillDef.name,
    version: skillDef.version,
    description: skillDef.description,
    configuredPrompt: finalPrompt,
    parameters: answers,
    installedAt: new Date().toISOString()
  });

  // Actualizar skills.lock.json en la raiz del proyecto
  await updateSkillsLockfile(process.cwd(), skillDef.name, skillDef.version);

  s.stop(pc.green('Instalacion completada'));

  note(
    [
      `Archivo  : ${pc.cyan(outFile)}`,
      `Lockfile : ${pc.dim('skills.lock.json')} actualizado`
    ].join('\n'),
    'Archivos Generados'
  );

  outro(
    `La skill ${pc.bold(pc.cyan(skillDef.name))} v${skillDef.version} esta lista. ` +
    `Consulta la documentacion en ${pc.underline('https://skillscity.dev/docs')}`
  );
}
