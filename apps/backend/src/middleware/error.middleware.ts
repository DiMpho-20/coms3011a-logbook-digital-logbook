import type { NextFunction, Request, Response } from "express";

/**
 * JSON for the two failures no controller answers: a path no router matched,
 * and anything thrown or forwarded to next().
 *
 * The global handler earns its place on Express 5, which forwards rejected
 * promises from async handlers here automatically. Before this, such a
 * rejection was an unhandled rejection and a request that never answered.
 */

/** What the client is told when the server is at fault. Nothing else. */
const SERVER_FAULT_MESSAGE = "Internal server error";

type HttpishError = Error & { status?: unknown; statusCode?: unknown };

/**
 * A status the error itself carries, if it carries a usable one. `http-errors`
 * and most hand-rolled errors set `status` or `statusCode`; anything outside
 * 4xx–5xx is ignored rather than passed to res.status().
 */
const explicitStatus = (error: HttpishError): number | undefined => {
  for (const candidate of [error.status, error.statusCode]) {
    if (typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) {
      return candidate;
    }
  }
  return undefined;
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ error: "Not found" });
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (res.headersSent) {
    // A streaming or partially written response: Express hands the rest to the
    // default handler, which closes the connection.
    next(error);
    return;
  }

  const asError = error instanceof Error ? (error as HttpishError) : undefined;
  const status = (asError && explicitStatus(asError)) ?? 500;

  if (status >= 500) {
    // The stack goes to the log and stays there. A 500 message can carry a
    // query fragment, a file path or a driver's connection string, none of
    // which the caller can act on (see P1-5 in the November 2026 audit).
    console.error(`[${req.method} ${req.originalUrl}]`, error);
    res.status(status).json({ error: SERVER_FAULT_MESSAGE });
    return;
  }

  // A 4xx is the caller's to fix, so its message is the useful part.
  res.status(status).json({ error: asError?.message ?? SERVER_FAULT_MESSAGE });
};
