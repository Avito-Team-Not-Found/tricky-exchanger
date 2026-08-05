import js from '@eslint/js';
import { defineConfig as defineESLintConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import tseslint from 'typescript-eslint';

export default defineESLintConfig([
  globalIgnores(['dist', 'node_modules', 'coverage']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tanstackQuery.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        File: 'readonly',
        Blob: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLElement: 'readonly',
        RequestInit: 'readonly',
      },
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          // Алиасы @app/@pages/... берутся из tsconfig, иначе import-x не находит импортированные модули
          alwaysTryTypes: true,
        },
      },
      // Алиасы FSD-слоёв считаются «внутренними» импортами, чтобы группировать их отдельно от внешних пакетов
      'import-x/internal-regex': '^@(app|pages|features|entities|shared)/',
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'import-x': importX,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Файл с компонентом и не-компонентом ломает HMR Vite: состояние модуля теряется при правке
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // message/notification/Modal из antd не подхватывают тему ConfigProvider — нужен App.useApp()
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'antd',
              importNames: ['message', 'notification', 'Modal'],
              message:
                'Use App.useApp() to access message/notification/modal so they inherit the theme.',
            },
          ],
        },
      ],
      // Порядок импортов по FSD: react → пакеты → алиасы слоёв → относительные пути, с пустой строкой между группами
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'unknown'],
          pathGroups: [
            { pattern: 'react', group: 'builtin', position: 'before' },
            { pattern: '@app/**', group: 'external', position: 'after' },
            { pattern: '@pages/**', group: 'external', position: 'after' },
            { pattern: '@features/**', group: 'external', position: 'after' },
            { pattern: '@entities/**', group: 'external', position: 'after' },
            { pattern: '@shared/**', group: 'external', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always',
        },
      ],
      // Повторный импорт одного модуля в одном файле — след неудачного слияния веток, а не осознанное решение
      'import-x/no-duplicates': 'error',
      // Импорты стоят только в начале файла: перенос в середину ломает порядок побочных эффектов и чтение кода
      'import-x/first': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // FSD: слой импортирует только из нижних слоёв: shared всем, entities страницам/фичам, features только страницам
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/shared',
              from: ['./src/app', './src/pages', './src/features', './src/entities'],
            },
            {
              target: './src/entities',
              from: ['./src/pages', './src/features'],
            },
            {
              target: './src/features',
              from: ['./src/pages'],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['mock/**/*.js'],
    languageOptions: {
      // У mock-сервера есть свои глобалы
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  // Отключает правила форматирования, дублирующие Prettier, во избежание конфликтов
  prettier,
]);
