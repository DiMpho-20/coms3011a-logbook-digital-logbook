import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { QueryContext } from "./settings/query";
import { SECTIONS, type SectionId } from "./settings/sections";
import { SettingsNav } from "./settings/parts";
import AccountSection from "./settings/AccountSection";
import AppearanceSection from "./settings/AppearanceSection";
import LogbookSection from "./settings/LogbookSection";
import NotificationsSection from "./settings/NotificationsSection";
import SecuritySection from "./settings/SecuritySection";
import DataSection from "./settings/DataSection";
import ExportSection from "./settings/ExportSection";

/**
 * Settings: one section at a time, chosen from the nav and kept in the URL.
 *
 * Each section owns its own state and its own slice of localStorage, so this
 * file only decides which one is open and what the search matches. That is
 * also why a section's defaults survive a visit to another section: unmounting
 * and remounting re-reads what was saved.
 */
export default function SettingsPage() {
  // Which panel is open, kept in the URL so a section can be linked to and
  // survives a reload — ?section=security rather than component state alone.
  const [searchParams, setSearchParams] = useSearchParams();
  const active = (searchParams.get("section") ?? "account") as SectionId;
  const setActive = useCallback(
    (id: SectionId) => setSearchParams(id === "account" ? {} : { section: id }),
    [setSearchParams]
  );
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!trimmedQuery) return null;
    return SECTIONS.filter(
      (section) =>
        section.label.toLowerCase().includes(trimmedQuery) ||
        section.keywords.includes(trimmedQuery)
    ).map((section) => section.id);
  }, [trimmedQuery]);

  // Searching jumps to the first section that matches, so the highlighted
  // setting is on screen rather than behind another nav item.
  useEffect(() => {
    if (matches && matches.length > 0 && !matches.includes(active)) setActive(matches[0]);
  }, [matches, active, setActive]);

  return (
    <QueryContext.Provider value={trimmedQuery}>
      <div className="space-y-6 max-w-6xl">
        <PageHeader title="Settings" subtitle="Your account, how the app looks, and what it does with your data." />

        <div className="grid lg:grid-cols-[232px_1fr] gap-6 items-start">
          <div className="space-y-3 min-w-0">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings…"
                aria-label="Search settings"
                className="w-full border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
              />
            </div>

            {matches !== null && (
              <p className="text-xs text-slate-500" role="status">
                {matches.length === 0 ? (
                  "Nothing matches that. Try \u201cdark\u201d, \u201c2fa\u201d or \u201cexport\u201d."
                ) : (
                  <>
                    {matches.length} match{matches.length === 1 ? "" : "es"} in{" "}
                    <span className="font-medium text-slate-700">
                      {matches.map((id) => SECTIONS.find((section) => section.id === id)!.label).join(", ")}
                    </span>
                  </>
                )}
              </p>
            )}

            <SettingsNav active={active} onSelect={setActive} matches={matches} />
          </div>

          <div className="space-y-5 min-w-0">
            {active === "account" && <AccountSection />}
            {active === "appearance" && <AppearanceSection />}
            {active === "logbook" && <LogbookSection />}
            {active === "notifications" && <NotificationsSection />}
            {active === "security" && <SecuritySection />}
            {active === "privacy" && <DataSection />}
            {active === "export" && <ExportSection />}
          </div>
        </div>
      </div>
    </QueryContext.Provider>
  );
}
