import { useCallback, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { ToastContext, type ToastApi, type ToastItem, type ToastVariant } from "./ToastContext";

/**
 * Transient notifications that don't steal focus (unlike window.alert):
 * a small stack in the bottom-right corner that announces itself to screen
 * readers and disappears on its own. Pages call `const toast = useToast()`
 * and then `toast.error("...")` / `toast.success("...")` / `toast.info("...")`.
 */

const VARIANT_ICON: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  success: "border-l-emerald-500 text-emerald-600",
  error: "border-l-red-500 text-red-600",
  info: "border-l-blue-500 text-blue-600",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = nextId.current++;
      // Keep the stack short: four is readable, more is noise.
      setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
      // Errors linger a little longer; everything else fades on its own.
      window.setTimeout(() => dismiss(id), variant === "error" ? 6000 : 4000);
    },
    [dismiss],
  );

  const api: ToastApi = {
    success: (message) => push(message, "success"),
    error: (message) => push(message, "error"),
    info: (message) => push(message, "info"),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* politeness=polite: announce without interrupting; error toasts add role="alert" */}
      <div
        aria-live="polite"
        className="fixed right-4 bottom-4 z-[60] flex w-88 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((toast) => {
          const Icon = VARIANT_ICON[toast.variant];
          return (
            <div
              key={toast.id}
              role={toast.variant === "error" ? "alert" : "status"}
              className={`flex items-start gap-2.5 rounded-lg border border-l-4 border-slate-200 bg-white p-3 shadow-lg ${VARIANT_ACCENT[toast.variant]}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm leading-5 text-slate-700">{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
