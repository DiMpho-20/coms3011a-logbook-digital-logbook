import { z } from "zod";

const entryValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string()), z.array(z.object({ label: z.string(), checked: z.boolean() })), z.object({ id: z.string(), label: z.string().optional(), kind: z.enum(["project", "entry"]).optional() })])
);

const isoDateSchema = z
  .string()
  .refine((s) => !isNaN(Date.parse(s)), { message: "Invalid ISO date" })
  .transform((s) => new Date(s));

const recurrenceSchema = z.object({
  pattern: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  // An omitted end date means the recurrence continues until it is disabled.
  until: isoDateSchema.optional(),
});

export const createEntrySchema = z.object({
  durationMinutes: z.number().int().min(0, "Duration cannot be negative"),
  values: entryValuesSchema,
  entryDate: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
  tags: z.array(z.string()).optional(),
  recurrence: recurrenceSchema.optional(),
});

export const updateEntrySchema = z.object({
  durationMinutes: z.number().int().min(0).optional(),
  values: entryValuesSchema.optional(),
  entryDate: isoDateSchema.optional().nullable(),
  dueDate: isoDateSchema.optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
