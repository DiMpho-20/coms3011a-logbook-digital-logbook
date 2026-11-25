import { useState } from "react";
import { Check, KeyRound, Mail, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import { applyTheme } from "../../lib/appearance";
import { DEFAULTS } from "./preferences";
import { Field, Section } from "./parts";
import { inputCls } from "./styles";

/**
 * Account: the display name, the address (read-only), the password route, and
 * closing the account.
 *
 * The name is the account's, not this browser's — the server is the source of
 * truth and localStorage only shadows it so the sidebar has something to show
 * before `/me` answers.
 */
export default function AccountSection() {
  const [name, setName] = useState(() => localStorage.getItem("logbook-name") || "Student");
  const [email] = useState(() => localStorage.getItem("logbook-email") || "");
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const [deletePw, setDeletePw] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  /**
   * Save the display name to the account.
   *
   * This used to write the name and the email to localStorage and report
   * "Saved". The name only changed in that one browser, and the email did not
   * change the account's address at all — which was the more serious half,
   * because a student could type a new address, be told it saved, and still
   * have password resets go to the old one. The name is now written to the
   * server and the email is read-only.
   */
  const handleSaveAccount = async () => {
    setAccountError("");
    const trimmed = name.trim();
    if (!trimmed) {
      setAccountError("Display name cannot be empty.");
      return;
    }
    try {
      const { data } = await api.patch("/me", { fullName: trimmed });
      setName(data.fullName);
      // The sidebar still reads the name from here; the server is the source
      // of truth and this keeps that copy from going stale.
      localStorage.setItem("logbook-name", data.fullName);
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 2000);
    } catch (error: any) {
      setAccountError(error?.response?.data?.error ?? "Your name could not be saved.");
    }
  };

  /**
   * Change the password by the route that actually exists.
   *
   * There is no authenticated change-password endpoint, so rather than keep a
   * form that silently discarded what was typed into it, this sends the same
   * reset email the login page does. It works today and it proves the student
   * controls the address, which a straight change would not.
   */
  const handleSendReset = async () => {
    setAccountError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setResetSent(true);
    } catch {
      setAccountError("The reset email could not be sent. Try again in a moment.");
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setIsDeleting(true);
    try {
      const res = await api.delete("/auth/account", { data: { confirmPassword: deletePw } });

      // Clear local data and redirect to login with the scheduled date.
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("logbook-")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem("token");
      applyTheme(DEFAULTS.theme);

      const date = encodeURIComponent(res.data.scheduledDeletionAt);
      window.location.href = `/login?deletionScheduled=${date}`;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to delete account.";
      setDeleteError(msg);
      setIsDeleting(false);
    }
  };

  return (
    <Section title="Account">
      <Field label="Display name">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={255} />
      </Field>
      <div>
        <p className="text-sm text-slate-600 mb-1.5">Email address</p>
        <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 rounded-lg px-3 py-2">
          <Mail className="h-4 w-4 text-slate-400 shrink-0" />
          <span className="text-sm text-slate-600 truncate">{email || "No email on file"}</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          This is the address you sign in with and where a password reset is sent, so it
          cannot be changed from here.
        </p>
      </div>
      <div className="border-t border-slate-100 pt-4">
        <p className="text-sm font-medium text-slate-700 mb-1">Password</p>
        <p className="text-xs text-slate-500 mb-3">
          Changing it is done through an emailed link, the same way the login page does it.
        </p>
        {resetSent ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 shrink-0" />
            If that address has an account, a reset link is on its way.
          </p>
        ) : (
          <button
            onClick={handleSendReset}
            disabled={!email}
            className="inline-flex items-center gap-1.5 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" /> Email me a reset link
          </button>
        )}
      </div>
      {accountError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{accountError}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button onClick={handleSaveAccount} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          {accountSaved && <Check className="h-3.5 w-3.5" />}
          {accountSaved ? "Saved" : "Save Changes"}
        </button>
      </div>
      <div className="border-t border-slate-100 pt-4 mt-2">
        <p className="text-sm font-medium text-red-700 mb-1">Delete account</p>
        <p className="text-xs text-slate-500 mb-3">
          Schedule your account and all associated data for permanent deletion in 30 days. You can cancel by logging in before then.
        </p>
        {deleteError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-2">{deleteError}</p>
        )}
        <div className="flex items-end gap-2">
          <input
            type="password"
            placeholder="Confirm your password"
            value={deletePw}
            onChange={(e) => setDeletePw(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-400 flex-1 max-w-xs"
          />
          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting || !deletePw}
            className="shrink-0 flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" /> {isDeleting ? "Scheduling..." : "Delete"}
          </button>
        </div>
      </div>
    </Section>
  );
}
