import { useCallback, useRef, useState, type ReactElement } from "react";
import ConfirmDialog, { type ConfirmOptions } from "../components/ConfirmDialog";

/**
 * A drop-in replacement for window.confirm that shows ConfirmDialog instead:
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title, message, confirmLabel: "Delete" }))) return;
 *   …and render {confirmDialog} somewhere in the page.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactElement] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A question left open is answered "no" before the next is asked.
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  const dialog = (
    <ConfirmDialog
      open={options !== null}
      title={options?.title ?? ""}
      message={options?.message ?? ""}
      confirmLabel={options?.confirmLabel ?? "Confirm"}
      tone={options?.tone}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );

  return [confirm, dialog];
}
