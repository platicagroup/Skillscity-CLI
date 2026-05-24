// Motor de reglas para la detección de lenguajes y frameworks.
// Para agregar un nuevo lenguaje, simplemente añadir una entrada al array.

export interface LanguageRule {
  language: string;
  manifests: string[];
  extensions: string[];
  frameworkRules?: Array<{
    framework: string;
    manifestIndicator?: string; // Clave de dependencia que indica el framework
  }>;
}

export const LANGUAGE_RULES: LanguageRule[] = [
  {
    language: 'TypeScript',
    manifests: ['tsconfig.json'],
    extensions: ['.ts', '.tsx'],
    frameworkRules: [
      { framework: 'Next.js', manifestIndicator: 'next' },
      { framework: 'Vite', manifestIndicator: 'vite' },
      { framework: 'React', manifestIndicator: 'react' },
      { framework: 'NestJS', manifestIndicator: '@nestjs/core' },
      { framework: 'tRPC', manifestIndicator: '@trpc/server' }
    ]
  },
  {
    language: 'JavaScript',
    manifests: ['package.json', 'jsconfig.json', 'deno.json'],
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    frameworkRules: [
      { framework: 'Express', manifestIndicator: 'express' },
      { framework: 'React', manifestIndicator: 'react' },
      { framework: 'Vue', manifestIndicator: 'vue' },
      { framework: 'Svelte', manifestIndicator: 'svelte' }
    ]
  },
  {
    language: 'Python',
    manifests: ['requirements.txt', 'pyproject.toml', 'Pipfile', 'conda.yaml'],
    extensions: ['.py'],
    frameworkRules: [
      { framework: 'FastAPI', manifestIndicator: 'fastapi' },
      { framework: 'Django', manifestIndicator: 'django' },
      { framework: 'Flask', manifestIndicator: 'flask' },
      { framework: 'LangChain', manifestIndicator: 'langchain' }
    ]
  },
  {
    language: 'Rust',
    manifests: ['Cargo.toml'],
    extensions: ['.rs'],
    frameworkRules: [
      { framework: 'Actix-Web', manifestIndicator: 'actix-web' },
      { framework: 'Axum', manifestIndicator: 'axum' },
      { framework: 'Tauri', manifestIndicator: 'tauri' }
    ]
  },
  {
    language: 'Go',
    manifests: ['go.mod'],
    extensions: ['.go'],
    frameworkRules: [
      { framework: 'Gin', manifestIndicator: 'github.com/gin-gonic/gin' },
      { framework: 'Fiber', manifestIndicator: 'github.com/gofiber/fiber' },
      { framework: 'Echo', manifestIndicator: 'github.com/labstack/echo' }
    ]
  },
  {
    language: 'Java',
    manifests: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    extensions: ['.java', '.kt'],
    frameworkRules: [
      { framework: 'Spring Boot', manifestIndicator: 'spring-boot' },
      { framework: 'Quarkus', manifestIndicator: 'quarkus' }
    ]
  },
  {
    language: 'PHP',
    manifests: ['composer.json'],
    extensions: ['.php'],
    frameworkRules: [
      { framework: 'Laravel', manifestIndicator: 'laravel/framework' },
      { framework: 'Symfony', manifestIndicator: 'symfony/symfony' }
    ]
  },
  {
    language: 'Ruby',
    manifests: ['Gemfile'],
    extensions: ['.rb'],
    frameworkRules: [
      { framework: 'Ruby on Rails', manifestIndicator: 'rails' }
    ]
  }
];
