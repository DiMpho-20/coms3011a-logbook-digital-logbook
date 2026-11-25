import { useEffect, useState } from "react";
import { AlignJustify, Moon, Monitor, Rows3, Sun } from "lucide-react";
import { applyAccent, applyDensity, applyTheme, type AccentColor, type Density, type Theme } from "../../lib/appearance";
import { DEFAULTS, load, save } from "./preferences";
import { GroupLabel, Section } from "./parts";

/** Theme, accent colour and density — stored here, applied app-wide. */
export default function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>(() => load("logbook-theme", DEFAULTS.theme));
  const [accent, setAccent] = useState<AccentColor>(() => load("logbook-accent", DEFAULTS.accent));
  const [density, setDensity] = useState<Density>(() => load("logbook-density", DEFAULTS.density));

  // Persist appearance on change
  useEffect(() => { save("logbook-theme", theme); applyTheme(theme); }, [theme]);
  useEffect(() => { save("logbook-accent", accent); applyAccent(accent); }, [accent]);
  useEffect(() => { save("logbook-density", density); applyDensity(density); }, [density]);

  return (
    <Section title="Appearance">
      <div>
        <GroupLabel text="Theme" />
        <div className="flex flex-wrap gap-3">
          {([
            { value: "light" as const, icon: Sun, label: "Light" },
            { value: "dark" as const, icon: Moon, label: "Dark" },
            { value: "system" as const, icon: Monitor, label: "System" },
          ]).map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
              className={`flex flex-col items-center justify-center gap-2 w-[104px] h-[74px] rounded-xl border-2 bg-white transition ${
                theme === value ? "border-blue-500 text-blue-700" : "border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[13px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-100 pt-6">
        <GroupLabel text="Accent colour" />
        <div className="flex gap-3">
          {([
            // Fixed colours rather than bg-* classes: the accent stylesheet
            // remaps the blue utilities, and the swatches must not move.
            { value: "blue" as const, color: "#2563eb" },
            { value: "emerald" as const, color: "#059669" },
            { value: "violet" as const, color: "#7c3aed" },
            { value: "amber" as const, color: "#d97706" },
            { value: "rose" as const, color: "#e11d48" },
          ]).map(({ value, color }) => (
            <button
              key={value}
              onClick={() => setAccent(value)}
              style={{ backgroundColor: color }}
              className={`h-9 w-9 rounded-full transition ${
                accent === value ? "ring-2 ring-offset-2 ring-blue-500" : "hover:scale-105"
              }`}
              aria-label={value}
              aria-pressed={accent === value}
            />
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Recolours buttons, links and highlights across the app.
        </p>
      </div>
      <div className="border-t border-slate-100 pt-6">
        <GroupLabel text="Density" />
        <div className="flex flex-wrap gap-3">
          {([
            { value: "comfortable" as const, icon: AlignJustify, label: "Comfortable", hint: "Default spacing" },
            { value: "compact" as const, icon: Rows3, label: "Compact", hint: "More on screen" },
          ]).map(({ value, icon: Icon, label, hint }) => (
            <button
              key={value}
              onClick={() => setDensity(value)}
              aria-pressed={density === value}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border-2 transition text-left w-full sm:w-[250px] ${
                density === value ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${density === value ? "text-blue-700" : "text-slate-600"}`} />
              <span>
                <span className={`block text-[13px] font-medium ${density === value ? "text-blue-700" : "text-slate-800"}`}>{label}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Tightens padding only — text stays the same size.
        </p>
      </div>
    </Section>
  );
}
