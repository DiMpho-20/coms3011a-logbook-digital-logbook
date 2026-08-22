import { Router } from "express";
import {
  createEntryField,
  getEntryFields,
} from "../controllers/entryField.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/projects/:projectId/entry-fields", requireAuth, createEntryField);

router.get("/projects/:projectId/entry-fields", requireAuth, getEntryFields);

export default router;
