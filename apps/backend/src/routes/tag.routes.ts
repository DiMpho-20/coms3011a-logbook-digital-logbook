import { Router } from "express";
import { getTags, deleteTag } from "../controllers/tag.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/tags", requireAuth, getTags);
router.delete("/tags/:id", requireAuth, deleteTag);

export default router;
