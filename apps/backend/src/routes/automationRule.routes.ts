import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createAutomationRule,
  listAutomationRules,
  getAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
} from "../controllers/automationRule.controller.js";

const router = Router();

// US26 — entry automation rules, scoped to a project exactly as custom
// statistics (US17) are. Every handler re-establishes ownership itself;
// requireAuth only proves the caller holds a valid token.
router.post("/projects/:projectId/automation-rules", requireAuth, createAutomationRule);
router.get("/projects/:projectId/automation-rules", requireAuth, listAutomationRules);
router.get("/projects/:projectId/automation-rules/:id", requireAuth, getAutomationRule);
router.patch("/projects/:projectId/automation-rules/:id", requireAuth, updateAutomationRule);
router.delete("/projects/:projectId/automation-rules/:id", requireAuth, deleteAutomationRule);

export default router;
