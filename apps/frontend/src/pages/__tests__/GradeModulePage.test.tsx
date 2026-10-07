import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GradeAssessment, GradeModule } from "@logbook/shared";

vi.mock("../../api", () => ({
  fetchGradeModule: vi.fn(),
  updateGradeModule: vi.fn(),
  deleteGradeModule: vi.fn(),
  createAssessment: vi.fn(),
  updateAssessment: vi.fn(),
  deleteAssessment: vi.fn(),
  createGradeModule: vi.fn(),
}));

import * as api from "../../api";
import GradeModulePage from "../GradeModulePage";

const assessment = (over: Partial<GradeAssessment>): GradeAssessment => ({
  id: over.name ?? crypto.randomUUID(),
  moduleId: "coms",
  name: "Assessment",
  section: null,
  weight: 10,
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

/** The worked example from the brief. */
const coms = (over: Partial<GradeModule> = {}): GradeModule => ({
  id: "coms",
  code: "COMS3011A",
  name: "Software Design",
  academicYear: 2026,
  type: "SEMESTER",
  semester: 2,
  semester1Weight: null,
  targetMark: 50,
  createdAt: "",
  updatedAt: "",
  assessments: [
    assessment({ name: "Midterm", weight: 40, markObtained: 25, markMax: 40 }),
    assessment({ name: "Tutorial 1", weight: 10, markObtained: 10, markMax: 10 }),
    assessment({ name: "Tutorial 2", weight: 10, markPercent: 100 }),
    assessment({ name: "Exam", weight: 40 }),
  ],
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/grades/coms"]}>
      <Routes>
        <Route path="/grades/:moduleId" element={<GradeModulePage />} />
        <Route path="/grades" element={<p>Overview</p>} />
      </Routes>
    </MemoryRouter>
  );

/** An assessment row; the list is a grid of rows with table semantics, so phones can stack it. */
const row = (name: string) => screen.getByText(name, { selector: "p" }).closest('[role="row"]') as HTMLElement;
/** The page has loaded once the module's heading is up. */
const loaded = () => screen.findByRole("heading", { level: 1, name: /COMS3011A/ });
/** A summary tile, found by its label (the explainer repeats some figures). */
const tile = (label: string) => screen.getByText(label, { selector: "p" }).parentElement!;
/** The what-if panel's projected final mark. */
const projected = (panel: HTMLElement) => within(panel).getByText("Projected final mark", { selector: "p" }).parentElement!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchGradeModule).mockResolvedValue(coms());
});

describe("module summary", () => {
  it("shows secured, average, marked and remaining — never a bare current mark", async () => {
    renderPage();
    await loaded();
    expect(tile("Secured")).toHaveTextContent("45.0 / 100");
    expect(tile("Average on marked work")).toHaveTextContent("75.0%");
    expect(tile("Marked")).toHaveTextContent("60.0%");
    expect(tile("Remaining")).toHaveTextContent("40.0%");
    // The counts behind the weights.
    expect(tile("Marked")).toHaveTextContent("3 of 4 assessments");
    expect(tile("Remaining")).toHaveTextContent("1 assessment to come");
    expect(screen.queryByText(/current mark/i)).toBeNull();
  });

  it("shows the mark as entered apart from its contribution in points", async () => {
    renderPage();
    await loaded();
    const midterm = row("Midterm");
    expect(within(midterm).getByText("25 / 40 = 62.5%")).toBeInTheDocument();
    expect(within(midterm).getByText("25.0 pts")).toBeInTheDocument();
    expect(within(row("Tutorial 2")).getByText("100.0%")).toBeInTheDocument();
    expect(within(row("Exam")).getByText("Not marked yet")).toBeInTheDocument();
  });

  it("keeps a missed assessment distinct from an entered 0", async () => {
    vi.mocked(api.fetchGradeModule).mockResolvedValue(
      coms({
        assessments: [
          assessment({ name: "Quiz", weight: 50, missed: true }),
          assessment({ name: "Zero", weight: 50, markObtained: 0, markMax: 20 }),
        ],
      })
    );
    renderPage();
    await loaded();
    // Once as the mark ("Missed") and once as the status chip.
    const missed = within(row("Quiz")).getAllByText("Missed");
    expect(missed).toHaveLength(2);
    // The chip says it with an icon too, not by colour alone.
    expect(missed.some((el) => el.querySelector("svg"))).toBe(true);
    expect(within(row("Zero")).getByText("0 / 20 = 0.0%")).toBeInTheDocument();
    expect(within(row("Zero")).getByText("Marked")).toBeInTheDocument();
  });

  it("groups a full-year module by semester, showing both weighting levels", async () => {
    vi.mocked(api.fetchGradeModule).mockResolvedValue(
      coms({
        type: "FULL_YEAR",
        semester: null,
        semester1Weight: 60,
        assessments: [
          assessment({ name: "Test", section: 1, weight: 40, markPercent: 70 }),
          assessment({ name: "Assignment", section: 1, weight: 60, markPercent: 80 }),
        ],
      })
    );
    renderPage();
    const s1 = await screen.findByRole("region", { name: "Semester 1" });
    expect(within(s1).getByText("counts 60% of the module")).toBeInTheDocument();
    expect(within(s1).getByText("Section mark 76.0% · 45.6 pts secured")).toBeInTheDocument();
    expect(within(s1).getByText("24% of module")).toBeInTheDocument();
    const s2 = screen.getByRole("region", { name: "Semester 2" });
    expect(within(s2).getByText("No assessments yet", { selector: "span" })).toBeInTheDocument();
  });
});

describe("weights", () => {
  it("warns about incomplete weights and switches off target and what-if", async () => {
    vi.mocked(api.fetchGradeModule).mockResolvedValue(
      coms({ assessments: [assessment({ name: "Midterm", weight: 40, markPercent: 50 }), assessment({ name: "Final", weight: 50 })] })
    );
    renderPage();
    expect(await screen.findByText("Weights total 90% — 10% unassigned.")).toBeInTheDocument();
    expect(screen.getByText(/Weights total 90% · 10% unassigned/)).toBeInTheDocument();
    expect(screen.getByText("Finish setting up this module's weights to see what you need.")).toBeInTheDocument();
    expect(screen.getByText("Finish setting up this module's weights to try what-if marks.")).toBeInTheDocument();
  });
});

describe("what do I need?", () => {
  it("gives the required mark with its assumption and the highest possible mark", async () => {
    renderPage();
    const panel = await screen.findByRole("region", { name: "What do I need?" });
    expect(within(panel).getByText("On track")).toBeInTheDocument();
    expect(within(panel).getByText("12.5%")).toBeInTheDocument();
    expect(panel).toHaveTextContent("You need 12.5% on the remaining 40% to finish with 50%.");
    expect(within(panel).getByText(/same mark on every remaining assessment/)).toBeInTheDocument();
    expect(panel).toHaveTextContent("Highest possible final mark: 85.0%");
  });

  it("says when a target is already secured or out of reach", async () => {
    vi.mocked(api.fetchGradeModule).mockResolvedValue(coms({ targetMark: 40 }));
    const { unmount } = renderPage();
    const securedPanel = await screen.findByRole("region", { name: "What do I need?" });
    expect(within(securedPanel).getByText("Secured")).toBeInTheDocument();
    unmount();

    vi.mocked(api.fetchGradeModule).mockResolvedValue(coms({ targetMark: 90 }));
    renderPage();
    const panel = await screen.findByRole("region", { name: "What do I need?" });
    expect(within(panel).getByText("Out of reach")).toBeInTheDocument();
    expect(panel).toHaveTextContent("90% is no longer reachable");
  });

  it("saves a chosen target", async () => {
    vi.mocked(api.updateGradeModule).mockResolvedValue(coms({ targetMark: 75 }));
    renderPage();
    const panel = await screen.findByRole("region", { name: "What do I need?" });
    fireEvent.click(within(panel).getByRole("button", { name: "75%" }));
    await waitFor(() => expect(api.updateGradeModule).toHaveBeenCalledWith("coms", { targetMark: 75 }));
    expect(await within(panel).findByText("75.0%")).toBeInTheDocument(); // (75 - 45) / 40
  });
});

describe("what if?", () => {
  it("projects a final mark, clearly labelled as not saved", async () => {
    renderPage();
    const panel = await screen.findByRole("region", { name: "What if?" });
    expect(within(panel).getByText("Hypothetical — not saved")).toBeInTheDocument();
    // Starts at the average so far: 45 + 75% of 40 = 75.
    expect(projected(panel)).toHaveTextContent("75.0%");
    fireEvent.change(within(panel).getByLabelText("Hypothetical mark on everything left"), { target: { value: "60" } });
    expect(projected(panel)).toHaveTextContent("69.0%");
    expect(api.updateAssessment).not.toHaveBeenCalled();
    expect(api.updateGradeModule).not.toHaveBeenCalled();
  });

  it("tabulates outcomes when one assessment is left", async () => {
    renderPage();
    const panel = await screen.findByRole("region", { name: "What if?" });
    const table = within(panel).getByRole("table");
    for (const [mark, final] of [["40%", "61.0%"], ["50%", "65.0%"], ["60%", "69.0%"], ["70%", "73.0%"], ["80%", "77.0%"]]) {
      expect(within(table).getByText(mark).closest("tr")).toHaveTextContent(final);
    }
  });

  it("lets each remaining assessment have its own mark", async () => {
    vi.mocked(api.fetchGradeModule).mockResolvedValue(
      coms({
        assessments: [
          assessment({ name: "Midterm", weight: 40, markPercent: 62.5 }),
          assessment({ name: "Project", weight: 20 }),
          assessment({ name: "Exam", weight: 40 }),
        ],
      })
    );
    renderPage();
    const panel = await screen.findByRole("region", { name: "What if?" });
    fireEvent.click(within(panel).getByRole("radio", { name: "Set each assessment" }));
    fireEvent.change(within(panel).getByLabelText("Hypothetical mark on everything left"), { target: { value: "50" } });
    fireEvent.change(within(panel).getByLabelText("What-if mark for Project"), { target: { value: "100" } });
    // 25 + 20 (Project at 100%) + 20 (Exam at 50%)
    expect(projected(panel)).toHaveTextContent("65.0%");
  });
});

describe("explanation", () => {
  it("shows the engine's working", async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByText("How is this calculated?"));
    const midterm = screen.getByRole("rowheader", { name: "Midterm" }).closest("tr")!;
    expect(midterm).toHaveTextContent("25 / 40 = 62.5% × 40% of the module");
    expect(midterm).toHaveTextContent("25.0 pts");
    expect(screen.getByRole("rowheader", { name: "Required on remaining work" }).closest("tr")).toHaveTextContent("12.5%");
  });
});

describe("assessments", () => {
  it("adds an assessment entered as 25 / 40, showing the conversion as it is typed", async () => {
    vi.mocked(api.createAssessment).mockResolvedValue(assessment({ name: "Quiz" }));
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Add assessment/ }));
    const dialog = await screen.findByRole("dialog", { name: "Add an assessment" });
    fireEvent.change(within(dialog).getByPlaceholderText("Midterm test"), { target: { value: "Quiz" } });
    fireEvent.change(within(dialog).getByLabelText("Weight (%)"), { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Mark out of" }));
    fireEvent.change(within(dialog).getByLabelText("Mark obtained"), { target: { value: "25" } });
    fireEvent.change(within(dialog).getByLabelText("Maximum mark"), { target: { value: "40" } });
    expect(within(dialog).getByText("25 / 40 = 62.5%")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Date (optional)"), { target: { value: "2026-11-15" } });
    fireEvent.change(within(dialog).getByLabelText("The date is a"), { target: { value: "TEST" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add assessment" }));

    await waitFor(() =>
      expect(api.createAssessment).toHaveBeenCalledWith("coms", {
        name: "Quiz",
        weight: 10,
        section: null,
        markObtained: 25,
        markMax: 40,
        markPercent: null,
        missed: false,
        date: "2026-11-15",
        dateKind: "TEST",
        remind: true,
      })
    );
    expect(api.fetchGradeModule).toHaveBeenCalledTimes(2); // reloaded after saving
  });

  it("offers reminders only for a dated assessment, and lets the student turn them off", async () => {
    vi.mocked(api.createAssessment).mockResolvedValue(assessment({ name: "Quiz" }));
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Add assessment/ }));
    const dialog = await screen.findByRole("dialog", { name: "Add an assessment" });
    expect(within(dialog).queryByLabelText(/Remind me 5 days and 2 days before/)).toBeNull();

    fireEvent.change(within(dialog).getByPlaceholderText("Midterm test"), { target: { value: "Tutorial" } });
    fireEvent.change(within(dialog).getByLabelText("Weight (%)"), { target: { value: "5" } });
    fireEvent.change(within(dialog).getByLabelText("Date (optional)"), { target: { value: "2026-11-20" } });
    fireEvent.change(within(dialog).getByLabelText("The date is a"), { target: { value: "DUE" } });
    const remind = within(dialog).getByLabelText(/Remind me 5 days and 2 days before/);
    expect(remind).toBeChecked();
    fireEvent.click(remind);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add assessment" }));
    await waitFor(() =>
      expect(api.createAssessment).toHaveBeenCalledWith("coms", expect.objectContaining({ date: "2026-11-20", dateKind: "DUE", remind: false }))
    );
  });

  it("refuses an impossible mark before sending it", async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Add assessment/ }));
    const dialog = await screen.findByRole("dialog", { name: "Add an assessment" });
    fireEvent.change(within(dialog).getByPlaceholderText("Midterm test"), { target: { value: "Quiz" } });
    fireEvent.change(within(dialog).getByLabelText("Weight (%)"), { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Mark out of" }));
    fireEvent.change(within(dialog).getByLabelText("Mark obtained"), { target: { value: "45" } });
    fireEvent.change(within(dialog).getByLabelText("Maximum mark"), { target: { value: "40" } });
    expect(within(dialog).getByText("This mark has a mark above the maximum.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add assessment" }));
    expect(api.createAssessment).not.toHaveBeenCalled();
  });

  it("needs the kind of date when a date is given", async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Add assessment/ }));
    const dialog = await screen.findByRole("dialog", { name: "Add an assessment" });
    fireEvent.change(within(dialog).getByPlaceholderText("Midterm test"), { target: { value: "Quiz" } });
    fireEvent.change(within(dialog).getByLabelText("Weight (%)"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Date (optional)"), { target: { value: "2026-11-15" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add assessment" }));
    expect(await within(dialog).findByText("Say whether the date is a due date or a test date.")).toBeInTheDocument();
    expect(api.createAssessment).not.toHaveBeenCalled();
  });

  it("edits an existing assessment, sending its whole mark", async () => {
    vi.mocked(api.updateAssessment).mockResolvedValue(assessment({ name: "Midterm" }));
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Edit Midterm" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit assessment" });
    expect(within(dialog).getByLabelText("Mark obtained")).toHaveValue(25);
    fireEvent.click(within(dialog).getByRole("radio", { name: "Percentage" }));
    fireEvent.change(within(dialog).getByLabelText("Percentage"), { target: { value: "70" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(api.updateAssessment).toHaveBeenCalledWith(
        "Midterm",
        expect.objectContaining({ markObtained: null, markMax: null, markPercent: 70, missed: false })
      )
    );
  });

  it("deletes an assessment after confirming in the dialog", async () => {
    vi.mocked(api.deleteAssessment).mockResolvedValue();
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Delete Exam" }));
    const dialog = await screen.findByRole("dialog", { name: 'Delete "Exam"?' });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete assessment" }));
    await waitFor(() => expect(api.deleteAssessment).toHaveBeenCalledWith("Exam"));
  });

  it("explains what deleting a module removes, and deletes nothing on Cancel", async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    const dialog = await screen.findByRole("dialog", { name: "Delete COMS3011A?" });
    expect(dialog).toHaveTextContent("This will permanently delete this module and all of its assessments.");
    // Cancel has focus, so Enter can't delete by accident.
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.deleteGradeModule).not.toHaveBeenCalled();
  });

  it("deletes the module and returns to the overview", async () => {
    vi.mocked(api.deleteGradeModule).mockResolvedValue();
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    const dialog = await screen.findByRole("dialog", { name: "Delete COMS3011A?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete module" }));
    expect(await screen.findByText("Overview")).toBeInTheDocument();
    expect(api.deleteGradeModule).toHaveBeenCalledWith("coms");
  });

  it("shows when the module can't be found", async () => {
    vi.mocked(api.fetchGradeModule).mockRejectedValue({ response: { data: { error: "Module not found" } } });
    renderPage();
    expect(await screen.findByText("Module not found")).toBeInTheDocument();
  });
});
