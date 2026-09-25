/**
 * Computed-field formulas are stored with field ids ("{3f2a…} * 2"), but
 * people write and read them with field names ("{Hours} * 2"). A brand-new
 * field has no id until it is saved, so names are the only thing a formula
 * written in the Create Project dialog can point at.
 *
 * A formula may use Number fields and other computed fields.
 */

type FormulaField = { id: string; name: string; type: string; formula?: string | null };

const REFERENCE = /\{([^{}]*)\}/g;
const ARITHMETIC = /^[0-9+\-*/().\s]+$/;

const normalise = (name: string) => name.trim().toLowerCase();

const referencesOf = (formula: string) => [...formula.matchAll(REFERENCE)].map((match) => match[1]);

/** The fields `self`'s formula may use, matched by name (or by id, as stored). */
function candidatesFor(reference: string, selfId: string, fields: FormulaField[]) {
  return fields.filter((field) =>
    field.id !== selfId
    && (field.type === "NUMBER" || field.type === "COMPUTED")
    && (normalise(field.name) === normalise(reference) || field.id === reference)
  );
}

/** Swaps stored {field-id} references for {Field name} so a formula can be read or edited. */
export function formulaIdsToNames(formula: string, fields: FormulaField[]): string {
  const names = new Map(fields.map((field) => [field.id, field.name]));
  return formula.replace(REFERENCE, (match, id: string) => {
    const name = names.get(id);
    return name ? `{${name}}` : match;
  });
}

/** The form rows a name-based formula uses; unresolvable references are left out. */
function dependenciesOf(field: FormulaField, fields: FormulaField[]): FormulaField[] {
  return referencesOf(field.formula ?? "")
    .map((reference) => candidatesFor(reference, field.id, fields))
    .filter((matches) => matches.length === 1)
    .map(([match]) => match);
}

/**
 * Checks a name-based formula against the fields in the form and returns the
 * problem to show, or null. Runs before anything is saved, so a bad formula
 * no longer leaves a half-created project behind.
 */
export function findFormulaProblem(field: FormulaField, fields: FormulaField[]): string | null {
  const label = field.name.trim() || "Computed field";
  const formula = field.formula ?? "";
  if (!formula.trim()) return `"${label}" needs a formula.`;

  for (const reference of referencesOf(formula)) {
    const matches = candidatesFor(reference, field.id, fields);
    if (matches.length === 0) {
      return normalise(reference) === normalise(field.name)
        ? `"${label}" cannot use itself in its formula.`
        : `"${label}" uses {${reference}}, but there is no Number or Computed field with that name.`;
    }
    if (matches.length > 1) {
      return `"${label}" uses {${reference}}, but more than one field has that name. Rename one of them.`;
    }
  }

  if (!ARITHMETIC.test(formula.replace(REFERENCE, "1"))) {
    return `"${label}" may only contain numbers, + - * /, parentheses and {Field name} references.`;
  }

  // Following the formula's computed fields must never lead back to it.
  const pending = dependenciesOf(field, fields);
  const seen = new Set<string>();
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (next.id === field.id) return `"${label}" and the computed fields it uses depend on each other in a loop.`;
    if (seen.has(next.id) || next.type !== "COMPUTED") continue;
    seen.add(next.id);
    pending.push(...dependenciesOf(next, fields));
  }
  return null;
}

/**
 * The order to save form rows in: every other field first, then computed
 * fields after the computed fields they use, so each formula's references
 * already have ids by the time it is sent.
 */
export function orderForSaving<T extends FormulaField>(fields: T[]): T[] {
  const ordered: T[] = fields.filter((field) => field.type !== "COMPUTED");
  const placed = new Set<string>();
  const place = (field: T, visiting: Set<string>) => {
    if (placed.has(field.id) || visiting.has(field.id)) return;
    visiting.add(field.id);
    for (const dependency of dependenciesOf(field, fields)) {
      if (dependency.type === "COMPUTED") place(dependency as T, visiting);
    }
    placed.add(field.id);
    ordered.push(field);
  };
  for (const field of fields) if (field.type === "COMPUTED") place(field, new Set());
  return ordered;
}

/**
 * Swaps {Field name} references for the ids the server stores. `ids` maps
 * each form row to its saved id — for a new row that is the id the server
 * just gave it, which is why rows are saved in orderForSaving's order.
 */
export function formulaNamesToIds(field: FormulaField, fields: FormulaField[], ids: Map<string, string>): string {
  return (field.formula ?? "").trim().replace(REFERENCE, (match, reference: string) => {
    const [target] = candidatesFor(reference, field.id, fields);
    const id = target && ids.get(target.id);
    return id ? `{${id}}` : match;
  });
}

/**
 * Works out every computed field from stored (id-based) formulas, as the
 * server will on save — for showing the result while an entry is filled in.
 * A field is null while any Number field it relies on is still empty.
 */
export function previewComputedValues(fields: FormulaField[], values: Record<string, unknown>): Record<string, number | null> {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const results: Record<string, number | null> = {};

  const evaluate = (field: FormulaField, visiting: Set<string>): number | null => {
    if (field.id in results) return results[field.id];
    if (visiting.has(field.id)) return null;
    visiting.add(field.id);
    let incomplete = false;
    const expression = (field.formula ?? "").replace(REFERENCE, (_match, id: string) => {
      const source = byId.get(id);
      const raw = source?.type === "COMPUTED" ? evaluate(source, visiting) : values[id];
      const value = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(value)) incomplete = true;
      return String(value);
    });
    visiting.delete(field.id);
    let result: number | null = null;
    if (!incomplete && ARITHMETIC.test(expression)) {
      try {
        // Safe after the character whitelist: no names, property access, or calls are possible.
        const value = Function(`"use strict"; return (${expression})`)();
        result = Number.isFinite(value) ? value : null;
      } catch {
        result = null;
      }
    }
    results[field.id] = result;
    return result;
  };

  for (const field of fields) if (field.type === "COMPUTED" && field.formula) evaluate(field, new Set());
  return results;
}
