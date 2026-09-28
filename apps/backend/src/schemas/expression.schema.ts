import { z } from "zod";

/**
 * The expression itself is checked by the parser, not here — this only keeps
 * obviously unusable input from reaching it. The length cap is a guard
 * against someone posting a megabyte of text, not a meaningful limit: real
 * expressions are a line long.
 */
export const evaluateExpressionSchema = z.object({
  expression: z.string().min(1, "Write an expression first").max(500, "That expression is too long"),
});
