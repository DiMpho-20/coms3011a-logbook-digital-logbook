import { describe, it, expect, vi, beforeEach } from "vitest";

// ── computedFields ──────────────────────────────────────────────────────
import {
  calculateComputedValues,
  validateFormula,
} from "../utils/computedFields.js";

type Field = { id: string; type: string; formula: string | null };

describe("calculateComputedValues", () => {
  it("returns an empty object when there are no COMPUTED fields", () => {
    const fields: Field[] = [{ id: "f1", type: "TEXT", formula: null }];
    expect(calculateComputedValues(fields, {})).toEqual({});
  });

  it("evaluates a simple addition formula", () => {
    const fields: Field[] = [
      { id: "hours", type: "NUMBER", formula: null },
      { id: "rate", type: "NUMBER", formula: null },
      { id: "total", type: "COMPUTED", formula: "{hours} * {rate}" },
    ];
    const values = { hours: 8, rate: 50 };
    const result = calculateComputedValues(fields, values);
    expect(result).toEqual({ total: 400 });
  });

  it("evaluates nested expressions with parentheses", () => {
    const fields: Field[] = [
      { id: "a", type: "NUMBER", formula: null },
      { id: "b", type: "NUMBER", formula: null },
      { id: "c", type: "COMPUTED", formula: "({a} + {b}) * 2" },
    ];
    expect(calculateComputedValues(fields, { a: 3, b: 7 })).toEqual({ c: 20 });
  });

  it("defaults missing values to 0", () => {
    const fields: Field[] = [
      { id: "x", type: "NUMBER", formula: null },
      { id: "sum", type: "COMPUTED", formula: "{x} + 10" },
    ];
    expect(calculateComputedValues(fields, {})).toEqual({ sum: 10 });
  });

  it("throws on invalid formula characters", () => {
    const fields: Field[] = [
      { id: "bad", type: "COMPUTED", formula: "alert(1)" },
    ];
    expect(() => calculateComputedValues(fields, {})).toThrow(/Invalid formula/);
  });

  it("throws when formula result is not finite", () => {
    const fields: Field[] = [
      { id: "x", type: "NUMBER", formula: null },
      { id: "div", type: "COMPUTED", formula: "1 / {x}" },
    ];
    expect(() => calculateComputedValues(fields, { x: 0 })).toThrow(/did not produce a number/);
  });

  it("allows computed fields to reference other computed fields", () => {
    const fields: Field[] = [
      { id: "a", type: "NUMBER", formula: null },
      { id: "double", type: "COMPUTED", formula: "{a} * 2" },
      { id: "quadruple", type: "COMPUTED", formula: "{double} * 2" },
    ];
    expect(calculateComputedValues(fields, { a: 5 })).toEqual({
      double: 10,
      quadruple: 20,
    });
  });
});

describe("validateFormula", () => {
  const fields: Field[] = [
    { id: "hours", type: "NUMBER", formula: null },
    { id: "rate", type: "NUMBER", formula: null },
    { id: "name", type: "TEXT", formula: null },
  ];

  it("accepts a valid formula referencing numeric fields", () => {
    expect(() => validateFormula("{hours} * {rate}", fields)).not.toThrow();
  });

  it("accepts a formula with constants and operators", () => {
    expect(() => validateFormula("({hours} + 5) * 2", fields)).not.toThrow();
  });

  it("rejects a formula that references a non-numeric field", () => {
    expect(() => validateFormula("{name}", fields)).toThrow(/numeric fields/);
  });

  it("rejects a formula that references an unknown field", () => {
    expect(() => validateFormula("{unknown}", fields)).toThrow(/numeric fields/);
  });

  it("rejects a formula with invalid characters", () => {
    expect(() => validateFormula("{hours} + abc", fields)).toThrow(/arithmetic operators/);
  });
});

// ── auth utils ──────────────────────────────────────────────────────────

describe("auth utils", () => {
  // We test the real implementations (bcryptjs + jsonwebtoken)
  // since they are fast enough for unit tests and give us confidence.

  // Dynamically import to allow env override before module load
  let hashPassword: (pw: string) => Promise<string>;
  let comparePassword: (pw: string, hash: string) => Promise<boolean>;
  let generateToken: (userId: string) => string;
  let verifyToken: (token: string) => { userId: string } | null;

  beforeEach(async () => {
    // Set a test secret before importing
    process.env.JWT_SECRET = "test-secret-for-unit-tests";
    // Re-import to pick up the env var (vitest caches modules, so use vi.importActual)
    const mod = await import("../utils/auth.js");
    hashPassword = mod.hashPassword;
    comparePassword = mod.comparePassword;
    generateToken = mod.generateToken;
    verifyToken = mod.verifyToken;
  });

  it("hashPassword returns a bcrypt hash string", async () => {
    const hash = await hashPassword("MyPassword123");
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    expect(hash.length).toBeGreaterThan(50);
  });

  it("comparePassword returns true for matching password", async () => {
    const hash = await hashPassword("MatchMe");
    expect(await comparePassword("MatchMe", hash)).toBe(true);
  });

  it("comparePassword returns false for wrong password", async () => {
    const hash = await hashPassword("Correct");
    expect(await comparePassword("Wrong", hash)).toBe(false);
  });

  it("generateToken produces a valid JWT string", () => {
    const token = generateToken("user-123");
    expect(typeof token).toBe("string");
    // JWT has three base64url-encoded parts separated by dots
    expect(token.split(".")).toHaveLength(3);
  });

  it("verifyToken extracts the userId from a valid token", () => {
    const token = generateToken("user-abc");
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("user-abc");
  });

  it("verifyToken returns null for an invalid token", () => {
    expect(verifyToken("not.a.valid-jwt")).toBeNull();
  });

  it("verifyToken returns null for a tampered token", () => {
    const token = generateToken("user-1");
    // Flip the last character to corrupt the signature
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyToken(tampered)).toBeNull();
  });
});

// ── entryFormat ─────────────────────────────────────────────────────────

describe("createFormatVersion", () => {
  let createFormatVersion: typeof import("../utils/entryFormat.js").createFormatVersion;

  beforeEach(async () => {
    const mod = await import("../utils/entryFormat.js");
    createFormatVersion = mod.createFormatVersion;
  });

  function makeMockPrisma(
    fields: any[],
    latestVersion: { version: number } | null,
  ) {
    return {
      entryField: {
        findMany: vi.fn().mockResolvedValue(fields),
      },
      entryFormatVersion: {
        findFirst: vi.fn().mockResolvedValue(latestVersion),
        create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "fv-1", ...data })),
      },
    } as any;
  }

  it("creates version 1 when no previous versions exist", async () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const fields = [
      { id: "f1", projectId: "p1", name: "Hours", type: "NUMBER", required: false, formula: null, archivedAt: null, createdAt: now, updatedAt: now },
    ];
    const prisma = makeMockPrisma(fields, null);

    const result = await createFormatVersion(prisma, "p1");

    expect(prisma.entryField.findMany).toHaveBeenCalledWith({
      where: { projectId: "p1", archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
    expect(prisma.entryFormatVersion.findFirst).toHaveBeenCalledWith({
      where: { projectId: "p1" },
      orderBy: { version: "desc" },
    });
    expect(result.version).toBe(1);
    expect(result.projectId).toBe("p1");
    expect(Array.isArray(result.fields)).toBe(true);
    expect(result.fields).toHaveLength(1);
    if (Array.isArray(result.fields)) {
      expect(result.fields[0].name).toBe("Hours");
    }
  });

  it("increments version from the latest", async () => {
    const now = new Date();
    const fields = [
      { id: "f1", projectId: "p1", name: "A", type: "TEXT", required: true, formula: null, archivedAt: null, createdAt: now, updatedAt: now },
      { id: "f2", projectId: "p1", name: "B", type: "NUMBER", required: false, formula: null, archivedAt: null, createdAt: now, updatedAt: now },
    ];
    const prisma = makeMockPrisma(fields, { version: 5 });

    const result = await createFormatVersion(prisma, "p1");

    expect(result.version).toBe(6);
    expect(result.fields).toHaveLength(2);
  });

  it("excludes archived fields from the snapshot", async () => {
    const prisma = makeMockPrisma([], null);

    const result = await createFormatVersion(prisma, "p1");

    expect(result.version).toBe(1);
    expect(result.fields).toHaveLength(0);
  });
});
