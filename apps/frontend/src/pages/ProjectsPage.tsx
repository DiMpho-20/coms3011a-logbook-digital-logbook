import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Search, X, LayoutGrid, List } from "lucide-react";

import {
  fetchProjects,
  fetchEntryFields,
  fetchProjectTimeSummary,
  createProject,
  updateProject,
  toggleProjectStatus,
  createEntryField,
  updateEntryField,
  deleteEntryField,
  fetchTags,
  type Project,
  type EntryField as BaseEntryField,
  type TimeSummary,
} from "../api";
import PageHeader from "../components/PageHeader";
import ProjectCard from "../components/ProjectCard";
import Modal from "../components/Modal";
import LoadingState from "../components/LoadingState";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import TagInput, { type TagInputHandle } from "../components/TagInput";
import TagFilterBar from "../components/TagFilterBar";
import { FolderKanban } from "lucide-react";
import { findFormulaProblem, formulaIdsToNames, formulaNamesToIds, orderForSaving } from "../lib/formulas";

type EntryField = Partial<BaseEntryField> &
  Pick<BaseEntryField, "id" | "name" | "type" | "required"> & {
    isNew?: boolean;
    /** Local-only: whether `name` should track the type's default label, or was typed by hand. */
    useDefaultName?: boolean;
  };

type FilterTab = "ALL" | "ACTIVE" | "ARCHIVED";

/**
 * Turns saved fields into editor rows. A field saved with its type's default
 * label (e.g. "Link") looks the same either way once loaded, so the toggle is
 * inferred from that — there's no separate flag stored for it. Formulas are
 * shown with field names in place of the ids they are stored with.
 */
function toFormFields(fields: BaseEntryField[]): EntryField[] {
  return fields.map((f) => ({
    ...f,
    formula: f.formula ? formulaIdsToNames(f.formula, fields) : f.formula,
    useDefaultName: f.name === DEFAULT_FIELD_NAMES[f.type],
  }));
}

/** Shown in the entry form and on entry cards when a field isn't given its own name. */
const DEFAULT_FIELD_NAMES: Record<BaseEntryField["type"], string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Boolean",
  TAGS: "Tags",
  CHECKLIST: "Checklist",
  LINK: "Link",
  REFERENCE: "Reference",
  COMPUTED: "Computed",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [summaries, setSummaries] = useState<Record<string, TimeSummary>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterTab>("ACTIVE");
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [tags, setTags] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const tagInputRef = useRef<TagInputHandle>(null);
  const [entryFields, setEntryFields] = useState<EntryField[]>([]);
  const [removedFieldIds, setRemovedFieldIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchTags().then((t) => setTagSuggestions(t.map((tag) => tag.name))).catch(() => {});
  }, []);

  // Guards against an older load overwriting a newer one's results.
  const loadRunRef = useRef(0);

  const loadProjects = async () => {
    const run = ++loadRunRef.current;
    try {
      setLoadError(null);
      setLoading(true);
      const data = await fetchProjects();
      if (run !== loadRunRef.current) return;
      setProjects(data);

      // Render the list now. Time summaries are one request per project,
      // so awaiting all of them here held the whole page on a spinner
      // until the slowest one returned.
      setLoading(false);

      void Promise.all(
        data.map(async (p) => {
          try {
            const sum = await fetchProjectTimeSummary(p.id);
            return { id: p.id, summary: sum };
          } catch {
            return { id: p.id, summary: null };
          }
        })
      ).then((summaryResults) => {
        if (run !== loadRunRef.current) return;
        const sMap: Record<string, TimeSummary> = {};
        summaryResults.forEach((r) => {
          if (r.summary) sMap[r.id] = r.summary;
        });
        setSummaries(sMap);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load projects.";
      if (run === loadRunRef.current) setLoadError(msg);
    } finally {
      if (run === loadRunRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesFilter = filter === "ALL" || p.status === filter;
      const matchesSearch =
        (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTags =
        tagFilters.length === 0 || (p.tags || []).some((t) => tagFilters.includes(t));
      return matchesFilter && matchesSearch && matchesTags;
    });
  }, [projects, filter, searchQuery, tagFilters]);

  // "You have nothing yet" and "nothing matches your filters" are different
  // states and deserve different copy. The filter defaults to ACTIVE, so
  // inferring the first from the filter told every brand-new user to adjust
  // filters they had never set — and withheld the one button they needed.
  // Whether the unfiltered list is empty is what actually decides it.
  const hasNoProjects = projects.length === 0;

  // Modal handlers
  const openCreateModal = () => {
    setEditingProject(null);
    setFormData({ name: "", description: "" });
    setTags([]);
    setEntryFields([]);
    setRemovedFieldIds([]);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = async (project: Project) => {
    setEditingProject(project);
    setFormData({ name: project.name, description: project.description || "" });
    setTags(project.tags ?? []);
    setFormError(null);
    setRemovedFieldIds([]);
    try {
      const fields = await fetchEntryFields(project.id);
      setEntryFields(toFormFields(fields));
    } catch {
      // Say so rather than showing an empty list, which reads as "this
      // project has no fields" when they simply failed to load.
      setEntryFields([]);
      setFormError("This project's entry fields could not be loaded. Close and try again before changing them.");
    }
    setModalOpen(true);
  };

  const handleAddField = () => {
    setEntryFields((prev) => [
      ...prev,
      // crypto.randomUUID rather than Date.now: two clicks inside the same
      // millisecond produced identical ids, and the rows are keyed on them,
      // so React saw duplicate keys and duplicated or dropped rows (BUG-013).
      // The "new-" prefix is load-bearing — removeField tests it to decide
      // whether a row needs a DELETE call.
      { id: `new-${crypto.randomUUID()}`, name: "", type: "TEXT", required: true, isNew: true, useDefaultName: false },
    ]);
  };

  const handleUpdateField = (id: string, updates: Partial<EntryField>) => {
    setEntryFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...updates };
        // Keep the name in step with the type while "use default name" is on,
        // both when the type changes and when the toggle is switched on.
        if (next.useDefaultName) next.name = DEFAULT_FIELD_NAMES[next.type as BaseEntryField["type"]];
        return next;
      })
    );
  };

  const handleRemoveField = (id: string) => {
    if (!id.startsWith("new-")) setRemovedFieldIds((previous) => [...previous, id]);
    setEntryFields((prev) => prev.filter((f) => f.id !== id));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError("Project name is required.");
      return;
    }
    const fieldsToSave = entryFields.filter((field) => field.name.trim());
    // Check formulas before saving anything: a rejected formula used to leave
    // the project created with only some of its fields.
    for (const field of fieldsToSave) {
      if (field.type !== "COMPUTED") continue;
      const problem = findFormulaProblem(field, fieldsToSave);
      if (problem) {
        setFormError(problem);
        return;
      }
    }
    setSaving(true);
    setFormError(null);
    // Read the tags input directly rather than the `tags` state: clicking
    // this submit button blurs the tags input in the same tick, and that
    // blur's commit hasn't reached `tags` yet when this handler runs.
    const finalTags = tagInputRef.current?.getValue() ?? tags;

    // Computed fields go last, each after the computed fields it uses, so
    // every field a formula names already has the id it is stored with.
    const saveFields = async (projectId: string) => {
      const savedIds = new Map(fieldsToSave.filter((f) => !f.isNew).map((f) => [f.id, f.id]));
      for (const field of orderForSaving(fieldsToSave)) {
        const formula = field.type === "COMPUTED"
          ? formulaNamesToIds(field, fieldsToSave, savedIds)
          : undefined;
        if (field.isNew) {
          // Always required — a computed field fills itself in regardless,
          // and every other field type must be filled in on each entry.
          const created = await createEntryField(projectId, { name: field.name, type: field.type, required: true, formula });
          savedIds.set(field.id, created.id);
        } else {
          await updateEntryField(field.id, { name: field.name, type: field.type, required: true, formula });
        }
      }
    };

    try {
      if (editingProject) {
        await updateProject(editingProject.id, {
          name: formData.name,
          description: formData.description || undefined,
          tags: finalTags,
        });
        await saveFields(editingProject.id);
        await Promise.all(removedFieldIds.map(deleteEntryField));
        setRemovedFieldIds([]);
        // Read the saved configuration back before leaving the editor. A
        // refresh failure must not turn an already-saved update into an error.
        await fetchEntryFields(editingProject.id)
          .then((fields) => setEntryFields(toFormFields(fields)))
          .catch(() => {});
      } else {
        const newProject = await createProject({
          name: formData.name,
          description: formData.description || undefined,
          status: "ACTIVE",
          tags: finalTags,
        });
        await saveFields(newProject.id);
      }
      await loadProjects();
      setModalOpen(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err instanceof Error ? err.message : "Something went wrong while saving.");
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async (project: Project) => {
    const newStatus = project.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    try {
      await toggleProjectStatus(project.id, newStatus);
      await loadProjects();
    } catch (err) {
      console.error("Failed to update project status:", err);
    }
  };

  if (loading) return <LoadingState message="Loading projects..." />;
  if (loadError) return <ErrorState message={loadError} onRetry={loadProjects} />;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Projects"
        subtitle="Manage your projects and track the work you've done."
        action={
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterTab)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 transition ${
                viewMode === "grid"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-400 hover:text-slate-600"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition ${
                viewMode === "list"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-400 hover:text-slate-600"
              }`}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <TagFilterBar tags={tagSuggestions} selected={tagFilters} onChange={setTagFilters} />

      {/* Project grid */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={hasNoProjects ? "No projects yet" : "No matching projects"}
          description={
            hasNoProjects
              ? "Create your first project to start logging entries."
              : "Try adjusting your search or filters."
          }
          action={
            hasNoProjects ? (
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                <Plus className="h-4 w-4" /> New Project
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-3"}>
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              summary={summaries[project.id]}
              onEdit={openEditModal}
              onToggleArchive={handleToggleArchive}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProject ? `Edit ${editingProject.name}` : "Create New Project"}
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg p-3 flex items-center gap-2">
              <X className="h-3.5 w-3.5 shrink-0" /> {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Enter project name..."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input
              type="text"
              placeholder="Brief description (optional)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tags</label>
            <TagInput ref={tagInputRef} value={tags} onChange={setTags} suggestions={tagSuggestions} placeholder="e.g. coursework, urgent" />
          </div>

          {/* Entry fields builder */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Entry Fields</label>
              <button
                type="button"
                onClick={handleAddField}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                + Add Field
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Every field must be filled in on each entry (computed fields fill themselves in).
            </p>

            {entryFields.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                No custom fields. Add fields to define what each entry should contain.
              </p>
            ) : (
              <div className="space-y-2">
                {entryFields.map((field) => (
                  <div
                    key={field.id}
                    className="border border-slate-200 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Field name..."
                        value={field.name}
                        disabled={field.useDefaultName}
                        onChange={(e) => handleUpdateField(field.id, { name: e.target.value })}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      <select
                        value={field.type}
                        onChange={(e) =>
                          handleUpdateField(field.id, {
                            type: e.target.value as EntryField["type"],
                          })
                        }
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="TEXT">Text</option>
                        <option value="NUMBER">Number</option>
                        <option value="DATE">Date</option>
                        <option value="BOOLEAN">Boolean</option>
                        <option value="TAGS">Tags</option>
                        <option value="CHECKLIST">Checklist</option>
                        <option value="LINK">Link</option>
                        <option value="REFERENCE">Reference</option>
                        <option value="COMPUTED">Computed number</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveField(field.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Remove field"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={!!field.useDefaultName}
                        onChange={(e) => handleUpdateField(field.id, { useDefaultName: e.target.checked })}
                      />
                      Use the default name for this type (e.g. "{DEFAULT_FIELD_NAMES[field.type]}")
                    </label>
                    {field.type === "COMPUTED" && (
                      <div>
                        <input
                          type="text"
                          placeholder="Formula, e.g. {Hours} * {Rate}"
                          value={field.formula || ""}
                          onChange={(e) => handleUpdateField(field.id, { formula: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          Put Number or Computed field names in braces, for example <code>{"{Hours} * 2"}</code>.
                          {(() => {
                            const names = entryFields
                              .filter((f) => f.id !== field.id && (f.type === "NUMBER" || f.type === "COMPUTED") && f.name.trim())
                              .map((f) => `{${f.name.trim()}}`);
                            return names.length > 0
                              ? <> Available: <code>{names.join(", ")}</code></>
                              : <> Add a Number field first.</>;
                          })()}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? "Saving..." : editingProject ? "Update Project" : "Create Project"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
