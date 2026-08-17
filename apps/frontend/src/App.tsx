import React, { useState, useEffect } from "react";
import { 
  Plus, Search, FolderKanban, Edit2, Archive, ArchiveRestore, X 
} from "lucide-react";
import { fetchProjects, createProject, updateProject, type Project } from "./api";

export default function App() {
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
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name || "",
      description: project.description || "",
    });
    setIsModalOpen(true);
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
    if (!formData.name) return;

    try {
      if (editingProject) {
        await updateProject(editingProject.id, {
          name: formData.name,
          description: formData.description,
        });
      } else {
        await createProject({
          name: formData.name,
          description: formData.description || "",
          status: "ACTIVE",
        });
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
              <p className="text-[11px] text-cyan-100 font-medium">Project System</p>
            </div>
          </div>
          <nav className="space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold bg-white/20 text-white shadow-sm cursor-pointer text-left">
              <FolderKanban className="h-4 w-4" /> Project Management
            </button>
          </nav>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8 space-y-6 relative z-10">
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
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
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
      </main>
    </div>
  );
}
