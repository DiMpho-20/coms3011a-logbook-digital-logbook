import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Section } from "./parts";
import { downloadBackupCSV, downloadBackupJSON, importBackupFile } from "./transfer";

/** Export the whole logbook, or put a backup back. */
export default function ExportSection() {
  const importRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);

  const run = async (job: () => Promise<string>, failure: string) => {
    try {
      setMessage(await job());
    } catch {
      setMessage(failure);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared first so choosing the same file twice still fires a change.
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      setMessage(await importBackupFile(file));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The selected file could not be imported.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Section title="Export / import">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-800">Export logbook</p>
          <p className="text-xs text-slate-500 mt-0.5">JSON is a full backup you can import again; CSV is every entry as a spreadsheet.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => run(downloadBackupJSON, "Export failed. Check your connection and try again.")}
            className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
          <button
            onClick={() => run(downloadBackupCSV, "CSV export failed. Check your connection and try again.")}
            className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>
      <div className="border-t border-slate-100 pt-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-800">Import / restore backup</p>
          <p className="text-xs text-slate-500 mt-0.5">Restore projects, custom fields, and entries from a Digital Logbook JSON backup.</p>
        </div>
        <button disabled={importing} onClick={() => importRef.current?.click()} className="shrink-0 flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50">
          <Upload className="h-3.5 w-3.5" /> {importing ? "Importing..." : "Import"}
        </button>
        <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>
      {message && <p className="text-xs text-slate-600 bg-slate-50 rounded-md px-3 py-2">{message}</p>}
    </Section>
  );
}
