import { Router } from "express";
import { getLayout, resetLayout, saveLayout } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/dashboard/layout", requireAuth, getLayout);
router.put("/dashboard/layout", requireAuth, saveLayout);
router.delete("/dashboard/layout", requireAuth, resetLayout);

export default router;
