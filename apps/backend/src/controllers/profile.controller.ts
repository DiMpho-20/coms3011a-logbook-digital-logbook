import { Response } from "express";
import prisma from "../prisma.js";
import { buildProfilePatch } from "../utils/profileInput.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

// The student's profile card.
//
// PATCH may write the display name, which is a label the student owns. It may
// not write the email address, the password or the two-factor flags: the email
// decides where a password reset is sent, so changing it needs a confirmation
// step this endpoint does not have, and the other two are authentication's.
//
// Everything else is optional and free text. The year of study is not an enum
// on this side: the frontend owns the list it offers, exactly as it owns the
// dashboard's panel ids, so adding "Honours" there needs no migration here.

const PROFILE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  isEmailVerified: true,
  bio: true,
  avatar: true,
  studentNumber: true,
  degree: true,
  yearOfStudy: true,
  createdAt: true,
} as const;

type ProfileRow = {
  id: string;
  email: string;
  fullName: string;
  isEmailVerified: boolean;
  bio: string | null;
  avatar: string | null;
  studentNumber: string | null;
  degree: string | null;
  yearOfStudy: string | null;
  createdAt: Date;
};

function formatProfile(user: ProfileRow) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    // Read-only here; the verification flow owns it. The settings page shows
    // it in the security checklist.
    isEmailVerified: user.isEmailVerified,
    bio: user.bio,
    avatar: user.avatar,
    studentNumber: user.studentNumber,
    degree: user.degree,
    yearOfStudy: user.yearOfStudy,
    // What the card shows as "Logging since". The account's own creation date,
    // not the first entry — a student who has written nothing still joined.
    memberSince: user.createdAt.toISOString(),
  };
}

// ── GET /me — the signed-in student's profile ────────────────────────────

export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: PROFILE_SELECT,
    });
    if (!user) {
      // The token verified but the row is gone — a deleted account still
      // holding a valid JWT. 404 rather than 500: nothing is broken.
      return res.status(404).json({ error: "Account not found" });
    }
    return res.json(formatProfile(user as ProfileRow));
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
};

// ── PATCH /me — update the editable fields ───────────────────────────────

export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = buildProfilePatch(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { patch } = parsed;

    if (Object.keys(patch).length === 0) {
      const unchanged = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: PROFILE_SELECT,
      });
      if (!unchanged) return res.status(404).json({ error: "Account not found" });
      return res.json(formatProfile(unchanged as ProfileRow));
    }

    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: patch,
      select: PROFILE_SELECT,
    });
    return res.json(formatProfile(user as ProfileRow));
  } catch (error: any) {
    // The account was deleted between the token check and the write.
    if (error?.code === "P2025") {
      return res.status(404).json({ error: "Account not found" });
    }
    console.error("Failed to update profile:", error);
    return res.status(500).json({ error: "Failed to update profile" });
  }
};
