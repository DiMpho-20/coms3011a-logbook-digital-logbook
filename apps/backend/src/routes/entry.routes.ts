import { Router } from "express";
import {
  getEntries,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  updateEntryStatus,
  getOpenEntries
} from "../controllers/entry.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { groupStats, timelineStats } from "../controllers/stats.controller.js";


const router = Router();

// User-scoped listing across projects. Declared before the project-scoped
// route so "/entries" is never mistaken for a project id.
router.get("/entries", requireAuth, listEntries);
router.get("/projects/:projectId/entries", requireAuth, getEntries);
router.post("/projects/:projectId/entries", requireAuth, createEntry);
router.put("/entries/:id", requireAuth, updateEntry);
router.delete("/entries/:id", requireAuth, deleteEntry);
router.patch("/entries/:id/status", requireAuth, updateEntryStatus);
router.post("/projects/:projectId/stats/group", requireAuth, groupStats);
router.post("/projects/:projectId/stats/timeline", requireAuth, timelineStats);
router.get("/me/open-entries", requireAuth, getOpenEntries);

export default router;
