import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.local/**', '**/coverage/**']
  },
  // ── Backend (Node.js) ──────────────────────────────────────────────────
  {
    files: ['apps/api/src/**/*.ts', 'apps/cloud-api/src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node
    },
    plugins: {
      'unused-imports': unusedImports
    },
    rules: {
      'no-duplicate-imports': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_'
        }
      ]
    }
  },
  // ── Frontend (React + TypeScript) ──────────────────────────────────────
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser
    },
    plugins: {
      'unused-imports': unusedImports,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      // Unused imports / vars
      'no-duplicate-imports': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_'
        }
      ],
      // React hooks
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'warn',
      // React refresh — warn on non-component exports so HMR stays fast
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Relax some TS rules for existing code
      '@typescript-eslint/no-empty-object-type': 'off'
    }
  },
  // ── Scripts ────────────────────────────────────────────────────────────
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      globals: globals.node
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-duplicate-imports': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ]
    }
  },
  eslintConfigPrettier
);
