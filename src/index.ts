#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { analyzeCommand } from './commands/analyze.js';
import { addCommand } from './commands/add.js';
import { packCommand } from './commands/pack.js';

const program = new Command();

program
  .name('skills')
  .description(pc.bold('SkillsCity CLI') + ' - Escanea tu proyecto e instala habilidades de IA')
  .version('0.1.0');

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
  .action(async (directory: string | undefined, options: any) => {
    const targetDir = directory || process.cwd();
    await packCommand(targetDir, options);
  });

program.parse(process.argv);
