import { Router } from "express";
import {
  getEntries,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  updateEntryStatus,
} from "../controllers/entry.controller.js";
import {
  getEntryVersions,
  getEntryVersionAt,
  restoreEntryVersion,
  setEntryArchived,
  archiveEntries,
} from "../controllers/entryHistory.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { groupStats, timelineStats, evaluateExpression } from "../controllers/stats.controller.js";
import { updateRecurrence } from "../controllers/recurrence.controller.js";

const router = Router();

// User-scoped listing across projects. Declared before the project-scoped
// route so "/entries" is never mistaken for a project id.
router.get("/entries", requireAuth, listEntries);
router.get("/projects/:projectId/entries", requireAuth, getEntries);
router.post("/projects/:projectId/entries", requireAuth, createEntry);
router.put("/entries/:id", requireAuth, updateEntry);
router.delete("/entries/:id", requireAuth, deleteEntry);
router.patch("/entries/:id/status", requireAuth, updateEntryStatus);
router.patch("/recurrences/:id", requireAuth, updateRecurrence);
// Version history (US20-22). "/versions/at" is declared before any
// "/versions/:version" route so "at" is never read as a version number.
router.get("/entries/:id/versions", requireAuth, getEntryVersions);
router.get("/entries/:id/versions/at", requireAuth, getEntryVersionAt);
router.post("/entries/:id/versions/:version/restore", requireAuth, restoreEntryVersion);
// Archiving (US30)
router.post("/entries/archive", requireAuth, archiveEntries);
router.patch("/entries/:id/archive", requireAuth, setEntryArchived);
router.post("/projects/:projectId/stats/group", requireAuth, groupStats);
router.post("/projects/:projectId/stats/timeline", requireAuth, timelineStats);
// Custom expressions (US16) — one number for the whole project.
router.post("/projects/:projectId/stats/expression", requireAuth, evaluateExpression);

export default router;
