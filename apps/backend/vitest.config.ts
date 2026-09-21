import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // These suites run against a live Neon database over the network, and CI
    // executes twelve files against it concurrently. Locally a test takes a
    // second or two; on a loaded runner one has been measured at 14.7s and a
    // setup hook at 17s. A 15s ceiling was therefore failing runs for
    // queueing rather than for anything wrong with the code.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // text prints the summary table straight into the CI log, which is the
      // evidence a marker or the client can see without downloading anything.
      // lcov is the machine-readable form, uploaded as a workflow artifact.
      // json-summary is what the CI step reads to publish a commit status;
      // text is for the log, lcov for the artifact.
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      // Write the report even when a test fails. A red run is exactly when
      // you want to know whether coverage moved, and without this a single
      // failure produces no numbers at all.
      reportOnFailure: true,
      // Vitest 4 removed coverage.all, so naming the sources here is what
      // makes an untested file report 0% instead of being absent from the
      // report entirely — the difference between an honest number and a
      // flattering one.
      include: ["src/**"],
      exclude: ["src/**/__tests__/**"],
    },
  },
});
