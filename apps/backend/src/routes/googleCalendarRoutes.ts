import { Router, Request, Response } from "express";
import { createGoogleCalendarClient, syncDueDates } from "../services/googleCalendarService.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware.js";
import prisma from "../prisma.js";
import { generateOAuthState, verifyOAuthState } from "../utils/auth.js";
import { decryptGoogleToken, encryptGoogleToken } from "../utils/googleTokens.js";

const router = Router();

const NOT_CONFIGURED =
  "Google Calendar has not been configured yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and GOOGLE_TOKEN_ENCRYPTION_KEY to the backend environment.";

function ensureGoogleCalendarConfig() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  );
}

/**
 * The callback is a browser navigation from Google, not an API call from the
 * SPA, so it reports its outcome by sending the user back to the Calendar page.
 */
function redirectToCalendar(res: Response, outcome: "connected" | "error" | "denied") {
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  return res.redirect(`${appUrl}/calendar?calendar=${outcome}`);
}

/** Google rejects a refresh token the user revoked or that has expired. */
function isRevokedGrant(error: unknown): boolean {
  const e = error as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error === "invalid_grant" || /invalid_grant/.test(e?.message ?? "");
}

router.get("/connect", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureGoogleCalendarConfig()) {
    return res.status(500).json({ error: NOT_CONFIGURED });
  }

  const scopes = ["https://www.googleapis.com/auth/calendar.events"];

  const authUrl = createGoogleCalendarClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state: generateOAuthState(req.userId!),
  });

  return res.json({ url: authUrl });
});

router.get("/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  // The user pressed "Cancel" on Google's consent screen.
  if (error === "access_denied") {
    return redirectToCalendar(res, "denied");
  }

  if (!code || typeof code !== "string" || !state || typeof state !== "string") {
    return res.status(400).json({ error: "Missing Google OAuth code or state." });
  }

  if (!ensureGoogleCalendarConfig()) {
    return res.status(500).json({ error: NOT_CONFIGURED });
  }

  // State is the only thing tying this browser redirect to a logbook account;
  // without a valid one, the code could be bound to someone else's account.
  const userId = verifyOAuthState(state);
  if (!userId) {
    return res.status(401).json({ error: "Google Calendar authorization has expired or is invalid. Please try again." });
  }

  try {
    const oauth2Client = createGoogleCalendarClient();
    const { tokens } = await oauth2Client.getToken(code);
    const existing = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token
      ?? (existing ? decryptGoogleToken(existing.refreshToken) : undefined);

    if (!accessToken || !refreshToken) {
      return redirectToCalendar(res, "error");
    }

    const data = {
      accessToken: encryptGoogleToken(accessToken),
      refreshToken: encryptGoogleToken(refreshToken),
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    };
    await prisma.googleCalendarConnection.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return redirectToCalendar(res, "connected");
  } catch (error) {
    console.error("Google Calendar callback error:", error);
    return redirectToCalendar(res, "error");
  }
});

router.get("/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const connection = await prisma.googleCalendarConnection.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });

    return res.json({
      configured: ensureGoogleCalendarConfig(),
      connected: Boolean(connection),
      connectedAt: connection?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("Google Calendar status check failed:", error);
    return res.status(500).json({ error: "Failed to check Google Calendar connection status." });
  }
});

router.post("/sync", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!ensureGoogleCalendarConfig()) {
    return res.status(500).json({ error: NOT_CONFIGURED });
  }

  try {
    const connection = await prisma.googleCalendarConnection.findUnique({
      where: { userId },
    });

    if (!connection) {
      return res.status(400).json({ error: "Google Calendar is not connected for this account." });
    }

    let credentials;
    try {
      credentials = {
        access_token: decryptGoogleToken(connection.accessToken),
        refresh_token: decryptGoogleToken(connection.refreshToken),
        expiry_date: connection.expiryDate?.getTime(),
      };
    } catch {
      // Stored under a different (or no) encryption key — unusable, so the
      // user has to grant access again.
      await prisma.googleCalendarConnection.deleteMany({ where: { userId } });
      return res.status(409).json({ error: "Your Google Calendar connection needs to be renewed. Please connect again." });
    }

    const oauth2Client = createGoogleCalendarClient();
    oauth2Client.setCredentials(credentials);
    // googleapis refreshes expired access tokens transparently; persist the
    // new ones (encrypted) so this user's stored credentials stay current.
    oauth2Client.on("tokens", (tokens) => {
      if (!tokens.access_token) return;
      prisma.googleCalendarConnection
        .update({
          where: { userId },
          data: {
            accessToken: encryptGoogleToken(tokens.access_token),
            ...(tokens.refresh_token && { refreshToken: encryptGoogleToken(tokens.refresh_token) }),
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          },
        })
        .catch((err) => console.error("Failed to persist refreshed Google tokens:", err));
    });

    const result = await syncDueDates(userId, oauth2Client);

    return res.json({ message: "Due dates synced to Google Calendar.", ...result });
  } catch (error) {
    if (isRevokedGrant(error)) {
      // Access was revoked from the Google account side; the stored tokens
      // are useless, so drop them and let the user reconnect. (409, not 401:
      // the logbook session itself is fine.)
      await prisma.googleCalendarConnection.deleteMany({ where: { userId } });
      return res.status(409).json({ error: "Google Calendar access was revoked. Please connect again." });
    }
    console.error("Google Calendar sync failed:", error);
    return res.status(502).json({ error: "Google Calendar sync failed. Please try again." });
  }
});

router.delete("/disconnect", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
    if (connection) {
      // Best effort: also revoke the grant at Google so the app no longer
      // appears under the user's third-party access. Local removal wins either way.
      try {
        await createGoogleCalendarClient().revokeToken(decryptGoogleToken(connection.refreshToken));
      } catch (error) {
        console.warn("Google token revocation failed:", error);
      }
      await prisma.googleCalendarConnection.deleteMany({ where: { userId } });
    }

    return res.json({ message: "Google Calendar connection removed." });
  } catch (error) {
    console.error("Google Calendar disconnect failed:", error);
    return res.status(500).json({ error: "Failed to remove Google Calendar connection." });
  }
});

export default router;
