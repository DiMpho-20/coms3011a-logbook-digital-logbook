type Field = { id: string; type: string; formula: string | null };

const REFERENCE = /\{([a-zA-Z0-9-]+)\}/g;

const referencesOf = (formula: string) => [...formula.matchAll(REFERENCE)].map((match) => match[1]);

/**
 * Formulas use {field-id} placeholders, e.g. "({hours} * {rate})". A
 * placeholder may name another computed field, which is worked out first —
 * always from this calculation, never from a value stored earlier, which may
 * be stale. `targets` limits the result to those fields (and whatever they
 * depend on); by default every computed field is calculated.
 */
export function calculateComputedValues(fields: Field[], values: Record<string, unknown>, targets?: string[]) {
  const computed = new Map(fields.filter((item) => item.type === "COMPUTED" && item.formula).map((item) => [item.id, item]));
  const calculated: Record<string, number> = {};

  const evaluate = (field: Field, visiting: Set<string>): number => {
    if (field.id in calculated) return calculated[field.id];
    if (visiting.has(field.id)) throw new Error(`Formula for ${field.id} refers back to itself`);
    visiting.add(field.id);
    const expression = field.formula!.replace(REFERENCE, (_token, fieldId: string) => {
      const dependency = computed.get(fieldId);
      const value = dependency ? evaluate(dependency, visiting) : Number(values[fieldId] ?? 0);
      return Number.isFinite(value) ? String(value) : "0";
    });
    visiting.delete(field.id);
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) throw new Error(`Invalid formula for ${field.id}`);
    // Safe after the character whitelist: no names, property access, or calls are possible.
    const result = Function(`"use strict"; return (${expression})`)();
    if (!Number.isFinite(result)) throw new Error(`Formula for ${field.id} did not produce a number`);
    calculated[field.id] = result;
    return result;
  };

  for (const field of computed.values()) {
    if (!targets || targets.includes(field.id)) evaluate(field, new Set());
  }
  if (!targets) return calculated;
  return Object.fromEntries(Object.entries(calculated).filter(([id]) => targets.includes(id)));
}

/**
 * The computed fields whose results change when `fieldId` changes: the field
 * itself if it is computed, plus every computed field that uses it, directly
 * or through other computed fields.
 */
export function affectedComputedFields(fieldId: string, fields: Field[]): string[] {
  const computed = fields.filter((field) => field.type === "COMPUTED" && field.formula);
  const affected = new Set(computed.some((field) => field.id === fieldId) ? [fieldId] : []);
  const pending = [fieldId];
  while (pending.length > 0) {
    const changed = pending.pop()!;
    for (const field of computed) {
      if (!affected.has(field.id) && referencesOf(field.formula!).includes(changed)) {
        affected.add(field.id);
        pending.push(field.id);
      }
    }
  }
  return [...affected];
}

/**
 * `selfId` is the computed field being edited, if it already exists: it may
 * not use itself, directly or through other computed fields.
 */
export function validateFormula(formula: string, fields: Field[], selfId?: string) {
  const byId = new Map(fields.map((field) => [field.id, field]));
  for (const id of referencesOf(formula)) {
    const field = byId.get(id);
    if (id === selfId || !field || (field.type !== "NUMBER" && field.type !== "COMPUTED")) {
      throw new Error("Computed formulas may only reference other numeric or computed fields using {field-id}");
    }
  }
  const expression = formula.replace(REFERENCE, "1");
  if (!expression || !/^[0-9+\-*/().\s]+$/.test(expression)) throw new Error("Formula may only contain numbers, arithmetic operators, parentheses, and {field-id} references");

  if (!selfId) return;
  // Walk everything this formula reaches; coming back to selfId is a loop.
  const pending = referencesOf(formula);
  const seen = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (id === selfId) throw new Error("This formula would make computed fields depend on each other in a loop");
    if (seen.has(id)) continue;
    seen.add(id);
    const field = byId.get(id);
    if (field?.type === "COMPUTED" && field.formula) pending.push(...referencesOf(field.formula));
  }
}
