import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Search, FolderKanban, Edit2, Archive, ArchiveRestore, X,
  LayoutDashboard, ClipboardList, CheckSquare, FileBarChart,
  User, LogOut, ChevronDown,
} from "lucide-react";
import EntryBrowser from "./EntryBrowser";

import {
  fetchProjects,
  createProject,
  updateProject,
  createEntryField,
  fetchEntryFields,
  type Project,
} from "./api";

type EntryField = {
  id: string;
  name: string;
  type: "TEXT" | "NUMBER" | "DATE" | "BOOLEAN";
  required: boolean;
  isNew?: boolean; // Optional property to indicate if the field is newly added
};

type ViewId = "dashboard" | "projects" | "entries" | "validation" | "reports";

const NAV_ITEMS: { id: ViewId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "projects", label: "Project Management", icon: FolderKanban },
  { id: "entries", label: "Entry Browser", icon: ClipboardList },
  { id: "validation", label: "Logbook Validation", icon: CheckSquare },
  { id: "reports", label: "Reports & Exports", icon: FileBarChart },
];

// Simple placeholder used for sections that aren't built yet.
function PlaceholderView({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-blue-900 tracking-tight">{label}</h1>
        <p className="text-xs font-medium text-slate-500 mt-0.5">
          This section is coming soon
        </p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 flex flex-col items-center justify-center text-center">
        <div className="p-3 bg-blue-50 rounded-2xl mb-3">
          <Icon className="h-6 w-6 text-[#0084D4]" />
        </div>
        <p className="text-sm font-bold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          This part of the app hasn't been built yet. Check back soon.
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [activeView, setActiveView] = useState<ViewId>("projects");

  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  const [entryFields, setEntryFields] = useState<EntryField[]>([]);

  // Profile menu (bottom of sidebar)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadProjects = async () => {
    try {
      const data = await fetchProjects();
      setProjects(data);
    } catch (err) {
      console.error("Error loading projects:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingProject(null);
    setFormData({ name: "", description: "" });
    setEntryFields([]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name || "",
      description: project.description || "",
    });

    try {
      const fields = await fetchEntryFields(project.id);
      setEntryFields(fields);
    } catch (err) {
      console.error("Failed to load entry fields:", err);
      setEntryFields([]);
    }

    setIsModalOpen(true);
  };

  const handleAddEntryField = () => {
    const newField: EntryField = {
      id: "",
      name: "",
      type: "TEXT",
      required: false,
      isNew: true,
    };

    setEntryFields((fields) => [...fields, newField]);
  };

  const handleUpdateEntryField = (
    id: string,
    updates: Partial<EntryField>
  ) => {
    setEntryFields((fields) =>
      fields.map((field) =>
        field.id === id ? { ...field, ...updates } : field
      )
    );
  };

  const handleRemoveEntryField = (id: string) => {
    setEntryFields((fields) => fields.filter((field) => field.id !== id));
  };

  const handleToggleArchive = async (project: Project) => {
    const newStatus = project.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    try {
      await updateProject(project.id, { status: newStatus });
      await loadProjects();
    } catch (err) {
      console.error("Failed to update project status:", err);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) return;

    try {
      if (editingProject) {
        await updateProject(editingProject.id, {
          name: formData.name,
          description: formData.description,
        });

        for (const field of entryFields) {
          if (!field.name.trim()) continue;

          // Only create fields that don't already exist in the database
          if (!field.id.includes("-")) {
            await createEntryField(editingProject.id, {
              name: field.name,
              type: field.type,
            });
          }
        }
      } else {
        const newProject = await createProject({
          name: formData.name,
          description: formData.description || "",
          status: "ACTIVE",
        });

        for (const field of entryFields) {
          if (!field.name.trim()) continue;

          if (field.isNew) {
            console.log("CREATING FIELD:", field.name, field.type);

            await createEntryField(newProject.id, {
              name: field.name,
              type: field.type,
            });
          }
        }
      }

      await loadProjects();
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save project:", err);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesFilter = filter === "ALL" || p.status === filter;
    const matchesSearch =
      (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden text-slate-800">
      <aside className="w-64 bg-[#0084D4] text-white flex flex-col justify-between p-4 shrink-0 shadow-lg relative z-20">
        <div>
          <div className="flex items-center gap-3 px-2 py-3 mb-4 border-b border-white/20">
            <div className="p-2 bg-white/10 rounded-xl">
              <FolderKanban className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-base leading-tight">Digital Logbook</h1>
              <p className="text-[11px] text-cyan-100 font-medium">Logbook System</p>
            </div>
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                    isActive
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-cyan-50 hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Profile / logout */}
        <div ref={profileRef} className="relative border-t border-white/20 pt-3">
          {profileMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden text-slate-700 z-30">
              <button
                onClick={() => setProfileMenuOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold hover:bg-slate-50 transition text-left"
              >
                <User className="h-4 w-4 text-slate-500" /> View Profile
              </button>
              <button
                onClick={() => {
                  setProfileMenuOpen(false);
                  // TODO: wire up actual logout / auth sign-out call
                  console.log("Logging out...");
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 transition text-left border-t border-slate-100"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          )}

          <button
            onClick={() => setProfileMenuOpen((open) => !open)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition cursor-pointer text-left"
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
              U
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">User Name</p>
              <p className="text-[10px] text-cyan-100 truncate">user@example.com</p>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${profileMenuOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8 space-y-6 relative z-10">
        {activeView === "dashboard" && (
          <PlaceholderView label="Dashboard" icon={LayoutDashboard} />
        )}
        {activeView === "entries" && (
          <EntryBrowser />
        )}
        {activeView === "validation" && (
          <PlaceholderView label="Logbook Validation" icon={CheckSquare} />
        )}
        {activeView === "reports" && (
          <PlaceholderView label="Reports & Exports" icon={FileBarChart} />
        )}

        {activeView === "projects" && (
          <>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black text-blue-900 tracking-tight">Project Management</h1>
                <p className="text-xs font-medium text-slate-500 mt-0.5">Manage and track project records</p>
              </div>
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-2 bg-[#0084D4] hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              >
                <Plus className="h-4 w-4" /> New Project
              </button>
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-3">
              <div className="flex gap-2 bg-slate-200/60 p-1 rounded-xl text-xs font-bold">
                {(["ALL", "ACTIVE", "ARCHIVED"] as const).map((statusTab) => (
                  <button
                    key={statusTab}
                    onClick={() => setFilter(statusTab)}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      filter === statusTab
                        ? "bg-white text-blue-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {statusTab}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[#0084D4]"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 font-medium">Loading from database...</div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="p-3.5">ID</th>
                      <th className="p-3.5">PROJECT NAME</th>
                      <th className="p-3.5">DESCRIPTION</th>
                      <th className="p-3.5">STATUS</th>
                      <th className="p-3.5 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredProjects.map((project) => (
                      <tr key={project.id} className="hover:bg-slate-50 transition">
                        <td className="p-3.5 font-bold text-slate-400">#{project.id}</td>
                        <td className="p-3.5 font-bold text-slate-800">{project.name}</td>
                        <td className="p-3.5">{project.description || "N/A"}</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            project.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}>
                            {project.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditModal(project)}
                              title="Edit Project"
                              className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-blue-600 rounded-lg transition"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleArchive(project)}
                              title={project.status === "ACTIVE" ? "Archive Project" : "Unarchive Project"}
                              className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-amber-600 rounded-lg transition"
                            >
                              {project.status === "ACTIVE" ? (
                                <Archive className="h-4 w-4" />
                              ) : (
                                <ArchiveRestore className="h-4 w-4 text-emerald-600" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl space-y-4">
                  <div className="flex justify-between items-center border-b pb-3">
                    <h3 className="font-bold text-slate-800 text-sm">
                      {editingProject ? `Edit Project (#${editingProject.id})` : "Create New Project"}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">Project Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="Enter project name..."
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full border rounded-lg p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">Description (Optional)</label>
                      <input
                        type="text"
                        placeholder="Brief description..."
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full border rounded-lg p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-slate-600 font-bold">
                          Entry Fields
                        </label>

                        <button
                          type="button"
                          onClick={handleAddEntryField}
                          className="text-[#0084D4] font-bold hover:text-blue-600"
                        >
                          + Add Field
                        </button>
                      </div>

                      {entryFields.length === 0 ? (
                        <p className="text-slate-400 text-[11px]">
                          No custom fields added yet. Add fields to define what each
                          logbook entry should contain.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {entryFields.map((field) => (
                            <div
                              key={field.id}
                              className="border border-slate-200 rounded-lg p-2 space-y-2"
                            >
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="Field name..."
                                  value={field.name}
                                  onChange={(e) =>
                                    handleUpdateEntryField(field.id, {
                                      name: e.target.value,
                                    })
                                  }
                                  className="flex-1 border rounded-lg p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
                                />

                                <select
                                  value={field.type}
                                  onChange={(e) =>
                                    handleUpdateEntryField(field.id, {
                                      type: e.target.value as EntryField["type"],
                                    })
                                  }
                                  className="border rounded-lg p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
                                >
                                  <option value="TEXT">Short Text</option>
                                  <option value="NUMBER">Number</option>
                                  <option value="DATE">Date</option>
                                  <option value="BOOLEAN">Boolean</option>
                                </select>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveEntryField(field.id)}
                                  className="px-2 text-red-500 hover:bg-red-50 rounded-lg"
                                  title="Remove field"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>

                              <label className="flex items-center gap-2 text-slate-500">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(e) =>
                                    handleUpdateEntryField(field.id, {
                                      required: e.target.checked,
                                    })
                                  }
                                />
                                Required field
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-3">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-3 py-1.5 rounded-lg border text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-[#0084D4] text-white font-bold hover:bg-blue-600"
                      >
                        {editingProject ? "Update Project" : "Save Project"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
