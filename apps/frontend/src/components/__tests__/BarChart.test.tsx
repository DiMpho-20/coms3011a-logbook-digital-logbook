import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import BarChart from "../../components/BarChart";

describe("BarChart", () => {
  it("renders a labelled row per project with its formatted value", () => {
    render(
      <BarChart
        data={[{ label: "Thesis", value: 150 }, { label: "Reading", value: 45 }]}
        formatValue={(v) => `${v}m`}
      />
    );

    expect(screen.getByText("Thesis")).toBeInTheDocument();
    expect(screen.getByText("Reading")).toBeInTheDocument();
    expect(screen.getByText("150m")).toBeInTheDocument();
    expect(screen.getByText("45m")).toBeInTheDocument();
  });

  it("names each bar for assistive tech the way it is drawn", () => {
    render(
      <BarChart
        data={[{ label: "Thesis", value: 150 }, { label: "Reading", value: 45 }]}
        formatValue={(v) => `${v}m`}
      />
    );

    expect(screen.getByRole("img", { name: "Thesis: 150m" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Reading: 45m" })).toBeInTheDocument();
  });

  it("scales every bar against the largest value", () => {
    render(<BarChart data={[{ label: "Big", value: 100 }, { label: "Small", value: 25 }]} />);

    const big = screen.getByRole("img", { name: "Big: 100" }).firstElementChild as HTMLElement;
    const small = screen.getByRole("img", { name: "Small: 25" }).firstElementChild as HTMLElement;
    expect(big.style.width).toBe("100%");
    expect(small.style.width).toBe("25%");
  });

  it("draws nothing for an empty chart", () => {
    const { container } = render(<BarChart data={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
