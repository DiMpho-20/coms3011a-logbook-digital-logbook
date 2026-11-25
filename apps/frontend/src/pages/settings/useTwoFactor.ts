import { useEffect, useState } from "react";
import { api } from "../../api/client";

const errorFrom = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/**
 * Everything the security section knows and does about two-factor sign-in.
 *
 * Kept apart from the markup because the section is one long form with four
 * modes — set up, disable, regenerate codes, and the resting state — and
 * reading them together in JSX hid which state belonged to which.
 */
export function useTwoFactor() {
  const [enabled, setEnabled] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  // Setup
  const [setupOpen, setSetupOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");

  // Disable
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  // Recovery codes. Shown exactly once, straight after they are generated:
  // the server keeps only digests, so if the user navigates away without
  // saving these they are gone for good and a fresh set has to be issued.
  const [codes, setCodes] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState("");
  const [codesCopied, setCodesCopied] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get("/auth/2fa/status")
      .then((res) => {
        setEnabled(res.data.isTwoFactorEnabled);
        setRemaining(res.data.recoveryCodesRemaining ?? 0);
      })
      .catch(() => {});

    // The security checklist needs to know whether the address has been
    // confirmed; /me is the only place that says so.
    api
      .get("/me")
      .then((res) => setEmailVerified(Boolean(res.data.isEmailVerified)))
      .catch(() => setEmailVerified(null));
  }, []);

  const startSetup = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/2fa/setup");
      setSecret(res.data.secret);
      setQrCode(res.data.qrCodeUrl);
      setSetupOpen(true);
    } catch (err: unknown) {
      setError(errorFrom(err, "Failed to start 2FA setup."));
    } finally {
      setLoading(false);
    }
  };

  const verifySetup = async () => {
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Please enter a valid 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/2fa/verify-setup", { token: code });
      setEnabled(true);
      setSetupOpen(false);
      setCode("");
      setSecret("");
      setQrCode("");
      setCodes(res.data.recoveryCodes ?? []);
      setRemaining((res.data.recoveryCodes ?? []).length);
    } catch (err: unknown) {
      setError(errorFrom(err, "Invalid code."));
    } finally {
      setLoading(false);
    }
  };

  const closeSetup = () => {
    setSetupOpen(false);
    setCode("");
    setError("");
  };

  const disable = async () => {
    setError("");
    if (!disablePassword) {
      setError("Password is required");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/2fa/disable", { password: disablePassword });
      setEnabled(false);
      setDisableOpen(false);
      setDisablePassword("");
      setCodes([]);
      setRemaining(0);
    } catch (err: unknown) {
      setError(errorFrom(err, "Failed to disable 2FA."));
    } finally {
      setLoading(false);
    }
  };

  const closeDisable = () => {
    setDisableOpen(false);
    setDisablePassword("");
    setError("");
  };

  const closeRegenerate = () => {
    setRegenerateOpen(false);
    setRegeneratePassword("");
    setError("");
  };

  const regenerate = async () => {
    setError("");
    if (!regeneratePassword) {
      setError("Password is required");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/2fa/recovery-codes", { password: regeneratePassword });
      setCodes(res.data.recoveryCodes ?? []);
      setRemaining((res.data.recoveryCodes ?? []).length);
      setRegenerateOpen(false);
      setRegeneratePassword("");
    } catch (err: unknown) {
      setError(errorFrom(err, "Failed to generate new recovery codes."));
    } finally {
      setLoading(false);
    }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCodesCopied(true);
      setTimeout(() => setCodesCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the codes are on screen regardless.
      setError("Could not copy automatically — please select and copy the codes manually.");
    }
  };

  const downloadCodes = () => {
    const body = [
      "Digital Logbook — two-factor recovery codes",
      `Generated ${new Date().toLocaleString()}`,
      "",
      "Each code works once. Keep them somewhere you can reach without your phone.",
      "",
      ...codes,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "logbook-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return {
    enabled, emailVerified, error, loading,
    setup: {
      open: setupOpen, secret, qrCode, code,
      setCode: (value: string) => setCode(value.replace(/\D/g, "")),
      start: startSetup, verify: verifySetup, close: closeSetup,
    },
    codes, remaining, codesCopied, copyCodes, downloadCodes,
    dismissCodes: () => setCodes([]),
    disable: {
      open: disableOpen, password: disablePassword,
      setPassword: setDisablePassword,
      submit: disable, close: closeDisable,
      openPanel: () => setDisableOpen(true),
    },
    regenerate: {
      open: regenerateOpen, password: regeneratePassword,
      setPassword: setRegeneratePassword,
      submit: regenerate, close: closeRegenerate,
      openPanel: () => setRegenerateOpen(true),
    },
  };
}
