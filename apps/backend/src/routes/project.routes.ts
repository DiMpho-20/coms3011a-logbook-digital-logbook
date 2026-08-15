import { Router } from "express";
import { createProject, getProjects, updateProjectStatus } from "../controllers/project.controller";

const router = Router();

router.post("/projects", createProject);
router.get("/projects", getProjects);
router.patch("/projects/:id/status", updateProjectStatus);

export default router;
