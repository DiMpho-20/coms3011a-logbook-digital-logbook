import type { PrismaClient } from "@prisma/client";

type SnapshotField = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  required: boolean;
  formula: string | null;
  archivedAt: null;
  createdAt: string;
  updatedAt: string;
};

type EntryFormatVersionResult = {
  id: string;
  projectId: string;
  version: number;
  fields: SnapshotField[];
  createdAt: Date;
};

/** Store an immutable copy of the active format after every format change. */
export async function createFormatVersion(prisma: PrismaClient, projectId: string): Promise<EntryFormatVersionResult> {
  const fields = await prisma.entryField.findMany({
    where: { projectId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const latest = await prisma.entryFormatVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const snapshot: SnapshotField[] = fields.map((field) => ({
    id: field.id, projectId: field.projectId, name: field.name, type: field.type,
    required: field.required, formula: field.formula, archivedAt: null,
    createdAt: field.createdAt.toISOString(), updatedAt: field.updatedAt.toISOString(),
  }));

  const created = await prisma.entryFormatVersion.create({
    data: { projectId, version: (latest?.version ?? 0) + 1, fields: snapshot },
  });

  return {
    id: created.id,
    projectId: created.projectId,
    version: created.version,
    fields: created.fields as SnapshotField[],
    createdAt: created.createdAt,
  };
}
