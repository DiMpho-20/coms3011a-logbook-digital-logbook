import { Response } from "express";
import { z } from "zod";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { markDueRemindersPushed, vapidPublicKey } from "../utils/push.js";

const subscriptionSchema = z.object({
  endpoint: z.url("endpoint must be a URL").max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2000) });

// ── GET /push/public-key — the key browsers subscribe with ───────────────
// { publicKey: null } means the server has no VAPID keys, so push is off.

export const getPublicKey = (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ publicKey: vapidPublicKey() });
};

// ── POST /push/subscriptions — register this device for push ─────────────

export const subscribe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!vapidPublicKey()) {
      return res.status(503).json({ error: "Push notifications aren't set up on this server" });
    }
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { endpoint, keys } = parsed.data;
    // An endpoint belongs to one browser; if someone else signs in on it,
    // it moves to them.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: req.userId! },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.userId! },
    });
    // Only reminders that fall due from now on are pushed.
    await markDueRemindersPushed(req.userId!);
    return res.status(201).json({ subscribed: true });
  } catch (error) {
    console.error("Failed to save push subscription:", error);
    return res.status(500).json({ error: "Failed to save push subscription" });
  }
};

// ── DELETE /push/subscriptions — stop pushing to this device ─────────────

export const unsubscribe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = unsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "endpoint is required" });
    }
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: req.userId! },
    });
    return res.status(204).send();
  } catch (error) {
    console.error("Failed to remove push subscription:", error);
    return res.status(500).json({ error: "Failed to remove push subscription" });
  }
};
