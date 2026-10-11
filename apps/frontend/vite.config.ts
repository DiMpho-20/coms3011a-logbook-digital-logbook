/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@logbook/shared': path.resolve(import.meta.dirname, '../../packages/shared/src'),
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

  build: {
    rollupOptions: {
      output: {
        // Framework code only changes when a dependency is upgraded, while
        // the app shell changes on every deploy; keeping the two in separate
        // chunks keeps returning visitors' caches warm for the big one.
        advancedChunks: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    // Worker threads rather than the default child processes, and at most two
    // at once. On a loaded CI runner the default pool timed out starting its
    // workers ("Timeout waiting for worker to respond"), every file failed
    // before running, and the run published 0% frontend coverage.
    pool: 'threads',
    maxWorkers: 2,
    // Stays comfortably above the Testing Library ceiling set in
    // src/test-setup.ts (15s), so a slow-but-passing find reports its own
    // result rather than being killed by the per-test clock first. Raised
    // with that ceiling on 2026-09-27; the two must move together.
    testTimeout: 30_000,
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
        // Stylesheets have no statements to cover, and the v8 provider hands
        // them to rolldown as JavaScript: index.css opens with an @import,
        // which fails to parse and prints an error into every run.
        'src/**/*.css',
      ],
      // A floor just under the current 80.5% of lines rather than at it:
      // features land in this workspace faster than their tests, and a floor
      // at exactly 80 would turn every such landing red. It still fails a
      // real regression; the reported number is what the rubric reads.
      thresholds: { lines: 78 },
    },
  },
})