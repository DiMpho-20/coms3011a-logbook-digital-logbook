import { Router } from "express";
import {
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
} from "../controllers/entry.controller.js";

const router = Router();

router.get("/projects/:projectId/entries", getEntries);
router.post("/projects/:projectId/entries", createEntry);
router.put("/entries/:id", updateEntry);
router.delete("/entries/:id", deleteEntry);

export default router;
