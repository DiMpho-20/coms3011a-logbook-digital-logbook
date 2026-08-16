import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { createProjectSchema, updateProjectStatusSchema } from "../schemas/project.schema";

const prisma = new PrismaClient();

export const createProject = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.headers["x-user-id"];
    const validatedData = createProjectSchema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        userId: userId as string,
        name: validatedData.name,
        description: validatedData.description,
        status: "ACTIVE",
      },
    });

    return res.status(201).json(project);
  } catch (error: any) {
    return res.status(400).json({ error: error.errors || error.message });
  }
};

export const getProjects = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.headers["x-user-id"];
    const projects = await prisma.project.findMany({
      where: { userId: userId as string },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(projects);
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to fetch projects" });
  }
};

export const updateProjectStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.headers["x-user-id"];
    const { id } = req.params;
    const { status } = updateProjectStatusSchema.parse(req.body);

    const existing = await prisma.project.findFirst({
      where: { id, userId: userId as string },
    });

    if (!existing) {
      return res.status(404).json({ error: "Project not found" });
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: { status },
    });

    return res.status(200).json(updatedProject);
  } catch (error: any) {
    return res.status(400).json({ error: error.errors || error.message });
  }
};
