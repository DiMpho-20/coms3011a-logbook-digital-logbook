import type { PrismaClient } from "@prisma/client";

// Both the root client and an interactive transaction provide this delegate.
type TagDb = Pick<PrismaClient, "tag">;

/** Trim and collapse whitespace, and cap length to the column's limit. */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 50);
}

/** Normalize a raw list of tag names, dropping empties and case-insensitive duplicates. */
export function cleanTagNames(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const name = normalizeTagName(raw);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(name);
  }
  return cleaned;
}

/**
 * Find-or-create the given tag names under a user's tag vocabulary and
 * return their IDs, in the same order as `names`. Tags are reused by exact
 * name across all of that user's projects and entries.
 */
export async function resolveTagIds(
  prisma: TagDb,
  userId: string,
  names: string[]
): Promise<string[]> {
  if (names.length === 0) return [];

  await prisma.tag.createMany({
    data: names.map((name) => ({ userId, name })),
    skipDuplicates: true,
  });

  const rows = await prisma.tag.findMany({ where: { userId, name: { in: names } } });
  const idByName = new Map(rows.map((t) => [t.name, t.id]));
  return names.map((name) => idByName.get(name)).filter((id): id is string => Boolean(id));
}
