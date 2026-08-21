import { Request, Response } from "express";
import prisma from "../prisma.js";

export const createEntryField = async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const { name, type, required } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        error: "Field name and type are required",
      });
    }

    const validTypes = ["TEXT", "NUMBER", "DATE", "BOOLEAN"];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: "Invalid field type",
      });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const field = await prisma.entryField.create({
      data: {
        projectId,
        name,
        type,
        required: required ?? false,
      },
    });

    return res.status(201).json(field);
  } catch (error) {
    console.error("Failed to create entry field:", error);

    return res.status(500).json({
      error: "Failed to create entry field",
    });
  }
};

export const getEntryFields = async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);

    const fields = await prisma.entryField.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json(fields);
  } catch (error) {
    console.error("Failed to fetch entry fields:", error);

    return res.status(500).json({
      error: "Failed to fetch entry fields",
    });
  }
};
