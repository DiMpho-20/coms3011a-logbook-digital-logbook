import { Router } from "express";
import {
  createEntryField,
  getEntryFields,
  updateEntryField,
  deleteEntryField,
  getFormatVersions,
} from "../controllers/entryField.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/projects/:projectId/entry-fields", requireAuth, createEntryField);

router.get("/projects/:projectId/entry-fields", requireAuth, getEntryFields);
router.get("/projects/:projectId/entry-format-versions", requireAuth, getFormatVersions);
router.put("/entry-fields/:id", requireAuth, updateEntryField);
router.delete("/entry-fields/:id", requireAuth, deleteEntryField);

export default router;
