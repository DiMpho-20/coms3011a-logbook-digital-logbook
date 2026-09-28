import { Router } from "express";
import {
  createProject,
  getProjects,
  getProject,
  getProjectTimeSummary,
  updateProject,
  updateProjectStatus,
  deleteProject,
} from "../controllers/project.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/projects", requireAuth, createProject);
router.get("/projects", requireAuth, getProjects);
router.get("/projects/:id", requireAuth, getProject);
router.get("/projects/:id/time-summary", requireAuth, getProjectTimeSummary);
router.put("/projects/:id", requireAuth, updateProject);
router.patch("/projects/:id/status", requireAuth, updateProjectStatus);
router.delete("/projects/:id", requireAuth, deleteProject);

export default router;
