/**
 * The app's small design vocabulary, as Tailwind class strings: semantic tones
 * for status, and the four kinds of button. Pages use these instead of
 * spelling the classes out again, so a button looks like a button everywhere.
 *
 * Colours are deliberately few. Blue is the one accent, and it follows the
 * accent chosen in Settings, because index.css recolours the blue classes.
 * Red is kept for destructive actions and genuine errors, not for "you're
 * doing badly". Every shade used here has a dark-theme override in index.css.
 */

export type Tone = "neutral" | "info" | "success" | "caution" | "danger";

export const TONE_STYLES: Record<Tone, string> = {
  neutral: "bg-slate-100 border-slate-200 text-slate-600",
  info: "bg-blue-50 border-blue-200 text-blue-700",
  success: "bg-emerald-50 border-emerald-200 text-emerald-700",
  caution: "bg-amber-50 border-amber-200 text-amber-700",
  danger: "bg-red-50 border-red-200 text-red-700",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
const SIZE = { md: "h-10 px-4 text-sm", sm: "h-8 px-3 text-xs" };

/** Primary for the one main action on a screen; secondary for the rest; ghost for low emphasis. */
export function button(variant: "primary" | "secondary" | "ghost" | "danger" = "secondary", size: "md" | "sm" = "md"): string {
  const look = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
    secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return `${BASE} ${SIZE[size]} ${look}`;
}

/** A pill-shaped choice in a group (presets, filters, modes). */
export function chipToggle(selected: boolean): string {
  return `inline-flex items-center gap-1 h-8 px-3 rounded-full border text-xs font-medium transition duration-150 ${
    selected ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
}

export const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
