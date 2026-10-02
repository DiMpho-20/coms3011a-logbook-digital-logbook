import { Router } from "express";
import { chatWithAssistant } from "../controllers/assistant.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { assistantLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/assistant/chat", requireAuth, assistantLimiter, chatWithAssistant);

export default router;
