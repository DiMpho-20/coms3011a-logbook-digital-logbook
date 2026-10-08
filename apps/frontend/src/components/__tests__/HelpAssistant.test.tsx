import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../../api", () => ({
  askAssistant: vi.fn(),
}));

import * as api from "../../api";
import HelpAssistant from "../HelpAssistant";

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const renderAt = (path = "/dashboard") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<><Where /><HelpAssistant /></>} />
      </Routes>
    </MemoryRouter>
  );

const openPanel = () => fireEvent.click(screen.getByRole("button", { name: "Need help?" }));
const ask = (text: string) => {
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HelpAssistant", () => {
  it("starts closed and opens with suggested questions", () => {
    renderAt();
    expect(screen.queryByLabelText("Your question")).toBeNull();

    openPanel();

    expect(screen.getByLabelText("Your question")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How do I add a new entry?" })).toBeInTheDocument();
  });

  it("sends the question with the current page and shows the answer", async () => {
    vi.mocked(api.askAssistant).mockResolvedValue({ reply: "Use the Stats page.", navigateTo: null });
    renderAt("/entries");
    openPanel();

    ask("Where are my totals?");

    expect(await screen.findByText("Use the Stats page.")).toBeInTheDocument();
    expect(api.askAssistant).toHaveBeenCalledWith(
      [{ role: "user", text: "Where are my totals?" }],
      "/entries",
    );
  });

  it("sends the whole conversation on a follow-up", async () => {
    vi.mocked(api.askAssistant)
      .mockResolvedValueOnce({ reply: "First answer", navigateTo: null })
      .mockResolvedValueOnce({ reply: "Second answer", navigateTo: null });
    renderAt();
    openPanel();

    ask("one");
    await screen.findByText("First answer");
    ask("two");
    await screen.findByText("Second answer");

    expect(vi.mocked(api.askAssistant).mock.calls[1][0]).toEqual([
      { role: "user", text: "one" },
      { role: "model", text: "First answer" },
      { role: "user", text: "two" },
    ]);
  });

  it("offers a button to the suggested page", async () => {
    vi.mocked(api.askAssistant).mockResolvedValue({ reply: "Reminders live here.", navigateTo: "/reminders" });
    renderAt();
    openPanel();

    ask("reminders?");
    fireEvent.click(await screen.findByRole("button", { name: /Take me to Reminders/ }));

    expect(screen.getByTestId("where").textContent).toBe("/reminders");
  });

  it("names My Grades on its button rather than showing the path", async () => {
    vi.mocked(api.askAssistant).mockResolvedValue({ reply: "Your modules are in My Grades.", navigateTo: "/grades" });
    renderAt();
    openPanel();

    ask("where are my marks?");
    fireEvent.click(await screen.findByRole("button", { name: "Take me to My Grades" }));

    expect(screen.getByTestId("where").textContent).toBe("/grades");
  });

  it("shows the server's error and keeps the question for a retry", async () => {
    vi.mocked(api.askAssistant).mockRejectedValue({
      response: { data: { error: "The help assistant is not set up on this server." } },
    });
    renderAt();
    openPanel();

    ask("hello?");

    expect(await screen.findByRole("alert")).toHaveTextContent("not set up");
    await waitFor(() => expect(screen.getByLabelText("Your question")).toHaveValue("hello?"));
  });
});
