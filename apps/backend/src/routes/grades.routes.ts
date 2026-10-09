import { Router } from "express";
import {
  createAssessment,
  createModule,
  deleteAssessment,
  deleteModule,
  getModule,
  listModules,
  loadOwnedAssessment,
  loadOwnedModule,
  updateAssessment,
  updateModule,
} from "../controllers/grades.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

// FEAT-009 (My Grades), mounted at /api/grades.
//
// Ownership is enforced here rather than remembered in each handler (BUG-011):
// every route needs a signed-in student, and any route naming :moduleId or
// :assessmentId goes through a loader that only finds the caller's own record.
// A new route gets both without doing anything — and grades.test.ts walks this
// router's routes to prove it.

const router = Router();

// Safe as router-level middleware only because this router has its own mount
// path; mounted at "/api" it would also guard every other router's routes.
router.use(requireAuth);

router.param("moduleId", loadOwnedModule);
router.param("assessmentId", loadOwnedAssessment);

router.get("/modules", listModules);
router.post("/modules", createModule);
router.get("/modules/:moduleId", getModule);
router.patch("/modules/:moduleId", updateModule);
router.delete("/modules/:moduleId", deleteModule);

router.post("/modules/:moduleId/assessments", createAssessment);
router.patch("/assessments/:assessmentId", updateAssessment);
router.delete("/assessments/:assessmentId", deleteAssessment);

export default router;
