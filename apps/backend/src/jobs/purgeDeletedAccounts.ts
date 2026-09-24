import prisma from "../prisma.js";

/**
 * Hard-delete every user whose scheduled deletion date has passed.
 * Runs hourly (and once on startup) so accounts due for deletion
 * don't linger after their grace period ends.
 */
export async function purgeExpiredDeletions(): Promise<number> {
  const now = new Date();

  const expired = await prisma.user.findMany({
    where: { scheduledDeletionAt: { lte: now } },
    select: { id: true, email: true },
  });

  for (const user of expired) {
    try {
      await prisma.user.delete({ where: { id: user.id } });
      console.log(`Purged account: ${user.email}`);
    } catch (err) {
      console.error(`Failed to purge ${user.email}:`, err);
    }
  }

  if (expired.length > 0) {
    console.log(`Purge complete: ${expired.length} account(s) removed.`);
  }

  return expired.length;
}

/**
 * Start the purge on an interval. Runs once immediately on startup,
 * then every hour (default). Safe to call multiple times — the
 * interval is created fresh each time, so call it once from index.ts.
 */
export function startDeletionPurge(intervalMs = 1000 * 60 * 60) {
  purgeExpiredDeletions().catch((err) =>
    console.error("Initial deletion purge failed:", err)
  );

  setInterval(() => {
    purgeExpiredDeletions().catch((err) =>
      console.error("Scheduled deletion purge failed:", err)
    );
  }, intervalMs);
}