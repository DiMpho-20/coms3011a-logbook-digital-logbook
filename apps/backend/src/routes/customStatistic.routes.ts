import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createCustomStatistic,
  listCustomStatistics,
  getCustomStatistic,
  updateCustomStatistic,
  deleteCustomStatistic,
} from "../controllers/customStatistic.controller.js";

const router = Router();

// US17 — saved custom statistics, scoped to a project exactly as the
// expression endpoint they are built on is.
router.post("/projects/:projectId/custom-statistics", requireAuth, createCustomStatistic);
router.get("/projects/:projectId/custom-statistics", requireAuth, listCustomStatistics);
router.get("/projects/:projectId/custom-statistics/:id", requireAuth, getCustomStatistic);
router.patch("/projects/:projectId/custom-statistics/:id", requireAuth, updateCustomStatistic);
router.delete("/projects/:projectId/custom-statistics/:id", requireAuth, deleteCustomStatistic);

export default router;
