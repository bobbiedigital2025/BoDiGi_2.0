/**
 * CI lint gate — the #310 crash class only.
 * React-hooks + compiler rules are HARD ERRORS here: these are the rules
 * whose violations ship as runtime crashes (conditional hooks, impure
 * render, sync setState in effects). Style debt stays in the non-blocking
 * full lint until the remaining 65 other-class errors are burned.
 * See: Oct 12-13 react-hooks burn (48f00e3, 418604f, c6302ea, c846da4).
 */
import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import nextPlugin from '@next/eslint-plugin-next';

const preset = reactHooks.configs.flat['recommended-latest'];

export default [
  { ignores: ['.next/**', 'out/**', 'build/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // @next registered so in-source eslint-disable comments for @next/*
    // rules resolve (they error as "rule not found" otherwise).
    plugins: { ...preset.plugins, '@next': nextPlugin },
    rules: preset.rules,
  },
];
