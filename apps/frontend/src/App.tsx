import React, { useState, useEffect } from "react";
import { 
  Plus, Search, FolderKanban, LayoutDashboard, X 
} from "lucide-react";
import { fetchProjects, createProject, type Project } from "./api";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assignedTo: "",
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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    const nextCode = `PRJ-${(projects.length + 1).toString().padStart(3, "0")}`;
    const newProj = {
      code: nextCode,
      title: formData.title,
      description: formData.description || "N/A",
      assignedTo: formData.assignedTo || "Unassigned",
      status: "ACTIVE" as const,
      entriesCount: 0,
    };

    try {
      await createProject(newProj);
      await loadProjects();
      setIsModalOpen(false);
      setFormData({ title: "", description: "", assignedTo: "" });
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  // Replace lines 60-67 in App.tsx with this safe filter:
const filteredProjects = projects.filter((p) => {
  const matchesFilter = filter === "ALL" || p.status === filter;
  const matchesSearch =
    (p.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.code || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.assignedTo || "").toLowerCase().includes(searchQuery.toLowerCase());
  return matchesFilter && matchesSearch;
});

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden text-slate-800">
      {/* Sidebar */}
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 space-y-6 relative z-10">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-blue-900 tracking-tight">Project Management</h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Manage and track project records</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-[#0084D4] hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        </div>

        {/* Search & Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
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

        {/* Projects Table */}
        {loading ? (
          <div className="p-8 text-center text-slate-500 font-medium">Loading from database...</div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                <tr>
                  <th className="p-3.5">CODE</th>
                  <th className="p-3.5">PROJECT TITLE</th>
                  <th className="p-3.5">DESCRIPTION</th>
                  <th className="p-3.5">ASSIGNED TO</th>
                  <th className="p-3.5">ENTRIES</th>
                  <th className="p-3.5">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-slate-50 transition">
                    <td className="p-3.5 font-bold text-slate-400">{project.code}</td>
                    <td className="p-3.5 font-bold text-slate-800">{project.title}</td>
                    <td className="p-3.5">{project.description}</td>
                    <td className="p-3.5">{project.assignedTo}</td>
                    <td className="p-3.5">{project.entriesCount ?? 0}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                        {project.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="font-bold text-slate-800 text-sm">Create New Project</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Project Title *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Enter project name..."
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full border rounded-lg p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Description</label>
                  <input 
                    type="text" 
                    placeholder="Brief description..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border rounded-lg p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#0084D4]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Assigned Person/Role</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Person 3 / Field Lead"
                    value={formData.assignedTo}
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
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
                    Save Project
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
