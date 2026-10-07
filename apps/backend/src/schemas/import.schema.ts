import { z } from "zod";

const FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "TAGS", "CHECKLIST", "LINK", "REFERENCE", "COMPUTED"] as const;

const isoDate = z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Invalid ISO date" });

/**
 * A backup as written by the Settings page's JSON export. Values are checked
 * against their field's type later (validateEntryValues), once the field each
 * one belongs to is known.
 */
export const logbookBackupSchema = z.object({
  format: z.literal("digital-logbook-backup"),
  version: z.literal(1),
  projects: z.array(z.object({
    name: z.string().trim().min(1, "Project name is required").max(255),
    description: z.string().nullable().optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    fields: z.array(z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1, "Field name is required"),
      type: z.enum(FIELD_TYPES),
      required: z.boolean(),
      // Older backups predate formulas entirely.
      formula: z.string().nullable().optional(),
    })),
    entries: z.array(z.object({
      durationMinutes: z.number().int().min(0, "Duration cannot be negative"),
      entryDate: isoDate.nullable().optional(),
      dueDate: isoDate.nullable().optional(),
      values: z.record(z.string(), z.unknown()),
      // Optional so backups written before these were exported still import.
      status: z.enum(["OPEN", "DONE"]).optional(),
      tags: z.array(z.string()).optional(),
      archived: z.boolean().optional(),
    })),
  })),
});

export type LogbookBackup = z.infer<typeof logbookBackupSchema>;
