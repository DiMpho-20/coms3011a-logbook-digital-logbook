import { describe, expect, it } from "vitest";
import { createProjectSchema, updateProjectSchema } from "../schemas/project.schema.js";

describe("project names", () => {
  it("refuses a name made only of spaces", () => {
    expect(createProjectSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  it("trims a name so it cannot sit beside the same name with stray spaces", () => {
    expect(createProjectSchema.parse({ name: "  Thesis " }).name).toBe("Thesis");
  });
});
