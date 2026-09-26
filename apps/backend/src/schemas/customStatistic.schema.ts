import { z } from "zod";

/**
 * Names and expressions are trimmed before they are stored, so " Average "
 * and "Average" are the same statistic rather than two that look identical
 * in the list. The expression's own grammar is checked by the US16 parser,
 * not here — this only rejects input the parser should never have to see.
 */
const name = z
  .string()
  .max(100, "That name is too long")
  .refine((value) => value.trim().length > 0, "Give the statistic a name")
  .transform((value) => value.trim());

const expression = z
  .string()
  .max(500, "That expression is too long")
  .refine((value) => value.trim().length > 0, "Write an expression first")
  .transform((value) => value.trim());

export const createCustomStatisticSchema = z.object({ name, expression });

/** An edit may change either field, but has to change something. */
export const updateCustomStatisticSchema = z
  .object({ name: name.optional(), expression: expression.optional() })
  .refine(
    (data) => data.name !== undefined || data.expression !== undefined,
    "Change the name or the expression"
  );
