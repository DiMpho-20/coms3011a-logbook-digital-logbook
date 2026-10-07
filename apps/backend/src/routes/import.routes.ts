import { Router } from "express";
import { importLogbook } from "../controllers/import.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/import", requireAuth, importLogbook);

export default router;
