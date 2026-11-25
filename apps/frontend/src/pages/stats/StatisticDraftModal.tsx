import Modal from "../../components/Modal";
import { button } from "../../lib/ui";
import { ErrorLine } from "./Feedback";
import { labelClass, selectClass } from "./format";
import type { SavedStatistics } from "./useSavedStatistics";

/**
 * Writing a statistic's name and expression. The same dialog creates and
 * edits — an id of "" is what makes it a new one. The server parses the
 * expression with the same parser the panel above uses, so its refusal is
 * shown in place.
 */
export default function StatisticDraftModal({ saved }: { saved: SavedStatistics }) {
  const { draft, setDraft } = saved;
  return (
    <Modal
      open={draft !== null}
      onClose={saved.closeDraft}
      title={draft?.id ? "Edit statistic" : "New statistic"}
    >
      <form onSubmit={saved.submitDraft} className="space-y-3">
        <div>
          <label htmlFor="statistic-name" className={labelClass}>
            Name
          </label>
          <input
            id="statistic-name"
            value={draft?.name ?? ""}
            onChange={(e) => setDraft((current) => (current ? { ...current, name: e.target.value } : current))}
            placeholder="Average Hours Per Entry"
            className={selectClass}
          />
        </div>
        <div>
          <label htmlFor="statistic-expression" className={labelClass}>
            Expression
          </label>
          <input
            id="statistic-expression"
            value={draft?.expression ?? ""}
            onChange={(e) => setDraft((current) => (current ? { ...current, expression: e.target.value } : current))}
            placeholder="SUM({Hours}) / COUNT()"
            className={`${selectClass} font-mono`}
          />
          <p className="mt-1 text-[11px] text-slate-500">Saved against this project, and worked out again every time it is shown.</p>
        </div>
        {saved.draftError && <ErrorLine text={saved.draftError} />}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={saved.closeDraft} className={button("secondary")}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saved.savingDraft || !draft?.name.trim() || !draft?.expression.trim()}
            className={button("primary")}
          >
            {saved.savingDraft ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
