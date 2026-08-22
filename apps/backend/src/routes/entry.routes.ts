import { Router } from "express";
import {
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
} from "../controllers/entry.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/projects/:projectId/entries", requireAuth, getEntries);
router.post("/projects/:projectId/entries", requireAuth, createEntry);
router.put("/entries/:id", requireAuth, updateEntry);
router.delete("/entries/:id", requireAuth, deleteEntry);

export default router;
