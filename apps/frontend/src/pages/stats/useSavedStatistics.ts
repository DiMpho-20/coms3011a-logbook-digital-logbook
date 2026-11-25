import { useCallback, useEffect, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";

import { api } from "../../api/client";
import type { SavedStatistic } from "./format";

/** The statistic being written: an id of "" while it is a new one. */
export type StatisticDraft = { id: string; name: string; expression: string };

export interface SavedStatistics {
  saved: SavedStatistic[];
  loadingSaved: boolean;
  savedError: string | null;
  draft: StatisticDraft | null;
  setDraft: Dispatch<SetStateAction<StatisticDraft | null>>;
  savingDraft: boolean;
  draftError: string | null;
  deleting: SavedStatistic | null;
  openNewStatistic: (expressionText?: string) => void;
  openEditStatistic: (statistic: SavedStatistic) => void;
  closeDraft: () => void;
  selectForDeletion: (statistic: SavedStatistic) => void;
  closeDelete: () => void;
  submitDraft: (event: FormEvent) => Promise<void>;
  confirmDelete: () => Promise<void>;
}

/**
 * A project's saved statistics (US17). Only the definition is stored
 * server-side; the value on each one is worked out fresh whenever the list
 * is fetched.
 */
export function useSavedStatistics(projectId: string): SavedStatistics {
  const [saved, setSaved] = useState<SavedStatistic[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [draft, setDraft] = useState<StatisticDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedStatistic | null>(null);

  const loadSaved = useCallback(async (project: string) => {
    setLoadingSaved(true);
    setSavedError(null);
    try {
      const res = await api.get(`/projects/${project}/custom-statistics`);
      setSaved(res.data);
    } catch (err: any) {
      setSavedError(err?.response?.data?.error ?? "Could not load your saved statistics");
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    if (projectId) void loadSaved(projectId);
  }, [projectId, loadSaved]);

  const openNewStatistic = (expressionText = "") => {
    setDraftError(null);
    setDraft({ id: "", name: "", expression: expressionText });
  };

  const openEditStatistic = (statistic: SavedStatistic) => {
    setDraftError(null);
    setDraft({ id: statistic.id, name: statistic.name, expression: statistic.expression });
  };

  const submitDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !projectId) return;
    setSavingDraft(true);
    setDraftError(null);
    try {
      const body = { name: draft.name.trim(), expression: draft.expression.trim() };
      if (draft.id) {
        await api.patch(`/projects/${projectId}/custom-statistics/${draft.id}`, body);
      } else {
        await api.post(`/projects/${projectId}/custom-statistics`, body);
      }
      setDraft(null);
      await loadSaved(projectId);
    } catch (err: any) {
      // The server checks the expression with the same parser the panel
      // above uses, so its complaint is the one worth showing.
      setDraftError(err?.response?.data?.error ?? "Could not save that statistic");
    } finally {
      setSavingDraft(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || !projectId) return;
    try {
      await api.delete(`/projects/${projectId}/custom-statistics/${deleting.id}`);
      setDeleting(null);
      await loadSaved(projectId);
    } catch (err: any) {
      setSavedError(err?.response?.data?.error ?? "Could not delete that statistic");
      setDeleting(null);
    }
  };

  return {
    saved,
    loadingSaved,
    savedError,
    draft,
    setDraft,
    savingDraft,
    draftError,
    deleting,
    openNewStatistic,
    openEditStatistic,
    closeDraft: () => setDraft(null),
    selectForDeletion: setDeleting,
    closeDelete: () => setDeleting(null),
    submitDraft,
    confirmDelete,
  };
}
