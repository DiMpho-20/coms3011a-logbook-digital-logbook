import { Shield, ShieldCheck, X } from "lucide-react";
import { SecurityCheck, Section } from "./parts";
import { useTwoFactor } from "./useTwoFactor";

/** The security checklist, and the two-factor sign-in controls behind it. */
export default function SecuritySection() {
  const tfa = useTwoFactor();
  const { setup, disable, regenerate } = tfa;

  return (
    <Section title="Security">
      {/* The checklist is deliberately a list of specific things rather than
          a score out of ten: "2 of 3" tells you what to do next, a number
          out of a hundred only tells you how to feel. */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-1">
        <ul className="divide-y divide-slate-200/70">
          <SecurityCheck
            done={tfa.enabled}
            label="Two-factor authentication"
            detail={
              tfa.enabled
                ? "A code from your authenticator app is required at sign-in."
                : "Your password alone is enough to sign in right now."
            }
            // Must go through the same handler as "Enable 2FA": opening the
            // panel alone shows no secret, and the server has none to verify.
            action={{ text: "Set up", onClick: setup.start }}
          />
          {tfa.enabled && (
            <SecurityCheck
              done={tfa.remaining > 0}
              label="Recovery codes"
              detail={
                tfa.remaining > 0
                  ? `${tfa.remaining} left — these are how you get in without your phone.`
                  : "None left. Without one, losing your phone locks you out."
              }
            />
          )}
          <SecurityCheck
            done={tfa.emailVerified === true}
            label="Email address confirmed"
            detail={
              tfa.emailVerified === null
                ? "Could not be checked just now."
                : tfa.emailVerified
                  ? "Password resets will reach you."
                  : "Unconfirmed, so a password reset may not reach you."
            }
          />
        </ul>
      </div>

      {/* Two-Factor Authentication */}
      <div className="border-t border-slate-100 pt-4 mt-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {tfa.enabled ? (
              <ShieldCheck className="h-4 w-4 text-green-600" />
            ) : (
              <Shield className="h-4 w-4 text-slate-500" />
            )}
            <p className="text-sm font-medium text-slate-700">Two-factor authentication</p>
          </div>
          {tfa.enabled && (
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Enabled
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Add an extra layer of security to your account using Google Authenticator or any TOTP app.
        </p>

        {tfa.error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{tfa.error}</p>
        )}

        {/* Recovery codes — shown once, at the moment they are generated */}
        {tfa.codes.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-3">
            <h3 className="text-sm font-semibold text-amber-900 mb-1">
              Save your recovery codes
            </h3>
            <p className="text-xs text-amber-800 mb-3">
              Each code works once, and lets you sign in if you lose your
              authenticator device. This is the only time they will be shown —
              store them somewhere you can reach without your phone.
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm text-slate-800 bg-white border border-amber-200 rounded-md p-3 mb-3">
              {tfa.codes.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <button
                onClick={tfa.copyCodes}
                className="border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition"
              >
                {tfa.codesCopied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={tfa.downloadCodes}
                className="border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition"
              >
                Download
              </button>
              <button
                onClick={tfa.dismissCodes}
                className="ml-auto bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
              >
                I have saved them
              </button>
            </div>
          </div>
        )}

        {/* 2FA Setup Modal */}
        {setup.open && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Set up authenticator</h3>
              <button
                onClick={setup.close}
                className="p-1 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-3">
              {setup.qrCode && (
                <img src={setup.qrCode} alt="QR Code" className="w-40 h-40 rounded-lg border border-slate-200" />
              )}
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-1">Or enter this secret manually:</p>
                <code className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 select-all font-mono">
                  {setup.secret}
                </code>
              </div>
              <div className="w-full max-w-xs">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={setup.code}
                  onChange={(e) => setup.setCode(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 tracking-widest"
                />
              </div>
              <button
                onClick={setup.verify}
                disabled={tfa.loading || !setup.code}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {tfa.loading ? "Verifying..." : "Verify & Enable"}
              </button>
            </div>
          </div>
        )}

        {/* Disable 2FA Modal */}
        {disable.open && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Disable two-factor authentication</h3>
              <button
                onClick={disable.close}
                className="p-1 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">Enter your password to confirm disabling 2FA.</p>
            <div className="flex items-end gap-2">
              <input
                type="password"
                placeholder="Your password"
                value={disable.password}
                onChange={(e) => disable.setPassword(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-400 flex-1"
              />
              <button
                onClick={disable.submit}
                disabled={tfa.loading || !disable.password}
                className="shrink-0 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-50 transition disabled:opacity-50"
              >
                {tfa.loading ? "Disabling..." : "Disable 2FA"}
              </button>
            </div>
          </div>
        )}

        {!tfa.enabled && !setup.open && (
          <button
            onClick={setup.start}
            disabled={tfa.loading}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            <Shield className="h-3.5 w-3.5" />
            {tfa.loading ? "Starting..." : "Enable 2FA"}
          </button>
        )}

        {tfa.enabled && regenerate.open && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              Generate new recovery codes
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Your existing codes will stop working immediately.
            </p>
            <input
              type="password"
              value={regenerate.password}
              onChange={(e) => regenerate.setPassword(e.target.value)}
              placeholder="Confirm your password"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={regenerate.submit}
                disabled={tfa.loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition disabled:opacity-50"
              >
                {tfa.loading ? "Generating..." : "Generate new codes"}
              </button>
              <button
                onClick={regenerate.close}
                className="border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-100 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {tfa.enabled && !disable.open && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={disable.openPanel}
              className="flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-50 transition"
            >
              <Shield className="h-3.5 w-3.5" />
              Disable 2FA
            </button>
            {!regenerate.open && (
              <button
                onClick={regenerate.openPanel}
                className="border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-100 transition"
              >
                Regenerate recovery codes
              </button>
            )}
            <span
              className={`text-xs ${
                tfa.remaining === 0 ? "text-red-600" : "text-slate-500"
              }`}
            >
              {tfa.remaining === 0
                ? "No recovery codes left"
                : `${tfa.remaining} recovery code${
                    tfa.remaining === 1 ? "" : "s"
                  } remaining`}
            </span>
          </div>
        )}
      </div>
    </Section>
  );
}
