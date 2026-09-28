import { Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import {
  createAutomationRuleSchema,
  updateAutomationRuleSchema,
} from "../schemas/automationRule.schema.js";
import {
  describeRuleProblem,
  type AutomationAction,
  type AutomationCondition,
  type RuleField,
} from "../utils/automationRules.js";

/**
 * US26 — CRUD for entry automation rules.
 *
 * HTTP concerns only: ownership, validation, status codes. The rule language
 * itself lives in utils/automationRules.ts and running it lives in
 * utils/automationRunner.ts, so the engine is testable without a request.
 */

type Stored = {
  id: string;
  projectId: string;
  name: string;
  trigger: string;
  conditions: unknown;
  action: unknown;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Ownership is the project's, as it is for custom statistics (US17). Answering
 * 404 rather than 403 for someone else's project matches every other
 * controller and declines to confirm that the id exists at all.
 */
const ownedProject = (projectId: string, userId: string) =>
  prisma.project.findFirst({ where: { id: projectId, userId } });

const isDuplicateName = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * The project's live fields and the owner's tags — everything needed to say
 * whether a rule still makes sense. Loaded once per request, not once per rule.
 */
async function ruleContext(projectId: string, userId: string) {
  const [fields, tags] = await Promise.all([
    prisma.entryField.findMany({
      where: { projectId, archivedAt: null },
      select: { id: true, name: true, type: true },
    }),
    prisma.tag.findMany({ where: { userId }, select: { id: true } }),
  ]);
  return { fields: fields as RuleField[], tagIds: new Set(tags.map((tag) => tag.id)) };
}

function problemFor(stored: Stored, context: { fields: RuleField[]; tagIds: Set<string> }) {
  if (!Array.isArray(stored.conditions) || !stored.action || typeof stored.action !== "object") {
    return "This rule is stored in a form the app no longer understands.";
  }
  return describeRuleProblem(
    stored.conditions as AutomationCondition[],
    stored.action as AutomationAction,
    context
  );
}

function present(stored: Stored, context: { fields: RuleField[]; tagIds: Set<string> }) {
  return {
    id: stored.id,
    projectId: stored.projectId,
    name: stored.name,
    trigger: stored.trigger,
    conditions: stored.conditions,
    action: stored.action,
    enabled: stored.enabled,
    // A rule can go stale after it is written — its field archived, its tag
    // deleted. It keeps its row and reports why it cannot run, the same way a
    // saved statistic carries its error rather than failing the whole request.
    // The runner refuses to act on exactly these rules.
    invalidReason: problemFor(stored, context),
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}

// ── POST /projects/:projectId/automation-rules ────────────────────────────

export const createAutomationRule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const parsed = createAutomationRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }

    // Zod settled the shape; this settles whether the ids actually belong here.
    // Both checks are needed: a field id that is a valid UUID belonging to
    // someone else's project passes the first and must fail the second.
    const context = await ruleContext(projectId, req.userId!);
    const problem = describeRuleProblem(parsed.data.conditions, parsed.data.action, context);
    if (problem) {
      return res.status(400).json({ error: problem });
    }

    const created = await prisma.automationRule.create({
      data: {
        userId: req.userId!,
        projectId,
        name: parsed.data.name,
        trigger: parsed.data.trigger,
        conditions: parsed.data.conditions as unknown as Prisma.InputJsonValue,
        action: parsed.data.action as unknown as Prisma.InputJsonValue,
        enabled: parsed.data.enabled,
      },
    });

    return res.status(201).json(present(created, context));
  } catch (error) {
    if (isDuplicateName(error)) {
      return res.status(409).json({ error: "A rule with that name already exists in this project" });
    }
    console.error("Failed to create automation rule:", error);
    return res.status(500).json({ error: "Failed to create the rule" });
  }
};

// ── GET /projects/:projectId/automation-rules ─────────────────────────────

export const listAutomationRules = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    if (!(await ownedProject(projectId, req.userId!))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const [rules, context] = await Promise.all([
      // The same order the runner uses, so the list reads in the order the
      // rules actually fire.
      prisma.automationRule.findMany({
        where: { projectId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      ruleContext(projectId, req.userId!),
    ]);

    return res.json(rules.map((rule) => present(rule, context)));
  } catch (error) {
    console.error("Failed to list automation rules:", error);
    return res.status(500).json({ error: "Failed to load the rules" });
  }
};

// ── GET /projects/:projectId/automation-rules/:id ─────────────────────────

export const getAutomationRule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);

    // Scoped by projectId *and* userId, so a rule id guessed from another
    // account resolves to nothing rather than to its owner's rule.
    const rule = await prisma.automationRule.findFirst({
      where: { id, projectId, project: { userId: req.userId! } },
    });
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }

    return res.json(present(rule, await ruleContext(projectId, req.userId!)));
  } catch (error) {
    console.error("Failed to load automation rule:", error);
    return res.status(500).json({ error: "Failed to load the rule" });
  }
};

// ── PATCH /projects/:projectId/automation-rules/:id ───────────────────────

export const updateAutomationRule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);

    const existing = await prisma.automationRule.findFirst({
      where: { id, projectId, project: { userId: req.userId! } },
    });
    if (!existing) {
      return res.status(404).json({ error: "Rule not found" });
    }

    const parsed = updateAutomationRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    }

    const context = await ruleContext(projectId, req.userId!);

    // Validate the rule as it will be after the edit, not just the parts that
    // changed: swapping only the action can invalidate conditions that were
    // fine, and vice versa.
    const nextConditions = (parsed.data.conditions ?? existing.conditions) as AutomationCondition[];
    const nextAction = (parsed.data.action ?? existing.action) as AutomationAction;
    if (parsed.data.conditions !== undefined || parsed.data.action !== undefined) {
      const problem = describeRuleProblem(nextConditions, nextAction, context);
      if (problem) {
        return res.status(400).json({ error: problem });
      }
    }

    const updated = await prisma.automationRule.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.trigger !== undefined && { trigger: parsed.data.trigger }),
        ...(parsed.data.conditions !== undefined && {
          conditions: parsed.data.conditions as unknown as Prisma.InputJsonValue,
        }),
        ...(parsed.data.action !== undefined && {
          action: parsed.data.action as unknown as Prisma.InputJsonValue,
        }),
        ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
      },
    });

    return res.json(present(updated, context));
  } catch (error) {
    if (isDuplicateName(error)) {
      return res.status(409).json({ error: "A rule with that name already exists in this project" });
    }
    console.error("Failed to update automation rule:", error);
    return res.status(500).json({ error: "Failed to update the rule" });
  }
};

// ── DELETE /projects/:projectId/automation-rules/:id ──────────────────────

export const deleteAutomationRule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);

    const existing = await prisma.automationRule.findFirst({
      where: { id, projectId, project: { userId: req.userId! } },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Rule not found" });
    }

    await prisma.automationRule.delete({ where: { id } });

    return res.json({ message: "Rule deleted" });
  } catch (error) {
    console.error("Failed to delete automation rule:", error);
    return res.status(500).json({ error: "Failed to delete the rule" });
  }
};
