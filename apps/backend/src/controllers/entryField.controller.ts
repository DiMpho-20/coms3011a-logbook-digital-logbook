import { Response } from "express";
import prisma from "../prisma.js";
import { createFormatVersion, backfillNewField } from "../utils/entryFormat.js";
import { validateFormula } from "../utils/computedFields.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

const VALID_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "TAGS", "CHECKLIST", "LINK", "REFERENCE", "COMPUTED"];

async function ownedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({ where: { id: projectId, userId } });
}

export const createEntryField = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const { name, type, required, formula } = req.body;
    if (!name?.trim() || !VALID_TYPES.includes(type)) return res.status(400).json({ error: "A valid field name and type are required" });
    if ((type === "COMPUTED") !== Boolean(formula?.trim())) return res.status(400).json({ error: "Computed fields require a formula; other fields cannot have one" });
    if (!(await ownedProject(projectId, req.userId!))) return res.status(404).json({ error: "Project not found" });
    const existing = await prisma.entryField.findMany({ where: { projectId, archivedAt: null } });
    if (type === "COMPUTED") validateFormula(formula, existing);
    const field = await prisma.entryField.create({ data: { projectId, name: name.trim(), type, required: type === "COMPUTED" ? false : Boolean(required), formula: type === "COMPUTED" ? formula.trim() : null } });
    await backfillNewField(prisma, projectId, field);
    await createFormatVersion(prisma, projectId);
    return res.status(201).json(field);
  } catch (error: any) { return res.status(400).json({ error: error.message || "Failed to create entry field" }); }
};

export const getEntryFields = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) return res.status(404).json({ error: "Project not found" });
    return res.json(await prisma.entryField.findMany({ where: { projectId, archivedAt: null }, orderBy: { createdAt: "asc" } }));
  } catch { return res.status(500).json({ error: "Failed to fetch entry fields" }); }
};

export const updateEntryField = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const field = await prisma.entryField.findFirst({ where: { id, project: { userId: req.userId! }, archivedAt: null } });
    if (!field) return res.status(404).json({ error: "Entry field not found" });
    const { name, type, required, formula } = req.body;
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: "Field name cannot be empty" });
    if (type !== undefined && !VALID_TYPES.includes(type)) return res.status(400).json({ error: "A valid field type is required" });

    // Changing a type would reinterpret every value already stored for this
    // field (for example, text as a checklist). Do not silently corrupt those
    // entries; users can add a new field instead when data already exists.
    if (type !== undefined && type !== field.type) {
      const valueCount = await prisma.entryValue.count({ where: { fieldId: id } });
      if (valueCount > 0) {
        return res.status(409).json({ error: "This field already has entry values, so its type cannot be changed. Add a new field instead." });
      }
    }

    const nextType = type ?? field.type;
    const allFields = await prisma.entryField.findMany({ where: { projectId: field.projectId, archivedAt: null } });
    const nextFormula = nextType === "COMPUTED"
      ? (formula === undefined ? field.formula : String(formula).trim())
      : null;
    if (nextType === "COMPUTED") {
      if (!nextFormula) return res.status(400).json({ error: "Computed fields require a formula" });
      validateFormula(nextFormula, allFields, id);
    } else if (formula !== undefined) {
      return res.status(400).json({ error: "Only computed fields can have a formula" });
    }

    const updated = await prisma.entryField.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(type !== undefined && { type }),
        ...(required !== undefined && { required: nextType === "COMPUTED" ? false : Boolean(required) }),
        ...(type !== undefined && nextType === "COMPUTED" && required === undefined && { required: false }),
        ...(type !== undefined || formula !== undefined ? { formula: nextFormula } : {}),
      },
    });
    await createFormatVersion(prisma, field.projectId);
    return res.json(updated);
  } catch (error: any) { return res.status(400).json({ error: error.message || "Failed to update entry field" }); }
};

export const deleteEntryField = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const field = await prisma.entryField.findFirst({ where: { id, project: { userId: req.userId! }, archivedAt: null } });
    if (!field) return res.status(404).json({ error: "Entry field not found" });
    await prisma.entryField.update({ where: { id }, data: { archivedAt: new Date() } });
    await createFormatVersion(prisma, field.projectId);
    return res.status(204).send();
  } catch { return res.status(500).json({ error: "Failed to remove entry field" }); }
};

export const getFormatVersions = async (req: AuthenticatedRequest, res: Response) => {
  const projectId = String(req.params.projectId);
  if (!(await ownedProject(projectId, req.userId!))) return res.status(404).json({ error: "Project not found" });
  return res.json(await prisma.entryFormatVersion.findMany({ where: { projectId }, orderBy: { version: "desc" } }));
};
