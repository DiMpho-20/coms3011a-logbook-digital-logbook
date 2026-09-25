/**
 * The expression language behind custom statistics (US16).
 *
 * This is deliberately NOT the computed-field language in computedFields.ts.
 * That one works inside a single entry — `{hours} * {rate}` is evaluated once
 * per entry and stored. This one works *across* an owner's entries:
 * `SUM(hours) / COUNT()` is a single number for a whole project.
 *
 * Nothing here touches the database or executes user input. The parser turns
 * text into a small tree of known node types and the evaluator walks it,
 * asking an injected source for each aggregate. There is no eval, no
 * Function(), and no SQL built from user text — a field name reaches the
 * database only after being matched against that project's real fields, and
 * then only as a bound parameter.
 */

export type AggregateFn = "SUM" | "AVG" | "MIN" | "MAX";

const AGGREGATES: readonly AggregateFn[] = ["SUM", "AVG", "MIN", "MAX"];

export type ExpressionNode =
  | { kind: "number"; value: number }
  | { kind: "count" }
  | { kind: "aggregate"; fn: AggregateFn; field: string }
  | { kind: "negate"; operand: ExpressionNode }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: ExpressionNode; right: ExpressionNode };

/**
 * Every failure here is safe to show a user: messages name what they typed
 * and never leak ids, SQL, or internals.
 */
export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

// ── Tokenizer ────────────────────────────────────────────────────────────

type Token =
  | { type: "number"; value: number }
  | { type: "name"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" };

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

/**
 * Field names are free text — "Tasks Completed" is a perfectly ordinary
 * name — so a bare word cannot be the only way to write one. Braces are
 * already how this repository writes a field name inside a formula, so the
 * same convention carries over: `SUM({Tasks Completed})`. A bare word still
 * works for the simple names people usually have.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "op", value: char });
      index += 1;
      continue;
    }

    if (DIGIT.test(char) || (char === "." && DIGIT.test(source[index + 1] ?? ""))) {
      let text = "";
      while (index < source.length && (DIGIT.test(source[index]) || source[index] === ".")) {
        text += source[index];
        index += 1;
      }
      const value = Number(text);
      if (!Number.isFinite(value)) throw new ExpressionError(`"${text}" is not a valid number.`);
      tokens.push({ type: "number", value });
      continue;
    }

    if (char === "{") {
      const end = source.indexOf("}", index + 1);
      if (end === -1) throw new ExpressionError("A field name opened with { was never closed with }.");
      const name = source.slice(index + 1, end).trim();
      if (!name) throw new ExpressionError("A field name in { } is empty.");
      tokens.push({ type: "name", value: name });
      index = end + 1;
      continue;
    }

    if (IDENTIFIER_START.test(char)) {
      let text = "";
      while (index < source.length && IDENTIFIER_PART.test(source[index])) {
        text += source[index];
        index += 1;
      }
      tokens.push({ type: "name", value: text });
      continue;
    }

    throw new ExpressionError(`"${char}" is not something an expression can contain.`);
  }

  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────────
//
// Recursive descent, lowest precedence first:
//   expression := term (("+" | "-") term)*
//   term       := factor (("*" | "/") factor)*
//   factor     := "-" factor | "(" expression ")" | number | call
//   call       := NAME "(" [NAME] ")"
//
// so SUM(a) + SUM(b) * 2 parses as SUM(a) + (SUM(b) * 2).

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private next(): Token | undefined {
    return this.tokens[this.position++];
  }

  parse(): ExpressionNode {
    const node = this.parseExpression();
    const leftover = this.peek();
    if (leftover) {
      throw new ExpressionError(
        leftover.type === "paren" && leftover.value === ")"
          ? "There is a ) without a matching (."
          : "The expression has something extra on the end."
      );
    }
    return node;
  }

  private parseExpression(): ExpressionNode {
    let left = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token?.type !== "op" || (token.value !== "+" && token.value !== "-")) return left;
      this.next();
      left = { kind: "binary", op: token.value, left, right: this.parseTerm() };
    }
  }

  private parseTerm(): ExpressionNode {
    let left = this.parseFactor();
    for (;;) {
      const token = this.peek();
      if (token?.type !== "op" || (token.value !== "*" && token.value !== "/")) return left;
      this.next();
      left = { kind: "binary", op: token.value, left, right: this.parseFactor() };
    }
  }

  private parseFactor(): ExpressionNode {
    const token = this.next();
    if (!token) throw new ExpressionError("The expression ends too early — something is missing.");

    if (token.type === "op" && token.value === "-") {
      return { kind: "negate", operand: this.parseFactor() };
    }

    if (token.type === "op") {
      throw new ExpressionError(`"${token.value}" needs a value on both sides.`);
    }

    if (token.type === "number") {
      return { kind: "number", value: token.value };
    }

    if (token.type === "paren") {
      if (token.value === ")") throw new ExpressionError("There is a ) without a matching (.");
      const inner = this.parseExpression();
      const closing = this.next();
      if (!closing || closing.type !== "paren" || closing.value !== ")") {
        throw new ExpressionError("There is a ( without a matching ).");
      }
      return inner;
    }

    return this.parseCall(token.value);
  }

  /** A bare name is only ever a function here; fields are always inside a call. */
  private parseCall(name: string): ExpressionNode {
    const opening = this.next();
    if (!opening || opening.type !== "paren" || opening.value !== "(") {
      throw new ExpressionError(
        `"${name}" is not a function. Use COUNT(), SUM(field), AVG(field), MIN(field) or MAX(field).`
      );
    }

    const canonical = name.toUpperCase();

    if (canonical === "COUNT") {
      const closing = this.next();
      if (!closing || closing.type !== "paren" || closing.value !== ")") {
        throw new ExpressionError("COUNT() counts your entries and takes no field, so write it as COUNT().");
      }
      return { kind: "count" };
    }

    if (!AGGREGATES.includes(canonical as AggregateFn)) {
      throw new ExpressionError(
        `"${name}" is not a function this expression understands. Use COUNT(), SUM(field), AVG(field), MIN(field) or MAX(field).`
      );
    }

    const argument = this.next();
    if (!argument || argument.type !== "name") {
      throw new ExpressionError(`${canonical}() needs the name of a field, for example ${canonical}(hours).`);
    }
    const closing = this.next();
    if (!closing || closing.type !== "paren" || closing.value !== ")") {
      throw new ExpressionError(`${canonical}(${argument.value}) is missing its closing ).`);
    }

    return { kind: "aggregate", fn: canonical as AggregateFn, field: argument.value };
  }
}

/** Text in, tree out. Throws ExpressionError with a message safe to display. */
export function parseExpression(source: string): ExpressionNode {
  if (!source || !source.trim()) throw new ExpressionError("Write an expression first, for example SUM(hours) / COUNT().");
  return new Parser(tokenize(source)).parse();
}

/**
 * Every (function, field) pair the tree asks for, de-duplicated — so the
 * caller can fetch each field's aggregates once instead of once per mention.
 */
export function aggregatesUsed(node: ExpressionNode): { fn: AggregateFn; field: string }[] {
  const found = new Map<string, { fn: AggregateFn; field: string }>();
  const walk = (current: ExpressionNode): void => {
    switch (current.kind) {
      case "aggregate":
        found.set(`${current.fn}:${current.field.toLowerCase()}`, { fn: current.fn, field: current.field });
        return;
      case "negate":
        return walk(current.operand);
      case "binary":
        walk(current.left);
        return walk(current.right);
      default:
        return;
    }
  };
  walk(node);
  return [...found.values()];
}

/** Supplies the numbers the tree asks for. Kept separate so the evaluator needs no database. */
export interface AggregateSource {
  /** How many entries are in scope. */
  count(): number;
  /** The aggregate for one field, or a thrown ExpressionError explaining why there isn't one. */
  aggregate(fn: AggregateFn, field: string): number;
}

export function evaluate(node: ExpressionNode, source: AggregateSource): number {
  const result = walk(node, source);
  if (!Number.isFinite(result)) {
    throw new ExpressionError("That expression did not work out to a number.");
  }
  return result;
}

function walk(node: ExpressionNode, source: AggregateSource): number {
  switch (node.kind) {
    case "number":
      return node.value;
    case "count":
      return source.count();
    case "aggregate":
      return source.aggregate(node.fn, node.field);
    case "negate":
      return -walk(node.operand, source);
    case "binary": {
      const left = walk(node.left, source);
      const right = walk(node.right, source);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          // Reported rather than allowed to become Infinity or NaN.
          if (right === 0) throw new ExpressionError("That expression divides by zero.");
          return left / right;
      }
    }
  }
}
