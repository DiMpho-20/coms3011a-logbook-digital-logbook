type Field = { id: string; name: string; type: string; required: boolean };

/** Whether a field value counts as "not filled in" for a required-field check. */
export function isEmptyValue(v: unknown): boolean {
  return v === "" || v === undefined || v === null || (Array.isArray(v) && v.length === 0);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Check one value against its field's declared type. Empty values pass here
 * regardless of type — completeness is a separate concern, checked by
 * `findMissingRequiredField`.
 */
function checkValueShape(field: Field, value: unknown): string | null {
  if (isEmptyValue(value)) return null;

  switch (field.type) {
    case "TEXT":
      return typeof value === "string" ? null : `"${field.name}" must be text.`;
    case "LINK": {
      if (typeof value !== "string") return `"${field.name}" must be a link.`;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:"
          ? null
          : `"${field.name}" must be a valid link (e.g. https://example.com).`;
      } catch {
        return `"${field.name}" must be a valid link (e.g. https://example.com).`;
      }
    }
    case "NUMBER": {
      // Accepts a numeric string too — the rest of the app (flattenValues,
      // calculateComputedValues) already treats "45" and 45 as equivalent.
      const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      return Number.isFinite(num) ? null : `"${field.name}" must be a number.`;
    }
    case "BOOLEAN":
      return typeof value === "boolean" ? null : `"${field.name}" must be true or false.`;
    case "DATE":
      return typeof value === "string" && !Number.isNaN(Date.parse(value))
        ? null
        : `"${field.name}" must be a valid date.`;
    case "TAGS":
      return Array.isArray(value) && value.every((v) => typeof v === "string")
        ? null
        : `"${field.name}" must be a list of tags.`;
    case "CHECKLIST":
      return Array.isArray(value) &&
        value.every((v) => isPlainObject(v) && typeof v.label === "string" && typeof v.checked === "boolean")
        ? null
        : `"${field.name}" must be a checklist of items with a label.`;
    case "REFERENCE":
      return isPlainObject(value) && typeof value.id === "string"
        ? null
        : `"${field.name}" must reference a project or entry.`;
    case "COMPUTED":
      // Server-computed; whatever the client sent is overwritten, not validated.
      return null;
    default:
      return null;
  }
}

/** Validate a map of fieldId -> value against the project's current fields. */
export function validateEntryValues(fields: Field[], values: Record<string, unknown>): string | null {
  const byId = new Map(fields.map((f) => [f.id, f]));
  for (const [fieldId, value] of Object.entries(values)) {
    const field = byId.get(fieldId);
    if (!field) continue; // unknown/stale field id — not this function's concern
    const error = checkValueShape(field, value);
    if (error) return error;
  }
  return null;
}

/** The first required field that's still empty in `values`, if any. */
export function findMissingRequiredField(fields: Field[], values: Record<string, unknown>): Field | null {
  return fields.find((f) => f.required && f.type !== "COMPUTED" && isEmptyValue(values[f.id])) ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The two tables a reference can point into, from Prisma or a transaction. */
type ReferenceLookup = {
  project: { findMany(args: { where: object; select: { id: true } }): Promise<{ id: string }[]> };
  logbookEntry: { findMany(args: { where: object; select: { id: true } }): Promise<{ id: string }[]> };
};

/**
 * Issue #90. `validateEntryValues` only checks that a reference is shaped like
 * one. This checks what it points at: the project or entry must exist, belong
 * to the user saving it, and be the kind the reference declares. A reference
 * without a kind is read as a project — the only kind the app has ever sent.
 * Run after `validateEntryValues`, so every reference here has a string id.
 */
export async function findBadReference(
  db: ReferenceLookup,
  userId: string,
  fields: Field[],
  values: Record<string, unknown>
): Promise<string | null> {
  const wanted: { field: Field; id: string; kind: "project" | "entry" }[] = [];
  for (const field of fields) {
    const value = values[field.id];
    if (field.type !== "REFERENCE" || isEmptyValue(value) || !isPlainObject(value)) continue;
    const kind = value.kind ?? "project";
    if (kind !== "project" && kind !== "entry") {
      return `"${field.name}" must reference a project or an entry.`;
    }
    const id = String(value.id);
    // Checked before querying: a malformed id is simply not one of theirs.
    if (!UUID.test(id)) return `"${field.name}" must reference one of your ${kind === "project" ? "projects" : "entries"}.`;
    wanted.push({ field, id, kind });
  }
  if (wanted.length === 0) return null;

  const idsOf = (kind: "project" | "entry") => wanted.filter((w) => w.kind === kind).map((w) => w.id);
  const [projects, entries] = await Promise.all([
    idsOf("project").length
      ? db.project.findMany({ where: { id: { in: idsOf("project") }, userId }, select: { id: true } })
      : [],
    idsOf("entry").length
      ? db.logbookEntry.findMany({ where: { id: { in: idsOf("entry") }, project: { userId } }, select: { id: true } })
      : [],
  ]);
  const found = new Set([...projects, ...entries].map((row) => row.id));

  const bad = wanted.find((w) => !found.has(w.id));
  if (!bad) return null;
  return `"${bad.field.name}" must reference one of your ${bad.kind === "project" ? "projects" : "entries"}.`;
}
