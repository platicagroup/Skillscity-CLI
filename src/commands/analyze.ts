import { spinner, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { detectStack, type ProjectStack } from '../utils/detector.js';
import { printBanner, printBox } from '../utils/ui.js';

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

  const s = spinner();
  s.start('Escaneando la estructura de tu proyecto...');

  let stack: ProjectStack;
  try {
    stack = await detectStack(process.cwd());
  } catch (err) {
    s.stop(pc.red('Error durante el escaneo'));
    cancel(`No se pudo completar el análisis: ${String(err)}`);
    process.exit(1);
  }

  // Pausa visual para una experiencia más premium
  await new Promise(resolve => setTimeout(resolve, 800));
  s.stop(pc.green('Escaneo completado'));

  // --- Resumen del stack ---
  const summaryLines = [
    `Lenguajes  : ${stack.languages.length > 0 ? pc.cyan(stack.languages.join(', ')) : pc.dim('No detectados')}`,
    `Frameworks : ${stack.frameworks.length > 0 ? pc.cyan(stack.frameworks.join(', ')) : pc.dim('Ninguno')}`,
    `Git activo : ${stack.hasGit ? pc.green('Sí') : pc.red('No')}`,
    `Deps. tot. : ${pc.yellow(String(stack.dependencies.length))}`
  ];
  printBox('Resumen del Proyecto', summaryLines, 'cyan');

  // --- Recomendaciones ---
  const recommendations = buildRecommendations(stack);

  if (recommendations.length > 0) {
    const listLines: string[] = [];
    recommendations.forEach((r, i) => {
      listLines.push(`${pc.bold(pc.yellow(String(i + 1) + '.'))} ${pc.cyan(pc.bold(r.displayName))}`);
      listLines.push(`   ${pc.dim(r.reason)}`);
      if (i < recommendations.length - 1) {
        listLines.push('');
      }
    });
    printBox(`${recommendations.length} Habilidades Recomendadas para tu Stack`, listLines, 'magenta');
  } else {
    printBox(
      'Sin Recomendaciones',
      [
        'No se encontraron recomendaciones automáticas específicas.',
        `Visita ${pc.underline(pc.cyan('https://skillscity.dev'))} para explorar el catálogo.`
      ],
      'yellow'
    );
  }

  console.log(`  ${pc.bold(pc.green('»'))} Ejecuta ${pc.bold(pc.cyan('pnpm dlx skillscity-cli add <nombre-skill>'))} para instalar una habilidad.`);
  console.log('');
}

