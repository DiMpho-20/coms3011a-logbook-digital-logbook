import { Router } from "express";
import {
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  updateEntryStatus,
} from "../controllers/entry.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { groupStats, timelineStats } from "../controllers/stats.controller.js";

const router = Router();

router.get("/projects/:projectId/entries", requireAuth, getEntries);
router.post("/projects/:projectId/entries", requireAuth, createEntry);
router.put("/entries/:id", requireAuth, updateEntry);
router.delete("/entries/:id", requireAuth, deleteEntry);
router.patch("/entries/:id/status", requireAuth, updateEntryStatus);
router.post("/projects/:projectId/stats/group", requireAuth, groupStats);
router.post("/projects/:projectId/stats/timeline", requireAuth, timelineStats);

export default router;
