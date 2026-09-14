import type { PrismaClient } from "@prisma/client";

/** Store an immutable copy of the active format after every format change. */
export async function createFormatVersion(prisma: PrismaClient, projectId: string) {
  const fields = await prisma.entryField.findMany({
    where: { projectId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const latest = await prisma.entryFormatVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const snapshot = fields.map((field) => ({
    id: field.id, projectId: field.projectId, name: field.name, type: field.type,
    required: field.required, formula: field.formula, archivedAt: null,
    createdAt: field.createdAt.toISOString(), updatedAt: field.updatedAt.toISOString(),
  }));
  return prisma.entryFormatVersion.create({ data: { projectId, version: (latest?.version ?? 0) + 1, fields: snapshot } });
}
