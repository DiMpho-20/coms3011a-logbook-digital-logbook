import { z } from "zod";

const entryValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

const isoDateSchema = z
  .string()
  .refine((s) => !isNaN(Date.parse(s)), { message: "Invalid ISO date" })
  .transform((s) => new Date(s));

export const createEntrySchema = z.object({
  durationMinutes: z.number().int().min(0, "Duration cannot be negative"),
  values: entryValuesSchema,
  entryDate: isoDateSchema.optional(),
  dueDate: isoDateSchema.optional(),
});

export const updateEntrySchema = z.object({
  durationMinutes: z.number().int().min(0).optional(),
  values: entryValuesSchema.optional(),
  entryDate: isoDateSchema.optional().nullable(),
  dueDate: isoDateSchema.optional().nullable(),
});

export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
