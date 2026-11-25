import { useEffect, useState } from "react";
import { fetchProjects, type Project } from "../../api";
import { DEFAULTS, load, save, type EntryView, type LogbookPrefs, type SortOrder, type TimeFormat, type WeekStart } from "./preferences";
import { Field, Section } from "./parts";
import { inputCls } from "./styles";

/** The defaults for a new entry, stored in this browser. */
export default function LogbookSection() {
  const [logbook, setLogbook] = useState<LogbookPrefs>(() => load("logbook-prefs", DEFAULTS.logbook));
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => { save("logbook-prefs", logbook); }, [logbook]);

  // Load projects for default project selector
  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  return (
    <Section title="Logbook Preferences">
      <Field label="Default project for new entries">
        <select
          value={logbook.defaultProjectId}
          onChange={(e) => setLogbook({ ...logbook, defaultProjectId: e.target.value })}
          className={inputCls}
        >
          <option value="">None - always ask</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Default entry view">
          <select
            value={logbook.defaultView}
            onChange={(e) => setLogbook({ ...logbook, defaultView: e.target.value as EntryView })}
            className={inputCls}
          >
            <option value="timeline">Timeline</option>
            <option value="list">List</option>
          </select>
        </Field>
        <Field label="Sort order">
          <select
            value={logbook.defaultSort}
            onChange={(e) => setLogbook({ ...logbook, defaultSort: e.target.value as SortOrder })}
            className={inputCls}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </Field>
        <Field label="Week starts on">
          <select
            value={logbook.weekStartsOn}
            onChange={(e) => setLogbook({ ...logbook, weekStartsOn: e.target.value as WeekStart })}
            className={inputCls}
          >
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </select>
        </Field>
        <Field label="Time format">
          <select
            value={logbook.timeFormat}
            onChange={(e) => setLogbook({ ...logbook, timeFormat: e.target.value as TimeFormat })}
            className={inputCls}
          >
            <option value="24h">24-hour</option>
            <option value="12h">12-hour</option>
          </select>
        </Field>
      </div>
    </Section>
  );
}
