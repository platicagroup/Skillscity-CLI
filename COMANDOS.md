# Guía de Comandos de SkillsCity CLI

`skills` es la herramienta de línea de comandos de SkillsCity diseñada para escanear proyectos, instalar habilidades de Inteligencia Artificial y empaquetar código fuente de forma óptima para asistentes de IA.

---

## Índice
1. [Instalación](#instalación)
2. [Comando: `menu` / `interactive`](#comando-menu--interactive)
3. [Comando: `analyze`](#comando-analyze)
4. [Comando: `add`](#comando-add)
5. [Comando: `pack`](#comando-pack)
6. [Ejemplos de Uso](#ejemplos-de-uso)

---

## Instalación

Para ejecutar la herramienta en desarrollo, puedes usar:

```bash
npm run build
node dist/index.js <comando>
```

O enlazar el binario globalmente en tu sistema local:

```bash
npm link
skills <comando>
```

---

## Comando: `menu` / `interactive`

Abre una interfaz interactiva en la terminal que permite seleccionar y ejecutar cualquiera de los otros comandos disponibles (`analyze`, `add`, `pack` o `help`).

### Sintaxis
```bash
skills menu
```
o
```bash
skills interactive
```

### Descripción
Inicia una guía paso a paso basada en menús de selección en la terminal en lugar de requerir que escribas opciones manuales o flags de consola.

---

## Comando: `analyze`

Escanea la estructura, dependencias y tecnologías del proyecto actual para identificar el stack tecnológico y recomendar habilidades de IA compatibles.

### Sintaxis
```bash
skills analyze
```

### Descripción
Analiza archivos clave del repositorio (como `package.json`, `Cargo.toml`, `requirements.txt`, `go.mod`, etc.) y extensiones de archivos para deducir el lenguaje y los frameworks utilizados. Finalmente, muestra una lista recomendada de habilidades en la terminal.

---

## Comando: `add`

Instala una habilidad específica de SkillsCity en el proyecto actual.

### Sintaxis
```bash
skills add <skillName>
```

### Argumentos
*   `<skillName>` (Requerido): El nombre identificador de la habilidad a descargar e instalar.

### Descripción
Descarga la habilidad desde el repositorio de SkillsCity, copia sus instrucciones y recursos dentro de la configuración del proyecto, y registra la instalación en el archivo de bloqueo local (`.skills-lock.json`).

---

## Comando: `pack`

Empaqueta el código fuente del proyecto en un único archivo consolidado optimizado para que los asistentes de IA lean el contexto completo del repositorio.

### Sintaxis
```bash
skills pack [directory] [opciones]
```

### Argumentos
*   `[directory]` (Opcional): El directorio a empaquetar. Por defecto, se usa el directorio de trabajo actual (`process.cwd()`).

### Opciones

| Opción | Alternativa | Descripción | Valor por Defecto |
| :--- | :--- | :--- | :--- |
| `-o, --output <file>` | | Ruta del archivo consolidado de salida. | `skills-output.xml` |
| `-s, --style <style>` | | Formato del archivo resultante: `xml`, `markdown` o `json`. | `xml` |
| `-e, --exclude <pat...>` | | Patrones de archivo adicionales para ignorar durante el escaneo. | *(Ninguno)* |
| `-c, --compress` | | **Compresión simple**: Remueve comentarios y líneas vacías por medio de expresiones regulares para reducir tokens. | `false` |
| `-C, --code-compress` | | **Compresión estructural (Tree-Sitter AST)**: Preserva las firmas, propiedades y cabeceras de clases/interfaces/funciones, reemplazando el cuerpo de la lógica con `⋮----` para una reducción masiva de tokens. | `false` |

### Exclusión Automática
El comando `pack` omite automáticamente:
1. Directorios comunes y archivos de bloqueo: `.git`, `node_modules`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`.
2. Archivos definidos en `.gitignore`, `.skillsignore` o `.repomixignore`.
3. Archivos y recursos binarios (imágenes, PDFs, ejecutables, etc.).

---

## Ejemplos de Uso

### Empaquetado básico en formato XML
```bash
skills pack
```

### Empaquetado en formato Markdown excluyendo carpetas adicionales
```bash
skills pack . -s markdown -e "dist/*" "temp/*"
```

### Compresión Estructural con Tree-Sitter
Para empaquetar tu código reduciendo hasta un 70% de tokens manteniendo la firma de todas tus clases y métodos de forma estructurada:
```bash
skills pack . -C -o output-comprimido.xml
```

### Compresión Simple (solo remover comentarios)
```bash
skills pack . -c -o output-limpio.xml
```
