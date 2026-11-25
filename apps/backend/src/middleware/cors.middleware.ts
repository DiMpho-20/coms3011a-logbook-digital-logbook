import type { CorsOptions } from "cors";

/**
 * Which browser origins may call the API, and where that list comes from.
 *
 * This used to be a literal array ending in /^https:\/\/.*\.pages\.dev$/, sent
 * alongside `credentials: true`. That pattern matches every Cloudflare Pages
 * preview slug ever issued — including those of any other Pages user — so every
 * Pages deployment counted as this API's frontend and could read authenticated
 * responses. The allowlist now comes from the environment instead.
 *
 * Fail-closed: an unset CORS_ORIGINS in production means no cross-origin
 * browser request is granted. That is deliberate, and app.ts warns at startup
 * when it happens, because the alternative — a permissive default — is how the
 * wildcard got here in the first place.
 */

/** The two ports the Vite dev server uses, granted outside production only. */
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5174"];

export type CorsAllowlist = {
  /** Exact origins, compared as strings. */
  origins: string[];
  /** Optional pattern for hosts that cannot be listed in advance. */
  pattern?: RegExp;
};

/**
 * Read CORS_ORIGINS (comma-separated) and the optional CORS_ORIGIN_PATTERN.
 *
 * An invalid pattern is warned about and ignored rather than thrown: a typo in
 * a deployment variable should not stop the server from booting, and ignoring
 * it fails closed like an empty list does.
 */
export const readCorsAllowlist = (env: NodeJS.ProcessEnv = process.env): CorsAllowlist => {
  const configured = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origins = [...new Set([...(env.NODE_ENV === "production" ? [] : DEV_ORIGINS), ...configured])];

  const rawPattern = env.CORS_ORIGIN_PATTERN?.trim();
  let pattern: RegExp | undefined;
  if (rawPattern) {
    try {
      pattern = new RegExp(rawPattern);
    } catch {
      console.warn(
        `[cors] CORS_ORIGIN_PATTERN is not a valid regular expression and was ignored: ${rawPattern}`
      );
    }
  }

  return { origins, pattern };
};

/** Turn an allowlist into the options the `cors` middleware expects. */
export const corsOptionsFor = (allowlist: CorsAllowlist): CorsOptions => ({
  credentials: true,
  origin(origin, callback) {
    // curl, server-to-server calls and the health check send no Origin header.
    // There is nothing to grant or refuse, and refusing would break them.
    if (!origin) return callback(null, false);
    if (allowlist.origins.includes(origin)) return callback(null, true);
    if (allowlist.pattern?.test(origin)) return callback(null, true);

    // Refused by omission rather than by an error: the browser blocks the
    // response, and a disallowed origin gets no hint about what would pass.
    return callback(null, false);
  },
});
