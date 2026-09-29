import { z } from "zod";

/**
 * What PATCH /me will accept.
 *
 * Kept apart from the controller, and free of any Prisma import, so the rules
 * below can be executed and tested without a database — the validation is the
 * part that decides whether a profile form can reach a field it should not,
 * and it should not take a live connection to find that out.
 */

/** A downscaled square, not an original photo — see ProfilePage's resizing. */
export const MAX_AVATAR_CHARS = 512 * 1024;
export const AVATAR_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Text the student may fill in, clear, or leave alone.
 *
 * Absent means "leave this field as it is"; null or "" means "clear it". The
 * two are kept distinct so a form that sends only the field it changed cannot
 * blank the rest of the profile.
 */
const optionalText = (max: number, label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => (typeof value === "string" ? value.trim() : value))
    .refine((value) => value == null || value.length <= max, {
      message: `${label} must be at most ${max} characters`,
    })
    .transform((value) => (value === "" ? null : value));

export const profileSchema = z.object({
  bio: optionalText(280, "Bio"),
  studentNumber: optionalText(32, "Student number"),
  degree: optionalText(120, "Degree"),
  yearOfStudy: optionalText(32, "Year of study"),
  avatar: z
    .union([z.string(), z.null()])
    .optional()
    .refine((value) => value == null || value === "" || value.length <= MAX_AVATAR_CHARS, {
      message: "Image is too large — it must be under 512 KB once encoded",
    })
    .refine((value) => value == null || value === "" || AVATAR_DATA_URL.test(value), {
      message: "Image must be a PNG, JPEG or WebP data URL",
    })
    .transform((value) => (value === "" ? null : value)),
});

export type ProfilePatch = Record<string, string | null>;

export type ProfileInputResult =
  | { ok: true; patch: ProfilePatch }
  | { ok: false; error: string };

/**
 * Turn a request body into the exact set of columns to write.
 *
 * Unknown keys are dropped by the schema rather than rejected, so a form that
 * posts the whole profile object back — email and name included — succeeds
 * and simply cannot move the fields it is not allowed to move.
 */
export function buildProfilePatch(body: unknown): ProfileInputResult {
  const parsed = profileSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Only the keys actually sent are written. Prisma would ignore an explicit
  // undefined anyway, but building the patch by hand keeps that guarantee
  // visible instead of resting on it.
  const patch: ProfilePatch = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) patch[key] = value as string | null;
  }
  return { ok: true, patch };
}
