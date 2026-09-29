import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Declared before any "/:id" route elsewhere would matter — these are exact
// paths, and both are scoped to the token's own account, never an id in the
// URL, so one student can't read or write another's profile.
router.get("/me", requireAuth, getProfile);
router.patch("/me", requireAuth, updateProfile);

export default router;
