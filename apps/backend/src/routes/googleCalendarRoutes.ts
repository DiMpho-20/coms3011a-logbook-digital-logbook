import { Router, Request, Response } from "express";
import { google } from "googleapis";
import oauth2Client from "../services/googleCalendarService.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware.js";
import prisma from "../prisma.js";

const router = Router();

function ensureGoogleCalendarConfig() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

router.get("/connect", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  if (!ensureGoogleCalendarConfig()) {
    return res.status(500).json({
      error:
        "Google Calendar has not been configured yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to the backend environment.",
    });
  }

  const scopes = ["https://www.googleapis.com/auth/calendar.events"];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });

  return res.json({ url: authUrl });
});

router.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing Google OAuth code." });
  }

  if (!ensureGoogleCalendarConfig()) {
    return res.status(500).json({
      error:
        "Google Calendar has not been configured yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to the backend environment.",
    });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    return res.json({
      message: "Google Calendar OAuth callback received successfully.",
      connected: Boolean(tokens.access_token),
    });
  } catch (error) {
    console.error("Google Calendar callback error:", error);
    return res.status(500).json({ error: "Failed to exchange Google OAuth code." });
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
      select: {
        id: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ connected: Boolean(connection) });
  } catch (error) {
    console.error("Google Calendar status check failed:", error);
    return res.status(500).json({ error: "Failed to check Google Calendar connection status." });
  }
});

router.post("/sync", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const connection = await prisma.googleCalendarConnection.findUnique({
      where: { userId },
    });

    if (!connection) {
      return res.status(400).json({ error: "Google Calendar is not connected for this account." });
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const response = await calendar.calendarList.list({ maxResults: 1 });

    return res.json({
      message: "Google Calendar sync endpoint is available.",
      connected: true,
      calendarCount: response.data.items?.length ?? 0,
    });
  } catch (error) {
    console.error("Google Calendar sync failed:", error);
    return res.status(500).json({ error: "Google Calendar sync is not configured or failed during execution." });
  }
});

router.delete("/disconnect", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await prisma.googleCalendarConnection.deleteMany({
      where: { userId },
    });

    return res.json({ message: "Google Calendar connection removed." });
  } catch (error) {
    console.error("Google Calendar disconnect failed:", error);
    return res.status(500).json({ error: "Failed to remove Google Calendar connection." });
  }
});

export default router;
