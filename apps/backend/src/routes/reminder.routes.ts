import { Router } from "express";
import {
  getReminders,
  getDueReminderCount,
  createReminder,
  updateReminder,
  deleteReminder,
  getSettings,
  updateSettings,
} from "../controllers/reminder.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Fixed paths before "/reminders/:id" so they are never read as an id.
router.get("/reminders", requireAuth, getReminders);
router.get("/reminders/count", requireAuth, getDueReminderCount);
router.get("/reminders/settings", requireAuth, getSettings);
router.put("/reminders/settings", requireAuth, updateSettings);
router.post("/reminders", requireAuth, createReminder);
router.patch("/reminders/:id", requireAuth, updateReminder);
router.delete("/reminders/:id", requireAuth, deleteReminder);

export default router;
