import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GradeAssessment, GradeModule } from "@logbook/shared";

vi.mock("../../api", () => ({
  fetchGradeModules: vi.fn(),
  createGradeModule: vi.fn(),
  updateGradeModule: vi.fn(),
}));

import * as api from "../../api";
import GradesPage from "../GradesPage";
import { localDateKey } from "../../lib/utils";

const YEAR = new Date().getFullYear();

function inDays(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return localDateKey(date);
}

const assessment = (over: Partial<GradeAssessment>): GradeAssessment => ({
  id: crypto.randomUUID(),
  moduleId: "m",
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

/** The worked example: 45 secured, 60% marked, the exam to come. */
const coms: GradeModule = {
  id: "coms",
  code: "COMS3011A",
  name: "Software Design",
  academicYear: YEAR,
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
    assessment({ name: "Final Test", weight: 40, date: inDays(3), dateKind: "TEST" }),
  ],
};

const yearModule: GradeModule = {
  ...coms,
  id: "year",
  code: "MATH2001",
  name: "Year Maths",
  type: "FULL_YEAR",
  semester: null,
  semester1Weight: 60,
  targetMark: null,
  assessments: [assessment({ name: "Test", section: 1, weight: 100, markPercent: 70 })],
};

const sem1: GradeModule = { ...coms, id: "s1", code: "PHYS1000", name: "Physics", semester: 1, targetMark: null, assessments: [] };
const lastYear: GradeModule = { ...sem1, id: "old", code: "OLD1000", name: "Old", academicYear: YEAR - 1 };

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/grades"]}>
      <Routes>
        <Route path="/grades" element={<GradesPage />} />
        <Route path="/grades/:moduleId" element={<p>Module page</p>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchGradeModules).mockResolvedValue([coms, yearModule, sem1, lastYear]);
});

describe("GradesPage", () => {
  it("shows each module's figures from the grade engine", async () => {
    renderPage();
    const card = await screen.findByRole("link", { name: "COMS3011A Software Design" });
    expect(within(card).getByText("45.0 / 100")).toBeInTheDocument();
    expect(within(card).getByText("75.0%")).toBeInTheDocument();
    expect(within(card).getByText("Marked").nextElementSibling).toHaveTextContent("60.0%");
    expect(within(card).getByText("Remaining").nextElementSibling).toHaveTextContent("40.0%");
    expect(within(card).getByText("On track")).toBeInTheDocument();
    expect(within(card).getByText("12.5%")).toBeInTheDocument(); // needed on the rest for the 50% target
    expect(within(card).getByText("Semester 2")).toBeInTheDocument();
  });

  it("draws a grade bar a screen reader can read, with the target on it", async () => {
    renderPage();
    const card = await screen.findByRole("link", { name: "COMS3011A Software Design" });
    const bar = within(card).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "45");
    expect(bar.getAttribute("aria-valuetext")).toContain("Secured 45.0 / 100");
    expect(bar.getAttribute("aria-valuetext")).toContain("target 50%");
  });

  it("shows each module's next dated assessment", async () => {
    renderPage();
    const card = await screen.findByRole("link", { name: "COMS3011A Software Design" });
    expect(within(card).getByText(/Test · Final Test/)).toBeInTheDocument();
    expect(within(card).getByText("In 3 days")).toBeInTheDocument();
    const other = screen.getByRole("link", { name: "PHYS1000 Physics" });
    expect(within(other).getByText("No upcoming dates")).toBeInTheDocument();
  });

  it("summarises the year from data it already has", async () => {
    renderPage();
    await screen.findByText("COMS3011A");
    const stat = (label: string) => screen.getByText(label, { selector: "p" }).parentElement!;
    expect(stat("Modules")).toHaveTextContent("3");
    expect(stat("Next assessment")).toHaveTextContent("Final Test");
    expect(stat("Next assessment")).toHaveTextContent("COMS3011A · In 3 days");
    expect(stat("Targets")).toHaveTextContent("1 on track");
  });

  it("never shows a bare 'current mark'", async () => {
    renderPage();
    await screen.findByText("COMS3011A");
    expect(screen.queryByText(/current mark/i)).toBeNull();
  });

  it("shows the full-year split as the student set it", async () => {
    renderPage();
    expect(await screen.findByText("Full year · S1 60% / S2 40%")).toBeInTheDocument();
  });

  it("shows full-year modules under both semesters", async () => {
    renderPage();
    await screen.findByText("COMS3011A");

    fireEvent.click(screen.getByRole("tab", { name: "Semester 1" }));
    expect(screen.queryByText("COMS3011A")).toBeNull();
    expect(screen.getByText("PHYS1000")).toBeInTheDocument();
    expect(screen.getByText("MATH2001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Semester 2" }));
    expect(screen.getByText("COMS3011A")).toBeInTheDocument();
    expect(screen.getByText("MATH2001")).toBeInTheDocument();
    expect(screen.queryByText("PHYS1000")).toBeNull();
  });

  it("filters by academic year, starting on this year", async () => {
    renderPage();
    await screen.findByText("COMS3011A");
    expect(screen.getByLabelText("Academic year")).toHaveValue(String(YEAR));
    expect(screen.queryByText("OLD1000")).toBeNull();
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: String(YEAR - 1) } });
    expect(screen.getByText("OLD1000")).toBeInTheDocument();
    expect(screen.queryByText("COMS3011A")).toBeNull();
  });

  it("offers only the years the student has modules in, plus All years", async () => {
    renderPage();
    await screen.findByText("COMS3011A");
    const options = within(screen.getByLabelText("Academic year")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([String(YEAR - 1), String(YEAR), "All years"]);
  });

  it("shows every year's modules under All years", async () => {
    renderPage();
    await screen.findByText("COMS3011A");
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: "ALL" } });
    expect(screen.getByText("COMS3011A")).toBeInTheDocument();
    expect(screen.getByText("OLD1000")).toBeInTheDocument();
  });

  it("doesn't offer this year when the student has no modules in it", async () => {
    vi.mocked(api.fetchGradeModules).mockResolvedValue([lastYear]);
    renderPage();
    await screen.findByText("OLD1000");
    const select = screen.getByLabelText("Academic year");
    expect(select).toHaveValue(String(YEAR - 1));
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([String(YEAR - 1), "All years"]);
  });

  it("adds a year to the list once a module exists for it", async () => {
    const nextYear = { ...sem1, id: "next", code: "NEXT1000", academicYear: YEAR + 1 };
    vi.mocked(api.fetchGradeModules).mockResolvedValue([coms, nextYear]);
    renderPage();
    await screen.findByText("COMS3011A");
    const select = screen.getByLabelText("Academic year");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([String(YEAR), String(YEAR + 1), "All years"]);
    expect(select).toHaveValue(String(YEAR));
  });

  it("hides the year filter until there are modules", async () => {
    vi.mocked(api.fetchGradeModules).mockResolvedValue([]);
    renderPage();
    await screen.findByText("Add your first module");
    expect(screen.queryByLabelText("Academic year")).toBeNull();
  });

  it("lists upcoming dated assessments with a countdown", async () => {
    renderPage();
    const upcoming = await screen.findByRole("region", { name: /Upcoming/ });
    expect(within(upcoming).getByText("In 3 days · Test")).toBeInTheDocument();
    expect(within(upcoming).getByText("Final Test")).toBeInTheDocument();
  });

  it("asks a module with incomplete weights to be finished first", async () => {
    vi.mocked(api.fetchGradeModules).mockResolvedValue([
      { ...coms, assessments: [assessment({ name: "Only", weight: 90 })] },
    ]);
    renderPage();
    expect(await screen.findByText("Finish setting up")).toBeInTheDocument();
  });

  it("shows an empty state with a way to add a module", async () => {
    vi.mocked(api.fetchGradeModules).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Add your first module")).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    vi.mocked(api.fetchGradeModules).mockRejectedValueOnce(new Error("offline"));
    renderPage();
    expect(await screen.findByText("Failed to load your modules")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try again"));
    expect(await screen.findByText("COMS3011A")).toBeInTheDocument();
  });
});

describe("adding a module", () => {
  const open = async () => {
    renderPage();
    await screen.findByText("COMS3011A");
    fireEvent.click(screen.getAllByRole("button", { name: /Add module/ })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add a module" });
    fireEvent.change(within(dialog).getByPlaceholderText("COMS3011A"), { target: { value: "coms2002" } });
    fireEvent.change(within(dialog).getByPlaceholderText("Software Design"), { target: { value: "Databases" } });
    return dialog;
  };

  it("creates a semester module and opens it", async () => {
    vi.mocked(api.createGradeModule).mockResolvedValue({ ...sem1, id: "new" });
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText("Semester"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add module" }));
    await waitFor(() =>
      expect(api.createGradeModule).toHaveBeenCalledWith({
        code: "coms2002",
        name: "Databases",
        academicYear: YEAR,
        type: "SEMESTER",
        semester: 2,
        semester1Weight: null,
      })
    );
    expect(await screen.findByText("Module page")).toBeInTheDocument();
  });

  it("needs a full-year split from the student, with no 50/50 default", async () => {
    const dialog = await open();
    fireEvent.click(within(dialog).getByLabelText(/Full-year module/));
    expect(within(dialog).getByLabelText("Semester 1 counts (%)")).toHaveValue(null);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add module" }));
    expect(await within(dialog).findByText(/There is no default split/)).toBeInTheDocument();
    expect(api.createGradeModule).not.toHaveBeenCalled();
  });

  it("keeps the two semester weights adding up to 100", async () => {
    vi.mocked(api.createGradeModule).mockResolvedValue({ ...yearModule, id: "new" });
    const dialog = await open();
    fireEvent.click(within(dialog).getByLabelText(/Full-year module/));
    fireEvent.change(within(dialog).getByLabelText("Semester 1 counts (%)"), { target: { value: "60" } });
    expect(within(dialog).getByLabelText("Semester 2 counts (%)")).toHaveValue(40);
    fireEvent.change(within(dialog).getByLabelText("Semester 2 counts (%)"), { target: { value: "30" } });
    expect(within(dialog).getByLabelText("Semester 1 counts (%)")).toHaveValue(70);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add module" }));
    await waitFor(() =>
      expect(api.createGradeModule).toHaveBeenCalledWith(
        expect.objectContaining({ type: "FULL_YEAR", semester: null, semester1Weight: 70 })
      )
    );
  });

  it("shows the server's reason when it refuses", async () => {
    vi.mocked(api.createGradeModule).mockRejectedValue({ response: { data: { error: `You already have COMS2002 in ${YEAR}` } } });
    const dialog = await open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add module" }));
    expect(await within(dialog).findByText(`You already have COMS2002 in ${YEAR}`)).toBeInTheDocument();
  });
});
