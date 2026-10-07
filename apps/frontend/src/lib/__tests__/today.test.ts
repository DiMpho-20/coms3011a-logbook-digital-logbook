import { describe, it, expect } from "vitest";
import type { Entry, GradeAssessment, GradeModule, Reminder } from "@logbook/shared";
import { computeModule } from "../grades";
import { RADAR_LIMIT, buildNextUp, buildRadar } from "../today";

const TODAY = "2026-10-06";

const assessment = (over: Partial<GradeAssessment>): GradeAssessment => ({
  id: over.name ?? "a",
  moduleId: "m",
  name: "Assessment",
  section: null,
  weight: 50,
  markObtained: null,
  markMax: null,
  markPercent: null,
  missed: false,
  date: null,
  dateKind: null,
  remind: true,
  position: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const module = (over: Partial<GradeModule>): GradeModule => ({
  id: over.code ?? "m",
  code: "COMS3011A",
  name: "Software Design",
  academicYear: 2026,
  type: "SEMESTER",
  semester: 2,
  semester1Weight: null,
  targetMark: null,
  createdAt: "",
  updatedAt: "",
  assessments: [],
  ...over,
});

const entry = (over: Partial<Entry>): Entry => ({
  id: "e",
  projectId: "p1",
  durationMinutes: 30,
  entryDate: null,
  dueDate: null,
  values: {},
  format: null,
  tags: [],
  createdAt: "",
  updatedAt: "",
  status: "OPEN",
  completedAt: null,
  ...over,
});

const reminder = (over: Partial<Reminder>): Reminder => ({
  id: "r",
  title: "Book study room",
  note: null,
  source: "MANUAL",
  status: "PENDING",
  remindAt: "2026-10-12T09:00:00",
  completedAt: null,
  dismissedAt: null,
  createdAt: "",
  entry: null,
  assessment: null,
  ...over,
});

const summaries = (modules: GradeModule[]) => new Map(modules.map((m) => [m.id, computeModule(m, { target: m.targetMark })]));

describe("Next up", () => {
  const base = {
    projectNames: { p1: "Physics lab" },
    describeEntry: () => "Lab report",
    today: TODAY,
  };

  it("puts tests, due dates, logbook deadlines and reminders in one list, soonest first", () => {
    const items = buildNextUp({
      ...base,
      modules: [
        module({
          code: "MATH2015",
          assessments: [assessment({ name: "Maths test", date: "2026-10-07", dateKind: "TEST" })],
        }),
      ],
      entries: [entry({ dueDate: "2026-10-09T00:00:00.000Z" })],
      reminders: [reminder({})],
    });
    expect(items.map((i) => [i.kind, i.title, i.context, i.days])).toEqual([
      ["TEST", "Maths test", "MATH2015", 1],
      ["ENTRY_DUE", "Lab report", "Physics lab", 3],
      ["REMINDER", "Book study room", null, 6],
    ]);
  });

  it("leaves out generated reminders, whose subject is already listed", () => {
    const items = buildNextUp({
      ...base,
      modules: [],
      entries: [],
      reminders: [reminder({ id: "g", source: "ASSESSMENT" }), reminder({ id: "d", source: "DUE_SOON" })],
    });
    expect(items).toEqual([]);
  });

  it("only looks 14 days ahead, skips past and finished things, and stops at five", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      assessment({ name: `T${i}`, date: `2026-10-${String(7 + i).padStart(2, "0")}`, dateKind: "TEST" })
    );
    const items = buildNextUp({
      ...base,
      modules: [module({ assessments: [...many, assessment({ name: "Far", date: "2026-10-30", dateKind: "TEST" })] })],
      entries: [
        entry({ id: "past", dueDate: "2026-10-01T00:00:00.000Z" }),
        entry({ id: "done", dueDate: "2026-10-08T00:00:00.000Z", status: "DONE" }),
      ],
      reminders: [],
    });
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.title)).toEqual(["T0", "T1", "T2", "T3", "T4"]);
  });
});

describe("On your radar", () => {
  it("mentions overdue work and waiting reminders, with somewhere to go", () => {
    const items = buildRadar({
      modules: [],
      summaries: new Map(),
      entries: [entry({ dueDate: "2026-10-01T00:00:00.000Z" }), entry({ id: "e2", dueDate: "2026-10-02T00:00:00.000Z" })],
      dueReminders: 1,
      today: TODAY,
    });
    expect(items.map((i) => [i.text, i.href])).toEqual([
      ["2 logbook entries are past their due date.", "/open-work"],
      ["A reminder is waiting for you.", "/reminders"],
    ]);
  });

  it("uses the engine's target status for a target that needs more than the average so far", () => {
    // 50% average on the marked half; a 75% target needs 100% on the rest.
    const stretch = module({
      code: "COMS3011A",
      targetMark: 70,
      assessments: [assessment({ name: "Mid", weight: 50, markPercent: 50 }), assessment({ name: "Exam", weight: 50 })],
    });
    const items = buildRadar({ modules: [stretch], summaries: summaries([stretch]), entries: [], dueReminders: 0, today: TODAY });
    expect(items[0].text).toBe("COMS3011A: you'll need about 90.0% on the remaining work to reach 70%.");
  });

  it("says calmly when a target is out of reach, and asks for missing set-up and marks", () => {
    const unreachable = module({
      code: "MATH2015",
      targetMark: 90,
      assessments: [assessment({ name: "Mid", weight: 50, markPercent: 40 }), assessment({ name: "Exam", weight: 50 })],
    });
    const incomplete = module({ code: "CHEM1000", assessments: [assessment({ name: "Only", weight: 40 })] });
    const awaiting = module({
      code: "PHYS1000",
      assessments: [assessment({ name: "Test 1", weight: 100, date: "2026-10-01", dateKind: "TEST" })],
    });
    const modules = [unreachable, incomplete, awaiting];
    const items = buildRadar({ modules, summaries: summaries(modules), entries: [], dueReminders: 0, today: TODAY });
    expect(items.map((i) => i.text)).toEqual([
      "MATH2015: your 90% target is out of reach now. A different target may be more useful.",
      "CHEM1000: finish setting up its assessments to see what you need.",
      "PHYS1000: add your mark for Test 1 when you have it.",
    ]);
    for (const item of items) expect(item.text).not.toMatch(/!/);
  });

  it("doesn't react to a low mark on its own, a target on track, or a secured one", () => {
    const low = module({
      code: "LOW1000",
      assessments: [assessment({ name: "Quiz", weight: 50, markPercent: 20 }), assessment({ name: "Exam", weight: 50 })],
    });
    const onTrack = module({
      code: "OK1000",
      targetMark: 50,
      assessments: [assessment({ name: "Mid", weight: 50, markPercent: 80 }), assessment({ name: "Exam", weight: 50 })],
    });
    const modules = [low, onTrack];
    expect(buildRadar({ modules, summaries: summaries(modules), entries: [], dueReminders: 0, today: TODAY })).toEqual([]);
  });

  it(`never shows more than ${RADAR_LIMIT}`, () => {
    const incomplete = Array.from({ length: 6 }, (_, i) =>
      module({ code: `MOD${i}`, assessments: [assessment({ name: "Only", weight: 10 })] })
    );
    expect(
      buildRadar({ modules: incomplete, summaries: summaries(incomplete), entries: [], dueReminders: 4, today: TODAY })
    ).toHaveLength(RADAR_LIMIT);
  });
});
