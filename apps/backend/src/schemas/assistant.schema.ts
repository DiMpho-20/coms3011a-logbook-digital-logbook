import { z } from "zod";

/** Long enough for a real conversation, short enough to keep each request cheap. */
const MAX_MESSAGES = 20;

export const assistantChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"], { message: "role must be user or model" }),
        text: z.string().trim().min(1, "Message text is required").max(1000, "Message is too long"),
      }),
    )
    .min(1, "messages must not be empty")
    .transform((messages) => messages.slice(-MAX_MESSAGES))
    .refine((messages) => messages[0].role === "user" && messages.at(-1)!.role === "user", {
      message: "The conversation must start and end with a user message",
    }),
  currentPath: z.string().max(200).optional(),
});
