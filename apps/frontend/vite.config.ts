/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@logbook/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // text for the CI log, lcov for the uploaded artifact.
      // json-summary feeds the Gitea commit status; text the log, lcov the
      // artifact.
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // A failing run should still produce numbers; otherwise one broken test
      // means no coverage report at all.
      reportOnFailure: true,
      // Vitest 4 removed coverage.all, so the sources are named explicitly:
      // without this an untested file is simply missing from the report
      // rather than counted as 0%.
      include: ['src/**'],
      exclude: [
        'src/**/__tests__/**',
        'src/test-setup.ts',
        'src/main.tsx',
        'src/**/*.d.ts',
      ],
    },
  },
})