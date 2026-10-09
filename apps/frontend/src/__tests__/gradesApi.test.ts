import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from "../api/client";
import {
  createAssessment,
  createGradeModule,
  deleteAssessment,
  deleteGradeModule,
  fetchGradeModule,
  fetchGradeModules,
  updateAssessment,
  updateGradeModule,
} from "../api";

// FEAT-009 (My Grades) — the grades requests and their offline fallback.

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

const networkError = { code: "ERR_NETWORK", message: "Network Error" };
const ok = (data: unknown) => ({ data }) as never;
const module = { id: "m1", code: "COMS3011A", assessments: [] };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setOnline(true);
});

describe("grades requests", () => {
  it("lists modules, optionally for one year", async () => {
    vi.mocked(api.get).mockResolvedValue(ok([module]));
    expect(await fetchGradeModules()).toEqual([module]);
    expect(api.get).toHaveBeenLastCalledWith("/grades/modules", { params: {} });
    await fetchGradeModules(2026);
    expect(api.get).toHaveBeenLastCalledWith("/grades/modules", { params: { year: 2026 } });
  });

  it("reads one module", async () => {
    vi.mocked(api.get).mockResolvedValue(ok(module));
    expect(await fetchGradeModule("m1")).toEqual(module);
    expect(api.get).toHaveBeenCalledWith("/grades/modules/m1");
  });

  it("creates, updates and deletes modules", async () => {
    const input = { code: "COMS3011A", name: "Software Design", academicYear: 2026, type: "SEMESTER" as const, semester: 2 as const };
    vi.mocked(api.post).mockResolvedValue(ok(module));
    vi.mocked(api.patch).mockResolvedValue(ok(module));
    vi.mocked(api.delete).mockResolvedValue(ok(null));

    expect(await createGradeModule(input)).toEqual(module);
    expect(api.post).toHaveBeenCalledWith("/grades/modules", input);
    await updateGradeModule("m1", { targetMark: 75 });
    expect(api.patch).toHaveBeenCalledWith("/grades/modules/m1", { targetMark: 75 });
    await deleteGradeModule("m1");
    expect(api.delete).toHaveBeenCalledWith("/grades/modules/m1");
  });

  it("creates, updates and deletes assessments", async () => {
    const assessment = { id: "a1", name: "Midterm" };
    vi.mocked(api.post).mockResolvedValue(ok(assessment));
    vi.mocked(api.patch).mockResolvedValue(ok(assessment));
    vi.mocked(api.delete).mockResolvedValue(ok(null));

    await createAssessment("m1", { name: "Midterm", weight: 40, markObtained: 25, markMax: 40 });
    expect(api.post).toHaveBeenCalledWith("/grades/modules/m1/assessments", {
      name: "Midterm",
      weight: 40,
      markObtained: 25,
      markMax: 40,
    });
    await updateAssessment("a1", { markPercent: 62.5 });
    expect(api.patch).toHaveBeenCalledWith("/grades/assessments/a1", { markPercent: 62.5 });
    await deleteAssessment("a1");
    expect(api.delete).toHaveBeenCalledWith("/grades/assessments/a1");
  });

  it("shows the last modules fetched while offline", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(ok([module]));
    await fetchGradeModules(2026);

    setOnline(false);
    vi.mocked(api.get).mockRejectedValueOnce(networkError);
    expect(await fetchGradeModules(2026)).toEqual([module]);
  });

  it("still fails offline when nothing was fetched before", async () => {
    setOnline(false);
    vi.mocked(api.get).mockRejectedValueOnce(networkError);
    await expect(fetchGradeModule("never-seen")).rejects.toEqual(networkError);
  });
});
