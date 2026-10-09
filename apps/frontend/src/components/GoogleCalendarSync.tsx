import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarCheck, Loader2, RefreshCw, Unlink } from "lucide-react";
import { api } from "../api/client";

type Status = { configured: boolean; connected: boolean; connectedAt: string | null };
type SyncResult = { created: number; updated: number; removed: number };

// Set by the backend's OAuth callback when it redirects back to /calendar.
const CALLBACK_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Google Calendar connected. Sync to add your due dates.", ok: true },
  denied: { text: "Google Calendar access was not granted.", ok: false },
  error: { text: "Could not connect Google Calendar. Please try again.", ok: false },
};

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

function describeSync({ created, updated, removed }: SyncResult): string {
  if (!created && !updated && !removed) return "Everything is already up to date.";
  const parts = [
    created && `${created} added`,
    updated && `${updated} updated`,
    removed && `${removed} removed`,
  ].filter(Boolean);
  return `Synced: ${parts.join(", ")}.`;
}

/**
 * Connects the user's Google account and mirrors open entries' due dates into
 * their primary Google Calendar as all-day events.
 */
export default function GoogleCalendarSync() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  // The status check itself failed (say, offline): that says nothing about the server's setup.
  const [statusFailed, setStatusFailed] = useState(false);

  const loadStatus = () => {
    setStatusFailed(false);
    return api.get<Status>("/google-calendar/status").then((res) => setStatus(res.data)).catch(() => {
      setStatusFailed(true);
      setStatus({ configured: false, connected: false, connectedAt: null });
    });
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Show the OAuth outcome once, then drop it from the URL so a refresh
  // doesn't repeat it.
  const outcome = params.get("calendar");
  useEffect(() => {
    if (!outcome) return;
    if (CALLBACK_MESSAGES[outcome]) setMessage(CALLBACK_MESSAGES[outcome]);
    setParams((prev) => {
      prev.delete("calendar");
      return prev;
    }, { replace: true });
  }, [outcome, setParams]);

  const handleConnect = async () => {
    setBusy("connect");
    setMessage(null);
    try {
      const res = await api.get<{ url: string }>("/google-calendar/connect");
      window.location.href = res.data.url;
    } catch (err) {
      setMessage({ text: errorMessage(err, "Could not start Google sign-in."), ok: false });
      setBusy(null);
    }
  };

  const handleSync = async () => {
    setBusy("sync");
    setMessage(null);
    try {
      const res = await api.post<SyncResult>("/google-calendar/sync");
      setMessage({ text: describeSync(res.data), ok: true });
    } catch (err) {
      setMessage({ text: errorMessage(err, "Sync failed. Please try again."), ok: false });
      loadStatus(); // A revoked grant disconnects on the server side.
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    setMessage(null);
    try {
      await api.delete("/google-calendar/disconnect");
      setMessage({ text: "Google Calendar disconnected. Events already added stay in your calendar.", ok: true });
      await loadStatus();
    } catch (err) {
      setMessage({ text: errorMessage(err, "Could not disconnect."), ok: false });
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "shrink-0 flex items-center gap-1.5 border px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">Google Calendar</p>
            {status?.connected && (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Adds each open entry's due date to your Google Calendar as an all-day event. Syncing again updates
            changed dates and removes entries you've completed, archived or deleted.
          </p>
        </div>

        {status === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
        ) : statusFailed ? (
          <button onClick={() => void loadStatus()} className={`${btn} border-slate-200 text-slate-700 hover:bg-slate-50`}>
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        ) : status.connected ? (
          <div className="flex gap-2 shrink-0">
            {status.configured && (
              <button
                onClick={handleSync}
                disabled={busy !== null}
                className={`${btn} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
              >
                {busy === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {busy === "sync" ? "Syncing..." : "Sync now"}
              </button>
            )}
            <button
              onClick={handleDisconnect}
              disabled={busy !== null}
              className={`${btn} border-slate-200 text-slate-700 hover:bg-slate-50`}
            >
              <Unlink className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={busy !== null || !status.configured}
            title={status.configured ? undefined : "Google Calendar is not configured on the server."}
            className={`${btn} border-slate-200 text-slate-700 hover:bg-slate-50`}
          >
            {busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
            Connect Google Calendar
          </button>
        )}
      </div>

      {statusFailed ? (
        <p role="alert" className="text-xs text-slate-600">
          Couldn't check your Google Calendar connection just now. Check your connection and try again.
        </p>
      ) : status && !status.configured && (
        <p className="text-xs text-slate-500">
          Google Calendar sync is not set up on the server yet, so syncing is unavailable.
        </p>
      )}

      {message && (
        <p
          className={`text-xs rounded-md px-3 py-2 border ${
            message.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-600 bg-red-50 border-red-200"
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
