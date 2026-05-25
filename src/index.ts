#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { analyzeCommand } from './commands/analyze.js';
import { addCommand } from './commands/add.js';
import { packCommand } from './commands/pack.js';

import { select, text, intro, outro, isCancel } from '@clack/prompts';

const program = new Command();

program
  .name('skills')
  .description(pc.bold('SkillsCity CLI') + ' - Escanea tu proyecto e instala habilidades de IA')
  .version('0.1.6'); // aligned with package version

program
  .command('analyze')
  .description('Escanea la estructura del proyecto actual y recomienda habilidades')
  .action(async () => {
    await analyzeCommand();
  });

program
  .command('add <skillName>')
  .description('Instala una habilidad de SkillsCity en el proyecto actual')
  .action(async (skillName: string) => {
    await addCommand(skillName);
  });

program
  .command('pack [directory]')
  .description('Empaqueta el código del proyecto en un único archivo para asistentes de IA')
  .option('-o, --output <file>', 'Ruta del archivo de salida', 'skills-output.xml')
  .option('-s, --style <style>', 'Formato de salida (xml, markdown, json)', 'xml')
  .option('-e, --exclude <patterns...>', 'Patrones adicionales a excluir')
  .option('-c, --compress', 'Elimina comentarios y líneas vacías para ahorrar tokens', false)
  .option('-C, --code-compress', 'Compresión estructural: preserva firmas de funciones/clases, elimina implementaciones (usa ⋮----)', false)
  .action(async (directory: string | undefined, options: any) => {
    const targetDir = directory || process.cwd();
    await packCommand(targetDir, options);
  });

async function runInteractiveMenu() {
  intro(pc.bold(pc.cyan('SkillsCity CLI')));

  const choice = await select({
    message: 'Selecciona una acción para ejecutar:',
    options: [
      { value: 'analyze', label: 'Analizar proyecto', hint: 'Recomienda habilidades basadas en tu stack' },
      { value: 'add', label: 'Instalar habilidad', hint: 'Instala una habilidad de IA en el proyecto' },
      { value: 'pack', label: 'Empaquetar código', hint: 'Consolida y comprime el proyecto para asistentes de IA' },
      { value: 'exit', label: 'Salir' }
    ]
  });

  if (isCancel(choice) || choice === 'exit') {
    outro('¡Hasta luego!');
    process.exit(0);
  }

  if (choice === 'analyze') {
    await analyzeCommand();
  } else if (choice === 'add') {
    const skillName = await text({
      message: 'Introduce el nombre de la habilidad a instalar:',
      placeholder: 'github-assistant',
      validate(value) {
        if (!value.trim()) return 'El nombre de la habilidad no puede estar vacío';
      }
    });

    if (isCancel(skillName)) {
      outro('Operación cancelada');
      process.exit(0);
    }

    await addCommand(skillName);
  } else if (choice === 'pack') {
    const compressChoice = await select({
      message: 'Selecciona el tipo de compresión:',
      options: [
        { value: 'none', label: 'Sin compresión', hint: 'Consolida archivos tal como están' },
        { value: 'compress', label: 'Compresión simple', hint: 'Elimina comentarios y líneas vacías' },
        { value: 'code-compress', label: 'Compresión estructural (Recomendado)', hint: 'Preserva firmas usando Tree-Sitter' }
      ]
    });

    if (isCancel(compressChoice)) {
      outro('Operación cancelada');
      process.exit(0);
    }

    const options = {
      output: 'skills-output.xml',
      style: 'xml',
      compress: compressChoice === 'compress',
      codeCompress: compressChoice === 'code-compress'
    };

    await packCommand(process.cwd(), options as any);
  }
}

if (process.argv.length <= 2) {
  runInteractiveMenu().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  program.parse(process.argv);
}
