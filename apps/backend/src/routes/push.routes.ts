import { Router } from "express";
import { getPublicKey, subscribe, unsubscribe } from "../controllers/push.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/push/public-key", requireAuth, getPublicKey);
router.post("/push/subscriptions", requireAuth, subscribe);
router.delete("/push/subscriptions", requireAuth, unsubscribe);

export default router;
