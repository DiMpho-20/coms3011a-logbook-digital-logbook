import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import TrendChart from "../../components/TrendChart";

const WEEKS = [
  { label: "Sep 1", value: 2 },
  { label: "Sep 8", value: 5 },
  { label: "Sep 15", value: 3 },
];

describe("TrendChart", () => {
  it("draws a point per bucket and labels the first, middle and last", () => {
    const { container } = render(<TrendChart data={WEEKS} />);

    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(screen.getByText("Sep 1")).toBeInTheDocument();
    expect(screen.getByText("Sep 8")).toBeInTheDocument();
    expect(screen.getByText("Sep 15")).toBeInTheDocument();
    // The most recent bucket carries its value directly on the chart.
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("reads the line's end value with the caller's formatting", () => {
    render(<TrendChart data={WEEKS} formatValue={(v) => `${v}h`} />);

    expect(screen.getByText("3h")).toBeInTheDocument();
  });

  it("shows a tooltip when a point is focused", () => {
    render(<TrendChart data={WEEKS} formatValue={(v) => `${v}h`} />);

    // Each point has a keyboard-reachable hit target naming its bucket.
    fireEvent.focus(screen.getByLabelText("Sep 8: 5h"));

    expect(screen.getByText("5h")).toBeInTheDocument();
    // The tooltip repeats the bucket's name next to the axis label.
    expect(screen.getAllByText("Sep 8").length).toBeGreaterThanOrEqual(2);
  });

  it("draws nothing for an empty series", () => {
    const { container } = render(<TrendChart data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
