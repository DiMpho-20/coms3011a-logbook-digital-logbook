import { Router } from "express";
import {
  createProject,
  getProjects,
  getProject,
  getProjectTimeSummary,
  updateProject,
  updateProjectStatus,
} from "../controllers/project.controller.js";

const router = Router();

router.post("/projects", createProject);
router.get("/projects", getProjects);
router.get("/projects/:id", getProject);
router.get("/projects/:id/time-summary", getProjectTimeSummary);
router.put("/projects/:id", updateProject);
router.patch("/projects/:id/status", updateProjectStatus);

export default router;
