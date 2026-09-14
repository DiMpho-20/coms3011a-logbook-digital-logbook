type Field = { id: string; type: string; formula: string | null };

/** Formulas use {field-id} placeholders, e.g. "({hours} * {rate})". */
export function calculateComputedValues(fields: Field[], values: Record<string, unknown>) {
  const calculated: Record<string, number> = {};
  for (const field of fields.filter((item) => item.type === "COMPUTED" && item.formula)) {
    const expression = field.formula!.replace(/\{([a-zA-Z0-9-]+)\}/g, (_token, fieldId) => {
      const value = Number(values[fieldId] ?? calculated[fieldId] ?? 0);
      return Number.isFinite(value) ? String(value) : "0";
    });
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) throw new Error(`Invalid formula for ${field.id}`);
    // Safe after the character whitelist: no names, property access, or calls are possible.
    const result = Function(`"use strict"; return (${expression})`)();
    if (!Number.isFinite(result)) throw new Error(`Formula for ${field.id} did not produce a number`);
    calculated[field.id] = result;
  }
  return calculated;
}

export function validateFormula(formula: string, fields: Field[]) {
  const ids = new Set(fields.filter((field) => field.type === "NUMBER").map((field) => field.id));
  const references = [...formula.matchAll(/\{([a-zA-Z0-9-]+)\}/g)].map((match) => match[1]);
  if (references.some((id) => !ids.has(id))) throw new Error("Computed formulas may only reference numeric fields using {field-id}");
  const expression = formula.replace(/\{[a-zA-Z0-9-]+\}/g, "1");
  if (!expression || !/^[0-9+\-*/().\s]+$/.test(expression)) throw new Error("Formula may only contain numbers, arithmetic operators, parentheses, and {field-id} references");
}
