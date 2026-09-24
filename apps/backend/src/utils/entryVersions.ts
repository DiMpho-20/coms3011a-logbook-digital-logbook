import type { Prisma, PrismaClient } from "@prisma/client";
import type { Entry, EntrySnapshot, EntryVersion, EntryVersionReason } from "@logbook/shared";

type Db = PrismaClient | Prisma.TransactionClient;

type VersionRow = {
  version: number;
  reason: string;
  restoredFromVersion: number | null;
  snapshot: unknown;
  createdAt: Date;
};

/** The parts of an entry that a version preserves: its content, not its identity or archive state. */
export function toSnapshot(entry: Entry): EntrySnapshot {
  return {
    durationMinutes: entry.durationMinutes,
    entryDate: entry.entryDate,
    dueDate: entry.dueDate,
    values: entry.values,
    format: entry.format,
    tags: entry.tags,
    status: entry.status,
    completedAt: entry.completedAt,
  };
}

export function toApiVersion(row: VersionRow): EntryVersion {
  return {
    version: row.version,
    reason: row.reason as EntryVersionReason,
    restoredFromVersion: row.restoredFromVersion,
    createdAt: row.createdAt.toISOString(),
    snapshot: row.snapshot as EntrySnapshot,
  };
}

/** Append the entry's current state as its next version. */
export async function recordVersion(
  db: Db,
  entryId: string,
  snapshot: EntrySnapshot,
  reason: EntryVersionReason,
  options: { restoredFromVersion?: number; createdAt?: Date } = {}
) {
  const latest = await db.entryVersion.findFirst({
    where: { entryId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return db.entryVersion.create({
    data: {
      entryId,
      version: (latest?.version ?? 0) + 1,
      reason,
      restoredFromVersion: options.restoredFromVersion ?? null,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      ...(options.createdAt && { createdAt: options.createdAt }),
    },
  });
}

/**
 * Entries created before version history existed have no versions at all.
 * Before their first change, their state as it stands becomes version 1,
 * dated from when the entry was created — any edits made before history
 * existed were never recorded, so this is the earliest state still known.
 */
export async function ensureBaselineVersion(db: Db, entry: Entry) {
  const count = await db.entryVersion.count({ where: { entryId: entry.id } });
  if (count === 0) {
    await recordVersion(db, entry.id, toSnapshot(entry), "CREATED", { createdAt: new Date(entry.createdAt) });
  }
}

/** JSON with object keys sorted, so two snapshots compare equal regardless of key order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Whether a save actually changed anything — a no-op save shouldn't add a version. */
export function sameSnapshot(a: EntrySnapshot, b: EntrySnapshot): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** The version that was current at `at`: the newest one saved at or before it. */
export function versionAt(versions: EntryVersion[], at: Date): EntryVersion | null {
  let found: EntryVersion | null = null;
  for (const version of versions) {
    if (new Date(version.createdAt).getTime() <= at.getTime()) found = version;
  }
  return found;
}
