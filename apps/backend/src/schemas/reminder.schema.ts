import { z } from "zod";
import { isValidTimeZone } from "../utils/reminders.js";

const isoDateSchema = z
  .string()
  .refine((s) => !isNaN(Date.parse(s)), { message: "remindAt must be a valid date" })
  .transform((s) => new Date(s));

const titleSchema = z.string().trim().min(1, "Title is required").max(255, "Title is too long");
const noteSchema = z.string().trim().max(2000, "Note is too long").nullable().optional();

export const createReminderSchema = z.object({
  title: titleSchema,
  note: noteSchema,
  remindAt: isoDateSchema,
  entryId: z.uuid("entryId must be a valid id").nullable().optional(),
});

export const updateReminderSchema = z
  .object({
    status: z.enum(["PENDING", "COMPLETED", "DISMISSED"], {
      message: "status must be PENDING, COMPLETED or DISMISSED",
    }).optional(),
    title: titleSchema.optional(),
    note: noteSchema,
    remindAt: isoDateSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });

export const updateReminderSettingsSchema = z.object({
  dueSoonEnabled: z.boolean().optional(),
  dueSoonDays: z.number().int().min(0, "dueSoonDays must be 0-30").max(30, "dueSoonDays must be 0-30").optional(),
  overdueEnabled: z.boolean().optional(),
  staleEnabled: z.boolean().optional(),
  staleDays: z.number().int().min(1, "staleDays must be 1-365").max(365, "staleDays must be 1-365").optional(),
  dailyLogEnabled: z.boolean().optional(),
  dailyLogTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "dailyLogTime must be HH:MM").optional(),
  timeZone: z.string().refine(isValidTimeZone, { message: "Unknown time zone" }).optional(),
});
