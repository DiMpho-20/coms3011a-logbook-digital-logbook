import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // text prints the summary table straight into the CI log, which is the
      // evidence a marker or the client can see without downloading anything.
      // lcov is the machine-readable form, uploaded as a workflow artifact.
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      // Vitest 4 removed coverage.all, so naming the sources here is what
      // makes an untested file report 0% instead of being absent from the
      // report entirely — the difference between an honest number and a
      // flattering one.
      include: ["src/**"],
      exclude: ["src/**/__tests__/**"],
    },
  },
});
