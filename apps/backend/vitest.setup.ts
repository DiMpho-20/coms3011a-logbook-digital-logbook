/**
 * Test-run defaults for secrets the application refuses to start without.
 *
 * TWO_FACTOR_ENCRYPTION_KEY is mandatory in a real deployment — /2fa/setup
 * answers 503 rather than writing a secret it cannot protect (BUG-004). Under
 * test the value itself is arbitrary, so a deterministic one is supplied here
 * instead of making every contributor and the CI runner carry a secret whose
 * only job is to be present. A real key set in the environment still wins.
 */
process.env.TWO_FACTOR_ENCRYPTION_KEY ??= "vitest-two-factor-encryption-key";
