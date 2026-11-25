import { exportLogbook, fetchEntries, fetchEntryFields, fetchProjects, importLogbook } from "../../api";
import { entriesToCsv } from "../../lib/csvExport";
import { downloadFile } from "./format";

/** Write a full JSON backup and say what went into it. */
export async function downloadBackupJSON(): Promise<string> {
  const backup = await exportLogbook();
  downloadFile("digital-logbook-backup.json", JSON.stringify(backup, null, 2), "application/json");
  return `Exported ${backup.projects.length} project${backup.projects.length === 1 ? "" : "s"}.`;
}

/** Write every entry, from every project, as one spreadsheet. */
export async function downloadBackupCSV(): Promise<string> {
  const projects = await fetchProjects();
  const data = await Promise.all(projects.map(async (project) => {
    const [fields, entries] = await Promise.all([
      fetchEntryFields(project.id),
      fetchEntries(project.id, { archived: "include" }),
    ]);
    return { project, fields, entries };
  }));
  // The byte-order mark makes Excel read the file as UTF-8.
  downloadFile("logbook-entries.csv", "﻿" + entriesToCsv(data), "text/csv");
  const count = data.reduce((n, d) => n + d.entries.length, 0);
  return `Exported ${count} entr${count === 1 ? "y" : "ies"} as CSV.`;
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(String(ev.target?.result ?? ""));
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsText(file);
  });
}

/**
 * Restore a backup file, then the preferences it carried.
 *
 * The preferences are written second, and only once the logbook itself is in,
 * so a failed import changes nothing.
 */
export async function importBackupFile(file: File): Promise<string> {
  const data = JSON.parse(await readText(file));
  const result = await importLogbook(data);

  let preferences = 0;
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("logbook-") && key !== "logbook-avatar") {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      preferences++;
    }
  }

  return `Imported ${result.projects} project${result.projects === 1 ? "" : "s"} and ${result.entries} entr${result.entries === 1 ? "y" : "ies"}${preferences ? `, plus ${preferences} preference${preferences === 1 ? "" : "s"}` : ""}.`;
}
