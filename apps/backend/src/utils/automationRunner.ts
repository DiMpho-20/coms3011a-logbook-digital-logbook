import prisma from "../prisma.js";
import type { Entry } from "@logbook/shared";
import { ENTRY_INCLUDE, ENTRY_TRANSACTION_OPTIONS, formatEntry } from "../controllers/entry.controller.js";
import { recordVersion, sameSnapshot, toSnapshot } from "./entryVersions.js";
import {
  describeRuleProblem,
  evaluateConditions,
  type AutomationAction,
  type AutomationCondition,
  type RuleEvaluationContext,
} from "./automationRules.js";

/**
 * US26 — running the rules.
 *
 * This module is imported by entry.controller.ts, and imports formatEntry and
 * ENTRY_INCLUDE back from it. That cycle is the existing convention, not a new
 * one: utils/recurringEntries.ts (US27) does exactly the same. It is safe
 * because nothing here runs at module-evaluation time.
 *
 * ── Why automation cannot loop ──────────────────────────────────────────────
 *
 * There is no counter and no depth flag. Recursion is impossible by shape:
 *
 *  1. runEntryAutomation is called only from the three HTTP handlers that
 *     persist an entry, after they have committed. Nothing in this file calls a
 *     controller, dispatches an event, or calls runEntryAutomation again, and
 *     there is no Prisma middleware or database trigger anywhere in the repo
 *     that could observe these writes and start another pass.
 *  2. Actions write to entry_tags and logbook_entries directly, so an
 *     automated change cannot re-enter updateEntry and raise ENTRY_UPDATED.
 *  3. Every rule is evaluated against one snapshot of the entry as the user
 *     saved it, taken before any action runs. A rule therefore never sees
 *     another rule's output, so rules cannot cascade into each other even
 *     within a single pass.
 *
 * One user save produces exactly one evaluation pass over the project's rules.
 *
 * ── Ordering ────────────────────────────────────────────────────────────────
 *
 * Rules run oldest first, tie-broken by id, so the outcome of two rules that
 * disagree is defined rather than incidental: the later rule's write lands
 * last and wins. Combined with the single-snapshot rule above, the result of a
 * save is a pure function of the entry and the rule set.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 *
 * Every action is idempotent. ADD_TAG inserts with skipDuplicates against
 * EntryTag's composite primary key, REMOVE_TAG is a deleteMany, and SET_STATUS
 * writes a fixed value. Running the same rule against the same entry twice
 * leaves the same state, which is what makes offline replay safe: see the note
 * in runEntryAutomation.
 */

/**
 * Reduce the matched actions to the writes actually worth making.
 *
 * Status is a single scalar, so when several rules set it only the last one
 * can survive — keeping just that one is what makes "the later rule wins"
 * true rather than accidental, and it is safe precisely because every rule was
 * evaluated against the same snapshot and none of them saw the others.
 *
 * That surviving write is then dropped if the entry already has that status.
 * Applying it anyway would rewrite completedAt and append a version recording
 * no change, which is what a rule whose action satisfies its own condition
 * would do on every single save.
 *
 * Tag actions are left in rule order and need no collapsing: they address
 * different tags, and an add and a remove of the same tag resolve the same way
 * — last write wins.
 */
function collapseActions(planned: AutomationAction[], ctx: RuleEvaluationContext): AutomationAction[] {
  const lastStatusIndex = planned.reduce(
    (found, action, index) => (action.type === "SET_STATUS" ? index : found),
    -1
  );

  return planned.filter((action, index) => {
    if (action.type !== "SET_STATUS") return true;
    if (index !== lastStatusIndex) return false;
    return action.status !== ctx.status;
  });
}

export type AutomationTrigger = "ENTRY_CREATED" | "ENTRY_UPDATED";

type RuleRow = {
  id: string;
  name: string;
  conditions: unknown;
  action: unknown;
};

/** A stored rule's JSON, shaped back into the types the evaluator expects. */
function readRule(row: RuleRow): { conditions: AutomationCondition[]; action: AutomationAction } | null {
  // A row written by an older version of the app, or edited by hand, may not
  // have the shape this code expects. Treat it as unusable rather than letting
  // a cast turn it into a runtime surprise deep inside evaluation.
  if (!Array.isArray(row.conditions)) return null;
  if (!row.action || typeof row.action !== "object") return null;
  return {
    conditions: row.conditions as AutomationCondition[],
    action: row.action as AutomationAction,
  };
}

/**
 * Apply the project's rules to an entry that has already been saved.
 *
 * Returns the entry as it stands after automation when something changed, and
 * null when nothing did — including when the project has no rules at all,
 * which is the common case and costs one indexed query.
 *
 * Never throws. An automation failure must not reach the user as a failed
 * save: by the time this runs their entry is committed, and the honest outcome
 * of a broken rule is a logged error and an unmodified entry, not a 500 that
 * suggests their work was lost.
 */
export async function runEntryAutomation(
  entryId: string,
  projectId: string,
  userId: string,
  trigger: AutomationTrigger
): Promise<Entry | null> {
  try {
    const rules = await prisma.automationRule.findMany({
      where: { projectId, trigger, enabled: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (rules.length === 0) return null;

    // Everything evaluation needs, in three queries regardless of how many
    // rules there are — no per-rule lookups.
    const [entryRow, fields, tags] = await Promise.all([
      prisma.logbookEntry.findUnique({ where: { id: entryId }, include: ENTRY_INCLUDE }),
      prisma.entryField.findMany({
        where: { projectId, archivedAt: null },
        select: { id: true, name: true, type: true },
      }),
      prisma.tag.findMany({ where: { userId }, select: { id: true } }),
    ]);
    if (!entryRow) return null;

    const before = formatEntry(entryRow);
    const tagIds = new Set(tags.map((tag) => tag.id));

    const context: RuleEvaluationContext = {
      durationMinutes: entryRow.durationMinutes,
      status: entryRow.status,
      values: new Map(entryRow.values.map((row) => [row.fieldId, row.value])),
      fieldTypes: new Map(fields.map((field) => [field.id, field.type])),
    };

    // Decide everything first, against the one snapshot above, then write.
    const planned: AutomationAction[] = [];
    for (const row of rules) {
      try {
        const rule = readRule(row);
        if (!rule) {
          console.warn(`[automation] rule ${row.id} ("${row.name}") has unreadable conditions or action; skipped`);
          continue;
        }
        const problem = describeRuleProblem(rule.conditions, rule.action, { fields, tagIds });
        if (problem) {
          // A field was archived or a tag deleted after the rule was written.
          // Refusing to act is the safe reading: the alternative is guessing
          // which field was meant.
          console.warn(`[automation] rule ${row.id} ("${row.name}") cannot run: ${problem}`);
          continue;
        }
        if (evaluateConditions(rule.conditions, context)) {
          planned.push(rule.action);
        }
      } catch (error) {
        // One malformed rule must not stop the rest. Rules are independent, so
        // evaluation continues; the story asks for "the applicable rules" to be
        // processed, not for the first bad one to silence the others.
        console.error(`[automation] rule ${row.id} ("${row.name}") failed to evaluate:`, error);
      }
    }

    const actions = collapseActions(planned, context);
    if (actions.length === 0) return null;

    const after = await prisma.$transaction(async (tx) => {
      for (const action of actions) {
        switch (action.type) {
          case "ADD_TAG":
            // EntryTag's primary key is (entryId, tagId), so this is a no-op
            // when the tag is already on the entry.
            await tx.entryTag.createMany({
              data: [{ entryId, tagId: action.tagId }],
              skipDuplicates: true,
            });
            break;
          case "REMOVE_TAG":
            await tx.entryTag.deleteMany({ where: { entryId, tagId: action.tagId } });
            break;
          case "SET_STATUS":
            // completedAt is maintained exactly as updateEntryStatus does it,
            // so an automated completion is indistinguishable from a manual
            // one and no state arises that the app could not produce itself.
            await tx.logbookEntry.update({
              where: { id: entryId },
              data: {
                status: action.status,
                completedAt: action.status === "DONE" ? new Date() : null,
              },
            });
            break;
        }
      }

      const updated = formatEntry(
        await tx.logbookEntry.findUniqueOrThrow({ where: { id: entryId }, include: ENTRY_INCLUDE })
      );

      // toSnapshot covers tags and status, both of which automation can change,
      // so without this the history would claim a state the entry was never in.
      // The user's own save is already version n; this is version n+1, which
      // also leaves the automation's effect visible and revertable in the
      // history UI rather than silently folded into their edit.
      if (!sameSnapshot(toSnapshot(before), toSnapshot(updated))) {
        await recordVersion(tx, entryId, toSnapshot(updated), "UPDATED");
      }
      return updated;
    }, ENTRY_TRANSACTION_OPTIONS);

    return sameSnapshot(toSnapshot(before), toSnapshot(after)) ? null : after;
  } catch (error) {
    console.error(`[automation] pass failed for entry ${entryId}:`, error);
    return null;
  }
}
