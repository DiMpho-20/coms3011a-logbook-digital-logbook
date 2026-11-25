import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth.js";
import prisma from "../prisma.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Accept a request only if its token is valid *and* still current.
 *
 * The signature check alone used to be the whole test, which made a session
 * token a bearer credential that could not be withdrawn: signing out cleared
 * localStorage and nothing else, so a copied token kept working for the rest of
 * its seven days, and a password reset left every stolen token alive.
 *
 * The version comparison is what fixes that, and it costs one indexed read on
 * `users.id` per authenticated request — the price of a stateless token being
 * revocable at all. A failed read rejects rather than falls through, so a
 * database outage answers 500 through the global error handler instead of
 * silently admitting the request.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized access: Token missing" });
    return;
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ error: "Unauthorized access: Invalid or expired token" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { tokenVersion: true },
  });

  if (!user) {
    // The account was deleted while its token was still in a browser.
    res.status(401).json({ error: "Unauthorized access: Invalid or expired token" });
    return;
  }

  if (user.tokenVersion !== decoded.tokenVersion) {
    // Signed out, or the password was reset, since this token was issued.
    res.status(401).json({ error: "Session ended. Please sign in again." });
    return;
  }

  req.userId = decoded.userId;
  next();
}
