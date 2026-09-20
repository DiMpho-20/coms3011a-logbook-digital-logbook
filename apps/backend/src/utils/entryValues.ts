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
    case "LINK":
      return typeof value === "string" ? null : `"${field.name}" must be text.`;
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
