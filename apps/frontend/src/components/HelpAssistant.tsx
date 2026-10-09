import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, MessageCircleQuestion, Send, X } from "lucide-react";
import { askAssistant, type AssistantMessage } from "../api";

interface ChatTurn extends AssistantMessage {
  /** A page the assistant suggested, shown as a button under its answer. */
  navigateTo?: string | null;
}

const SUGGESTIONS = [
  "How do I add a new entry?",
  "How do I make an entry repeat?",
  "Where do I set up reminders?",
  "How do I export my logbook?",
];

const PAGE_NAMES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/entries": "Entries",
  "/open-work": "Open Work",
  "/stats": "Statistics",
  "/grades": "My Grades",
  "/calendar": "Calendar",
  "/board": "Board",
  "/reminders": "Reminders",
  "/profile": "Profile",
  "/settings": "Settings",
};

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

/**
 * Floating "Ask for help" chat, on every page inside the app. Questions go to
 * the backend's Gemini-backed assistant along with the page the student is
 * on; an answer that points at a page comes with a button that goes there.
 * The conversation lasts until the page is reloaded.
 */
export default function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns, sending]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    const history: ChatTurn[] = [...turns, { role: "user", text: question }];
    setTurns(history);
    setDraft("");
    setError(null);
    setSending(true);
    try {
      const answer = await askAssistant(
        history.map(({ role, text }) => ({ role, text })),
        location.pathname,
      );
      setTurns([...history, { role: "model", text: answer.reply, navigateTo: answer.navigateTo }]);
    } catch (err) {
      // Take the unanswered question back out, so a retry does not send it twice.
      setTurns(turns);
      setDraft(question);
      setError(errorMessage(err, "The assistant couldn't answer right now. Please try again."));
    } finally {
      setSending(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const goTo = (path: string) => {
    navigate(path);
    // The panel covers most of a phone screen, so get out of the way there.
    if (window.innerWidth < 640) setOpen(false);
  };

  return (
    <>
      {open && (
        <section
          aria-label="Help assistant"
          className="fixed z-50 bottom-20 right-4 left-4 sm:left-auto sm:w-96 h-[min(32rem,calc(100vh-7rem))] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        >
          <header className="flex items-center gap-2 px-4 h-12 shrink-0 border-b border-slate-200">
            <MessageCircleQuestion className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">Help assistant</h2>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto p-1 rounded-md text-slate-500 hover:bg-slate-100 transition"
              aria-label="Close help assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm" aria-live="polite">
            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="text-slate-600">
                  Hi! Ask me how to do anything in Digital Logbook, and I'll show you where to find it.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <p key={i} className="ml-8 rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-white whitespace-pre-wrap">
                  {turn.text}
                </p>
              ) : (
                <div key={i} className="mr-8 space-y-2">
                  <p className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-slate-800 whitespace-pre-wrap">
                    {turn.text}
                  </p>
                  {turn.navigateTo && turn.navigateTo !== location.pathname && (
                    <button
                      onClick={() => goTo(turn.navigateTo!)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition"
                    >
                      Take me to {PAGE_NAMES[turn.navigateTo] ?? turn.navigateTo}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ),
            )}

            {sending && (
              <p className="mr-8 inline-flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </p>
            )}
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-slate-200 p-3 shrink-0">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={1000}
              placeholder="Ask a question…"
              aria-label="Your question"
              className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
              aria-label="Send question"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        // The accent colour from Settings, like the app's other primary buttons.
        // Closed, it says what it is for, since an icon alone does not; open,
        // it shrinks back to a round close button beside the panel.
        className={`fixed z-50 bottom-4 right-4 h-12 flex items-center justify-center gap-2 rounded-full bg-blue-600 text-white shadow-md transition-colors duration-150 hover:bg-blue-700 ${open ? "w-12" : "px-4"}`}
        aria-label={open ? "Close help assistant" : undefined}
        aria-expanded={open}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <>
            <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-medium">Need help?</span>
          </>
        )}
      </button>
    </>
  );
}
