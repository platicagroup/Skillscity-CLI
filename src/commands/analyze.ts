import { spinner, cancel, select, text, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { detectStack, type ProjectStack, detectStackFromPackedFile } from '../utils/detector.js';
import { printBanner, printBox } from '../utils/ui.js';
import fg from 'fast-glob';
import fs from 'fs-extra';
import path from 'path';

// Mapa de frameworks/dependencias conocidas a skills recomendadas de SkillsCity
interface SkillRecommendation {
  skillId: string;
  displayName: string;
  reason: string;
}

function buildRecommendations(stack: ProjectStack): SkillRecommendation[] {
  const recs: SkillRecommendation[] = [];

  if (stack.frameworks.includes('Next.js')) {
    recs.push({
      skillId: 'fullstack-workflow',
      displayName: 'fullstack-workflow',
      reason: 'Automatiza flujos de CI/CD, revisión de código y despliegue para Next.js'
    });
  }

  if (stack.frameworks.includes('React') || stack.frameworks.includes('Next.js')) {
    recs.push({
      skillId: 'react-component-architect',
      displayName: 'react-component-architect',
      reason: 'Genera y revisa componentes React con patrones de accesibilidad y rendimiento'
    });
  }

  if (stack.dependencies.includes('@supabase/supabase-js')) {
    recs.push({
      skillId: 'supabase-vector-sync',
      displayName: 'supabase-vector-sync',
      reason: 'Sincroniza y consulta colecciones vectoriales en Supabase'
    });
  }

  if (stack.dependencies.includes('prisma') || stack.dependencies.includes('@prisma/client')) {
    recs.push({
      skillId: 'prisma-schema-assistant',
      displayName: 'prisma-schema-assistant',
      reason: 'Asiste en el diseño de esquemas Prisma y migraciones automáticas'
    });
  }

  if (stack.frameworks.includes('FastAPI') || stack.frameworks.includes('Django')) {
    recs.push({
      skillId: 'python-api-guardian',
      displayName: 'python-api-guardian',
      reason: 'Audita endpoints Python, valida tipado y documenta automáticamente con OpenAPI'
    });
  }

  if (stack.frameworks.includes('Actix-Web') || stack.frameworks.includes('Axum')) {
    recs.push({
      skillId: 'rust-api-hardener',
      displayName: 'rust-api-hardener',
      reason: 'Refuerza la seguridad y el rendimiento de APIs escritas en Rust'
    });
  }

  if (stack.hasGit) {
    recs.push({
      skillId: 'github-assistant',
      displayName: 'github-assistant',
      reason: 'Optimiza mensajes de commit, gestión de PRs y revisión de código en Git'
    });
  }

  // Recomendación genérica de documentación si hay cualquier lenguaje detectado
  if (stack.languages.length > 0) {
    recs.push({
      skillId: 'auto-docs-generator',
      displayName: 'auto-docs-generator',
      reason: 'Genera documentación técnica automática para cualquier codebase'
    });
  }

  return recs;
}

export async function analyzeCommand() {
  printBanner();

  // Buscar archivos de empaquetado existentes en la raíz del proyecto
  let candidates: string[] = [];
  try {
    candidates = await fg(['skills-output.*', '*output.*', 'repomix.output.txt'], {
      cwd: process.cwd(),
      onlyFiles: true
    });
  } catch (_e) {}

  const choices = [];

  // Agregar candidatos existentes
  for (const c of candidates) {
    choices.push({
      value: c,
      label: `Utilizar archivo existente: ${c}`,
      hint: 'Analiza el stack basado en este archivo de empaquetado'
    });
  }

  // Agregar opción para crear uno nuevo
  choices.push({
    value: 'CREATE_NEW',
    label: 'Crear un nuevo empaquetado del repositorio',
    hint: 'Genera un nuevo empaquetado usando Tree-Sitter'
  });

  // Agregar opción para especificar ruta manual
  choices.push({
    value: 'CUSTOM_PATH',
    label: 'Introducir la ruta de otro archivo...',
    hint: 'Especifica una ruta personalizada en tu sistema'
  });

  const action = await select({
    message: 'Para realizar el análisis se requiere obligatoriamente un archivo de empaquetado de código:',
    options: choices
  });

  if (isCancel(action)) {
    console.log(`  ${pc.bold('!')} Operación cancelada.`);
    console.log('');
    process.exit(0);
  }

  let selectedPath = '';

  if (action === 'CREATE_NEW') {
    const { packCommand } = await import('./pack.js');
    // Generar nuevo empaquetado estructural por defecto
    await packCommand(process.cwd(), {
      output: 'skills-output.xml',
      style: 'xml',
      compress: false,
      codeCompress: true
    });
    selectedPath = path.resolve('skills-output.xml');
  } else if (action === 'CUSTOM_PATH') {
    const customPath = await text({
      message: 'Introduce la ruta del archivo de empaquetado (XML, JSON o Markdown):',
      placeholder: './skills-output.xml',
      validate(val) {
        if (!val.trim()) return 'La ruta no puede estar vacía';
      }
    });
    if (isCancel(customPath)) {
      console.log(`  ${pc.bold('!')} Operación cancelada.`);
      console.log('');
      process.exit(0);
    }
    selectedPath = path.resolve(customPath as string);
  } else {
    selectedPath = path.resolve(action as string);
  }

  if (!(await fs.pathExists(selectedPath))) {
    cancel(`El archivo de empaquetado no existe: ${selectedPath}`);
    process.exit(1);
  }

  const s = spinner();
  s.start(`Analizando stack desde el empaquetado: ${path.basename(selectedPath)}...`);

  let stack: ProjectStack;
  try {
    const hasGit = await fs.pathExists(path.join(process.cwd(), '.git'));
    stack = await detectStackFromPackedFile(selectedPath, hasGit);
  } catch (err) {
    s.stop('Error durante el análisis');
    cancel(`No se pudo completar el análisis del empaquetado: ${String(err)}`);
    process.exit(1);
  }

  // Pausa visual para una experiencia más premium
  await new Promise(resolve => setTimeout(resolve, 800));
  s.stop('Análisis completado');

  // --- Resumen del stack ---
  const summaryLines = [
    `Lenguajes  : ${stack.languages.length > 0 ? pc.bold(stack.languages.join(', ')) : pc.dim('No detectados')}`,
    `Frameworks : ${stack.frameworks.length > 0 ? pc.bold(stack.frameworks.join(', ')) : pc.dim('Ninguno')}`,
    `Git activo : ${stack.hasGit ? 'Sí' : 'No'}`,
    `Deps. tot. : ${pc.bold(String(stack.dependencies.length))}`
  ];
  printBox('Resumen del Proyecto (desde empaquetado)', summaryLines);

  // --- Recomendaciones ---
  const recommendations = buildRecommendations(stack);

  if (recommendations.length > 0) {
    const listLines: string[] = [];
    recommendations.forEach((r, i) => {
      listLines.push(`${pc.bold(String(i + 1) + '.')} ${pc.bold(r.displayName)}`);
      listLines.push(`   ${pc.dim(r.reason)}`);
      if (i < recommendations.length - 1) {
        listLines.push('');
      }
    });
    printBox(`${recommendations.length} Habilidades Recomendadas para tu Stack`, listLines);
  } else {
    printBox(
      'Sin Recomendaciones',
      [
        'No se encontraron recomendaciones automáticas específicas.',
        `Visita ${pc.underline('https://skillscity.dev')} para explorar el catálogo.`
      ]
    );
  }

  // --- Selección e Instalación Interactiva ---
  if (recommendations.length > 0) {
    const { multiselect, isCancel } = await import('@clack/prompts');
    const { addCommand } = await import('./add.js');

    const selectedSkills = await multiselect({
      message: '¿Deseas instalar alguna de estas habilidades ahora?',
      options: recommendations.map(r => ({
        value: r.skillId,
        label: r.displayName,
        hint: r.reason
      })),
      required: false
    });

    if (isCancel(selectedSkills)) {
      console.log(`  ${pc.bold('!')} Operación cancelada.`);
      console.log('');
      process.exit(0);
    }

    const skillsToInstall = selectedSkills as string[];
    if (skillsToInstall && skillsToInstall.length > 0) {
      console.log('');
      for (const skillId of skillsToInstall) {
        await addCommand(skillId);
      }
    } else {
      console.log(`  i No se seleccionó ninguna habilidad para instalar.`);
      console.log(`  » Ejecuta ${pc.bold('pnpm dlx skillscity-cli add <nombre-skill>')} en el futuro.`);
      console.log('');
    }
  } else {
    console.log(`  » Ejecuta ${pc.bold('pnpm dlx skillscity-cli add <nombre-skill>')} para instalar manualmente.`);
    console.log('');
  }
}

