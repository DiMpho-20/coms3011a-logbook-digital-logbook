import { describe, it, expect, vi, afterEach } from "vitest";
import { useRef, useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Modal from "../Modal";
import Stopwatch from "../Stopwatch";
import TagInput, { type TagInputHandle } from "../TagInput";
import ChecklistInput from "../ChecklistInput";

afterEach(() => {
  vi.useRealTimers();
  document.body.style.overflow = "";
});

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(<Modal open={false} onClose={vi.fn()} title="Edit project"><p>Body</p></Modal>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders its title and children when open", () => {
    render(<Modal open onClose={vi.fn()} title="Edit project"><p>Body</p></Modal>);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Edit project");
    expect(screen.getByText("Edit project")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("closes on Escape, on the close button, and on the backdrop", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Modal open onClose={onClose} title="T"><p>Body</p></Modal>);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Close dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("ignores a click inside the panel", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T"><p>Body</p></Modal>);

    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T"><p>Body</p></Modal>);

    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and releases it afterwards", () => {
    const { rerender } = render(<Modal open onClose={vi.fn()} title="T"><p>Body</p></Modal>);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Modal open={false} onClose={vi.fn()} title="T"><p>Body</p></Modal>);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Stopwatch", () => {
  it("starts at zero", () => {
    render(<Stopwatch />);
    expect(screen.getByText("00:00:00")).toBeInTheDocument();
    expect(screen.getByTitle("Start")).toBeInTheDocument();
  });

  it("counts up and reports whole minutes", () => {
    vi.useFakeTimers();
    const onMinutesChange = vi.fn();
    render(<Stopwatch onMinutesChange={onMinutesChange} />);

    fireEvent.click(screen.getByTitle("Start"));
    expect(screen.getByTitle("Pause")).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(60_000); });

    expect(screen.getByText("00:01:00")).toBeInTheDocument();
    expect(onMinutesChange).toHaveBeenCalledWith(1);
  });

  it("formats past an hour", () => {
    vi.useFakeTimers();
    render(<Stopwatch />);

    fireEvent.click(screen.getByTitle("Start"));
    act(() => { vi.advanceTimersByTime(3_661_000); });

    expect(screen.getByText("01:01:01")).toBeInTheDocument();
  });

  it("stops counting when paused", () => {
    vi.useFakeTimers();
    render(<Stopwatch />);

    fireEvent.click(screen.getByTitle("Start"));
    act(() => { vi.advanceTimersByTime(5_000); });
    fireEvent.click(screen.getByTitle("Pause"));

    act(() => { vi.advanceTimersByTime(10_000); });

    expect(screen.getByText("00:00:05")).toBeInTheDocument();
    expect(screen.getByTitle("Start")).toBeInTheDocument();
  });

  it("returns to zero on reset and says so", () => {
    vi.useFakeTimers();
    const onMinutesChange = vi.fn();
    render(<Stopwatch onMinutesChange={onMinutesChange} />);

    fireEvent.click(screen.getByTitle("Start"));
    act(() => { vi.advanceTimersByTime(120_000); });
    fireEvent.click(screen.getByTitle("Reset"));

    expect(screen.getByText("00:00:00")).toBeInTheDocument();
    expect(onMinutesChange).toHaveBeenLastCalledWith(0);
    expect(screen.getByTitle("Start")).toBeInTheDocument();
  });
});

/** TagInput is controlled, so the tests drive it through real state. */
function TagHarness({ initial = [], suggestions = [] }: { initial?: string[]; suggestions?: string[] }) {
  const [tags, setTags] = useState<string[]>(initial);
  const ref = useRef<TagInputHandle>(null);
  const [captured, setCaptured] = useState<string | null>(null);

  return (
    <div>
      <TagInput ref={ref} value={tags} onChange={setTags} suggestions={suggestions} placeholder="Add a tag…" />
      <button type="button" onClick={() => setCaptured((ref.current?.getValue() ?? []).join("|"))}>
        capture
      </button>
      <output data-testid="captured">{captured ?? ""}</output>
      <output data-testid="committed">{tags.join("|")}</output>
    </div>
  );
}

describe("TagInput", () => {
  const typeInto = (text: string) => {
    const input = screen.getByPlaceholderText("Add a tag…");
    fireEvent.change(input, { target: { value: text } });
    return input;
  };

  it("adds a tag on Enter and clears the draft", () => {
    render(<TagHarness />);
    const input = typeInto("coursework");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("committed")).toHaveTextContent("coursework");
    expect(input).toHaveValue("");
  });

  it("adds a tag on comma", () => {
    render(<TagHarness />);
    const input = typeInto("urgent");
    fireEvent.keyDown(input, { key: "," });

    expect(screen.getByTestId("committed")).toHaveTextContent("urgent");
  });

  it("refuses a duplicate regardless of case", () => {
    render(<TagHarness initial={["Coursework"]} />);
    const input = typeInto("coursework");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("committed")).toHaveTextContent("Coursework");
    expect(screen.getByTestId("committed").textContent).not.toContain("|");
  });

  it("ignores an empty draft", () => {
    render(<TagHarness />);
    const input = typeInto("   ");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByTestId("committed")).toHaveTextContent("");
  });

  it("removes the last tag on Backspace when the draft is empty", () => {
    render(<TagHarness initial={["one", "two"]} />);
    // With tags present the placeholder is blank, so query by role instead.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Backspace" });

    expect(screen.getByTestId("committed")).toHaveTextContent("one");
  });

  it("keeps the tags when Backspace is pressed mid-word", () => {
    render(<TagHarness initial={["one"]} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "part" } });
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(screen.getByTestId("committed")).toHaveTextContent("one");
  });

  it("removes a named tag from its chip", () => {
    render(<TagHarness initial={["keep", "drop"]} />);
    fireEvent.click(screen.getByLabelText("Remove tag drop"));

    expect(screen.getByTestId("committed")).toHaveTextContent("keep");
  });

  it("suggests only unused tags, filtered by what is typed", () => {
    render(<TagHarness initial={["used"]} suggestions={["used", "research", "reading"]} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);

    // An already-applied tag is not offered again.
    expect(screen.queryByRole("button", { name: "used" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "research" })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "read" } });
    expect(screen.getByRole("button", { name: "reading" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "research" })).not.toBeInTheDocument();
  });

  it("adds a suggestion when it is clicked", () => {
    render(<TagHarness suggestions={["research"]} />);
    fireEvent.focus(screen.getByRole("textbox"));
    fireEvent.click(screen.getByRole("button", { name: "research" }));

    expect(screen.getByTestId("committed")).toHaveTextContent("research");
  });

  it("includes a half-typed tag in getValue, which is the reason the handle exists", () => {
    render(<TagHarness initial={["committed"]} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "still-typing" } });
    fireEvent.click(screen.getByRole("button", { name: "capture" }));

    // Clicking submit blurs the input in the same tick, and that blur's
    // commit has not reached `value` yet when the handler runs.
    expect(screen.getByTestId("captured")).toHaveTextContent("committed|still-typing");
  });
});

/** ChecklistInput is controlled too. */
function ChecklistHarness({ initial = [] as { label: string; checked: boolean }[] }) {
  const [items, setItems] = useState(initial);
  return (
    <div>
      <ChecklistInput value={items} onChange={setItems} />
      <output data-testid="state">{items.map((i) => `${i.checked ? "x" : "o"}:${i.label}`).join("|")}</output>
    </div>
  );
}

describe("ChecklistInput", () => {
  const draft = () => screen.getByPlaceholderText("Add checklist item, press Enter");

  it("adds an item on Enter and clears the draft", () => {
    render(<ChecklistHarness />);
    fireEvent.change(draft(), { target: { value: "Draft the audit" } });
    fireEvent.keyDown(draft(), { key: "Enter" });

    expect(screen.getByTestId("state")).toHaveTextContent("o:Draft the audit");
    expect(draft()).toHaveValue("");
  });

  it("ignores an empty or whitespace-only draft", () => {
    render(<ChecklistHarness />);
    fireEvent.change(draft(), { target: { value: "   " } });
    fireEvent.keyDown(draft(), { key: "Enter" });

    expect(screen.getByTestId("state")).toHaveTextContent("");
  });

  it("ticks an item off", () => {
    render(<ChecklistHarness initial={[{ label: "Draft", checked: false }]} />);
    fireEvent.click(screen.getByLabelText('Mark "Draft" done'));

    expect(screen.getByTestId("state")).toHaveTextContent("x:Draft");
  });

  it("edits a label in place", () => {
    render(<ChecklistHarness initial={[{ label: "Draft", checked: false }]} />);
    fireEvent.change(screen.getByDisplayValue("Draft"), { target: { value: "Draft properly" } });

    expect(screen.getByTestId("state")).toHaveTextContent("o:Draft properly");
  });

  it("removes an item", () => {
    render(<ChecklistHarness initial={[{ label: "Keep", checked: false }, { label: "Drop", checked: false }]} />);
    fireEvent.click(screen.getByLabelText('Remove "Drop"'));

    expect(screen.getByTestId("state")).toHaveTextContent("o:Keep");
  });
});
