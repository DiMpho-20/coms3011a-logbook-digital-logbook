import { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { assistantChatSchema } from "../schemas/assistant.schema.js";
import { askAssistant, assistantConfigured } from "../utils/assistant.js";

// ── POST /assistant/chat — answer a question about using the app ─────────

export const chatWithAssistant = async (req: AuthenticatedRequest, res: Response) => {
  if (!assistantConfigured()) {
    return res.status(503).json({ error: "The help assistant is not set up on this server." });
  }

  const parsed = assistantChatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const { messages, currentPath } = parsed.data;
    return res.json(await askAssistant(messages, currentPath));
  } catch (error) {
    console.error("Help assistant failed:", error);
    return res.status(502).json({ error: "The assistant couldn't answer right now. Please try again shortly." });
  }
};
