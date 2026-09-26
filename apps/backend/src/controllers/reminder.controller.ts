import { Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { ownedEntry } from "./entry.controller.js";
import {
  createReminderSchema,
  updateReminderSchema,
  updateReminderSettingsSchema,
} from "../schemas/reminder.schema.js";
import {
  ENTRY_LABEL_INCLUDE,
  entryLabel,
  generateReminders,
  getReminderSettings,
} from "../utils/reminders.js";

const REMINDER_INCLUDE = {
  entry: { include: ENTRY_LABEL_INCLUDE },
} as const;

type ReminderWithEntry = Prisma.ReminderGetPayload<{ include: typeof REMINDER_INCLUDE }>;

function formatReminder(r: ReminderWithEntry) {
  return {
    id: r.id,
    title: r.title,
    note: r.note,
    source: r.source,
    status: r.status,
    remindAt: r.remindAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    dismissedAt: r.dismissedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    entry: r.entry
      ? {
          id: r.entry.id,
          projectId: r.entry.projectId,
          projectName: r.entry.project.name,
          label: entryLabel(r.entry),
          dueDate: r.entry.dueDate?.toISOString() ?? null,
          status: r.entry.status,
        }
      : null,
  };
}

/** A reminder the caller owns; malformed ids read as not found. */
async function ownedReminder(id: string, userId: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return prisma.reminder.findFirst({ where: { id, userId } });
}

const STATUS_FILTERS = {
  pending: ["PENDING"],
  completed: ["COMPLETED"],
  dismissed: ["DISMISSED"],
  done: ["COMPLETED", "DISMISSED"],
  all: ["PENDING", "COMPLETED", "DISMISSED"],
} as const;

// ── GET /reminders — the caller's reminders, after applying their rules ───
// ?status=pending|completed|dismissed|done|all (default pending)
// ?due=true keeps only reminders whose time has been reached.

export const getReminders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = String(req.query.status ?? "pending") as keyof typeof STATUS_FILTERS;
    if (!(status in STATUS_FILTERS)) {
      return res.status(400).json({ error: `status must be one of ${Object.keys(STATUS_FILTERS).join(", ")}` });
    }
    const now = new Date();
    await generateReminders(req.userId!, now);

    const reminders = await prisma.reminder.findMany({
      where: {
        userId: req.userId!,
        status: { in: [...STATUS_FILTERS[status]] },
        ...(req.query.due === "true" ? { remindAt: { lte: now } } : {}),
      },
      include: REMINDER_INCLUDE,
      // Pending ones in the order they fall due; finished ones most recent first.
      orderBy: status === "pending" ? { remindAt: "asc" } : { updatedAt: "desc" },
      take: 200,
    });
    return res.json(reminders.map(formatReminder));
  } catch (error) {
    console.error("Failed to fetch reminders:", error);
    return res.status(500).json({ error: "Failed to fetch reminders" });
  }
};

// ── GET /reminders/count — how many pending reminders are due now ────────

export const getDueReminderCount = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    await generateReminders(req.userId!, now);
    const due = await prisma.reminder.count({
      where: { userId: req.userId!, status: "PENDING", remindAt: { lte: now } },
    });
    return res.json({ due });
  } catch (error) {
    console.error("Failed to count reminders:", error);
    return res.status(500).json({ error: "Failed to count reminders" });
  }
};

// ── POST /reminders — set a reminder by hand ─────────────────────────────

export const createReminder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { entryId, ...data } = parsed.data;
    if (entryId && !(await ownedEntry(entryId, req.userId!))) {
      return res.status(404).json({ error: "Entry not found" });
    }

    const reminder = await prisma.reminder.create({
      data: { ...data, entryId: entryId ?? null, userId: req.userId!, source: "MANUAL" },
      include: REMINDER_INCLUDE,
    });
    return res.status(201).json(formatReminder(reminder));
  } catch (error) {
    console.error("Failed to create reminder:", error);
    return res.status(500).json({ error: "Failed to create reminder" });
  }
};

// ── PATCH /reminders/:id — complete, dismiss, reopen, snooze or edit ─────

export const updateReminder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!(await ownedReminder(id, req.userId!))) {
      return res.status(404).json({ error: "Reminder not found" });
    }
    const parsed = updateReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { status, ...rest } = parsed.data;

    const data: Prisma.ReminderUpdateInput = { ...rest };
    if (status) {
      const now = new Date();
      data.status = status;
      data.completedAt = status === "COMPLETED" ? now : null;
      data.dismissedAt = status === "DISMISSED" ? now : null;
    }

    const reminder = await prisma.reminder.update({ where: { id }, data, include: REMINDER_INCLUDE });
    return res.json(formatReminder(reminder));
  } catch (error: any) {
    if (error.code === "P2025") return res.status(404).json({ error: "Reminder not found" });
    console.error("Failed to update reminder:", error);
    return res.status(500).json({ error: "Failed to update reminder" });
  }
};

// ── DELETE /reminders/:id — remove a reminder set by hand ────────────────
// A generated reminder would only be generated again while its condition
// holds, so those are dismissed instead.

export const deleteReminder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const reminder = await ownedReminder(id, req.userId!);
    if (!reminder) return res.status(404).json({ error: "Reminder not found" });
    if (reminder.source !== "MANUAL") {
      return res.status(400).json({ error: "Generated reminders can be dismissed but not deleted" });
    }
    await prisma.reminder.delete({ where: { id } });
    return res.status(204).send();
  } catch (error: any) {
    if (error.code === "P2025") return res.status(404).json({ error: "Reminder not found" });
    console.error("Failed to delete reminder:", error);
    return res.status(500).json({ error: "Failed to delete reminder" });
  }
};

// ── GET/PUT /reminders/settings — the rules reminders are generated from ─

export const getSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json(await getReminderSettings(req.userId!));
  } catch (error) {
    console.error("Failed to fetch reminder settings:", error);
    return res.status(500).json({ error: "Failed to fetch reminder settings" });
  }
};

export const updateSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = updateReminderSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    await prisma.reminderSettings.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, ...parsed.data },
      update: parsed.data,
    });
    return res.json(await getReminderSettings(req.userId!));
  } catch (error) {
    console.error("Failed to update reminder settings:", error);
    return res.status(500).json({ error: "Failed to update reminder settings" });
  }
};
