import { Router } from "express";
import {
  createEntryField,
  getEntryFields,
} from "../controllers/entryField.controller.js";

const router = Router();

router.post("/projects/:projectId/entry-fields", createEntryField);

router.get("/projects/:projectId/entry-fields", getEntryFields);

export default router;