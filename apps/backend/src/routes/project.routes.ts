import { Router } from "express";
import {
  createProject,
  getProjects,
  getProject,
  getProjectTimeSummary,
  getAllProjectTimeSummaries,
  updateProject,
  updateProjectStatus,
  deleteProject,
} from "../controllers/project.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/projects", requireAuth, createProject);
router.get("/projects", requireAuth, getProjects);
// Static path first: "time-summaries" must not be eaten as an :id below.
router.get("/projects/time-summaries", requireAuth, getAllProjectTimeSummaries);
router.get("/projects/:id", requireAuth, getProject);
router.get("/projects/:id/time-summary", requireAuth, getProjectTimeSummary);
router.put("/projects/:id", requireAuth, updateProject);
router.patch("/projects/:id/status", requireAuth, updateProjectStatus);
router.delete("/projects/:id", requireAuth, deleteProject);

export default router;
