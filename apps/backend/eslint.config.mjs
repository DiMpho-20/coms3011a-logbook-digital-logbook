import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  {
    rules: {
      // The backend deliberately uses `any` where Prisma rows and raw SQL
      // results cross into handlers — shapes the type system does not carry.
      // A warning keeps those sites visible without failing the lint gate;
      // every other error still fails it.
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
);