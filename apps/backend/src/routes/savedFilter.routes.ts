import { Router } from "express";
import { createSavedFilter, deleteSavedFilter, listSavedFilters } from "../controllers/savedFilter.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/saved-filters", requireAuth, listSavedFilters);
router.post("/saved-filters", requireAuth, createSavedFilter);
router.delete("/saved-filters/:id", requireAuth, deleteSavedFilter);

export default router;
