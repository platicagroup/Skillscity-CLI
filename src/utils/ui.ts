import pc from 'picocolors';

// Utilidades de renderizado visual para la CLI de SkillsCity

export function printBanner(): void {
  console.log('');
  console.log(pc.black(pc.bold('  ███████╗██╗  ██╗██╗██╗     ██╗     ███████╗')));
  console.log(pc.black(pc.bold('  ██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝')));
  console.log(pc.black(pc.bold('  ███████╗█████╔╝ ██║██║     ██║     ███████╗')));
  console.log(pc.black(pc.bold('  ╚════██║██╔═██╗ ██║██║     ██║     ╚════██║')));
  console.log(pc.black(pc.bold('  ███████║██║  ██╗██║███████╗███████╗███████║')));
  console.log(pc.black(pc.bold('  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝')));
  console.log(pc.black(pc.bold('          ██████╗██╗████████╗██╗   ██╗')));
  console.log(pc.black(pc.bold('         ██╔════╝██║╚══██╔══╝╚██╗ ██╔╝')));
  console.log(pc.black(pc.bold('         ██║     ██║   ██║    ╚████╔╝ ')));
  console.log(pc.black(pc.bold('         ██║     ██║   ██║     ╚██╔╝  ')));
  console.log(pc.black(pc.bold('         ╚██████╗██║   ██║      ██║   ')));
  console.log(pc.black(pc.bold('          ╚═════╝╚═╝   ╚═╝      ╚═╝   ')));
  console.log(pc.dim('                       THE AI AGENT SKILLS HUB                       '));
  console.log('');
}

export function printHeader(title: string): void {
  const line = '━'.repeat(title.length + 4);
  console.log(pc.cyan(` ┏${line}┓`));
  console.log(pc.cyan(` ┃  ${pc.bold(pc.white(title))}  ┃`));
  console.log(pc.cyan(` ┗${line}┛`));
  console.log('');
}

export function printBox(title: string, lines: string[], color: 'cyan' | 'green' | 'yellow' | 'magenta' = 'cyan'): void {
  const paint = pc[color];
  const maxLineLength = lines.reduce((max, line) => {
    // Quitar códigos ANSI de color para calcular la longitud real del texto
    const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, '');
    return Math.max(max, cleanLine.length);
  }, 0);
  
  const width = Math.max(title.length + 4, maxLineLength + 4);
  
  // Imprimir borde superior
  console.log(paint(` ┌─ ${pc.bold(pc.white(title))} ${'─'.repeat(width - title.length - 2)}┐`));
  
  // Imprimir líneas de contenido
  for (const line of lines) {
    const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, '');
    const padding = ' '.repeat(width - cleanLine.length + 2);
    console.log(paint(` │  `) + line + padding + paint(`│`));
  }
  
  // Imprimir borde inferior
  console.log(paint(` └${'─'.repeat(width + 4)}┘`));
  console.log('');
}

export function printStep(num: string, title: string, desc: string): void {
  console.log(` ${pc.cyan(pc.bold(`[${num}]`))} ${pc.bold(pc.white(title))}`);
  console.log(`       ${pc.dim(desc)}`);
  console.log('');
}

export function printSuccess(message: string): void {
  console.log(` ${pc.green(pc.bold('✔'))} ${pc.white(message)}`);
}

export function printError(message: string): void {
  console.log(` ${pc.red(pc.bold('✘'))} ${pc.red(message)}`);
}

export function printInfo(message: string): void {
  console.log(` ${pc.blue(pc.bold('i'))} ${pc.dim(message)}`);
}
