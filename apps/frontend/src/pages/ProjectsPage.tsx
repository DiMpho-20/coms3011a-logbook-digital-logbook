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

type EntryField = Partial<BaseEntryField> &
  Pick<BaseEntryField, "id" | "name" | "type" | "required"> & {
    isNew?: boolean;
  };

type FilterTab = "ALL" | "ACTIVE" | "ARCHIVED";

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
    try {
      const fields = await fetchEntryFields(project.id);
      setEntryFields(fields);
      setRemovedFieldIds([]);
    } catch {
      setEntryFields([]);
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
      { id: `new-${crypto.randomUUID()}`, name: "", type: "TEXT", required: false, isNew: true },
    ]);
  };

  const handleUpdateField = (id: string, updates: Partial<EntryField>) => {
    setEntryFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
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
    setSaving(true);
    setFormError(null);
    // Read the tags input directly rather than the `tags` state: clicking
    // this submit button blurs the tags input in the same tick, and that
    // blur's commit hasn't reached `tags` yet when this handler runs.
    const finalTags = tagInputRef.current?.getValue() ?? tags;
    try {
      if (editingProject) {
        await updateProject(editingProject.id, {
          name: formData.name,
          description: formData.description || undefined,
          tags: finalTags,
        });
        for (const field of entryFields) {
          if (!field.name.trim()) continue;
          if (field.isNew) {
            await createEntryField(editingProject.id, { name: field.name, type: field.type, required: field.required, formula: field.formula || undefined });
          } else {
            await updateEntryField(field.id, {
              name: field.name,
              type: field.type,
              required: field.required,
              formula: field.type === "COMPUTED" ? field.formula : undefined,
            });
          }
        }
        await Promise.all(removedFieldIds.map(deleteEntryField));
        // Read the saved configuration back before leaving the editor. A
        // refresh failure must not turn an already-saved update into an error.
        await fetchEntryFields(editingProject.id)
          .then(setEntryFields)
          .catch(() => {});
      } else {
        const newProject = await createProject({
          name: formData.name,
          description: formData.description || undefined,
          status: "ACTIVE",
          tags: finalTags,
        });
        for (const field of entryFields) {
          if (!field.name.trim()) continue;
          if (field.isNew) {
            await createEntryField(newProject.id, { name: field.name, type: field.type, required: field.required, formula: field.formula || undefined });
          }
        }
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
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Entry Fields</label>
              <button
                type="button"
                onClick={handleAddField}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                + Add Field
              </button>
            </div>

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
                        onChange={(e) => handleUpdateField(field.id, { name: e.target.value })}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    {field.type === "COMPUTED" && (
                      <div>
                        <input
                          type="text"
                          placeholder="Formula, e.g. {numeric-field-id} * 2"
                          value={field.formula || ""}
                          onChange={(e) => handleUpdateField(field.id, { formula: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Use numeric field IDs in braces, for example <code>{"{a-field-id} * 2"}</code>.</p>
                      </div>
                    )}
                    {!field.isNew && field.type === "NUMBER" && (
                      <p className="text-[10px] text-slate-400">Formula ID: <code>{field.id}</code></p>
                    )}
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) =>
                          handleUpdateField(field.id, { required: e.target.checked })
                        }
                      />
                      Required field
                    </label>
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
