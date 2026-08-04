import js from '@eslint/js'
import { defineConfig as defineESLintConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tanstackQuery from '@tanstack/eslint-plugin-query'
import tseslint from 'typescript-eslint'

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
          alwaysTryTypes: true,
        },
      },
      'import-x/internal-regex': '^@(app|pages|features|entities|shared)/',
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'import-x': importX,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
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
      'import-x/no-duplicates': 'error',
      'import-x/first': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
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
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  prettier,
])
