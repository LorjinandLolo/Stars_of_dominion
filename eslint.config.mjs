// ESLint 9 flat config. `next lint` was removed in Next 16, so `npm run lint`
// calls eslint directly; the Next presets ship as flat-config arrays.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'node_modules/**',
      'lib/generated/**',
      'next-env.d.ts',
      'coverage/**',
    ],
  },
  {
    rules: {
      // The codebase leans on `any` at the world/store boundary on purpose
      // (JSON columns, snapshot shapes). Flag it, don't fail the build on it.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn',
      // Legacy `useEffect(() => setMounted(true), [])` portals and similar
      // predate the React 19 compiler rules; surface them without failing lint.
      'react-hooks/set-state-in-effect': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
];
