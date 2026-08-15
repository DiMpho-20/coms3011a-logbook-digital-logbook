import React, { useState, useEffect } from "react";
import axios from "axios";
import { FolderPlus, Archive, CheckCircle, Plus, Search, Layers, AlertCircle } from "lucide-react";

interface Project {
  id: string;
  name: string;
  description?: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
}

export const DigitalLogBookProjects: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ACTIVE");
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchProjects = async () => {
    try {
      const response = await axios.get("/api/projects");
      setProjects(response.data);
    } catch (err) {
      console.error("Failed to load projects", err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setLoading(true);
    try {
      await axios.post("/api/projects", { name, description });
      setName("");
      setDescription("");
      setIsModalOpen(false);
      setError("");
      fetchProjects();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create project");
    } font-sans flex-col;
    finally {
      setLoading(false);
    }
  };

  const handleToggleArchive = async (id: string, currentStatus: "ACTIVE" | "ARCHIVED") => {
    const nextStatus = currentStatus === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    try {
      await axios.patch(`/api/projects/${id}/status`, { status: nextStatus });
      fetchProjects();
    } catch (err) {
      console.error("Failed to update project status", err);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesFilter = filter === "ALL" || p.status === filter;
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200">
              DigitalLogBook
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Manage your project workspaces, track entries, and manage archiving.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
          >
            <Plus size={18} />
            New Project
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/5 backdrop-blur-md p-4 rounded-2xl border border-white/10">
          <div className="relative w-full sm:w-72">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900/60 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-white/10 w-full sm:w-auto">
            {(["ACTIVE", "ARCHIVED", "ALL"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all ${
                  filter === tab
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className={`group relative bg-slate-900/40 backdrop-blur-md border rounded-2xl p-6 transition-all hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 flex flex-col justify-between ${
                project.status === "ARCHIVED" ? "border-white/5 opacity-70" : "border-white/10"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-105 transition-transform">
                    <Layers size={22} />
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full uppercase border ${
                      project.status === "ACTIVE"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {project.status === "ACTIVE" ? <CheckCircle size={10} /> : <Archive size={10} />}
                    {project.status}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-white mt-4 group-hover:text-indigo-200 transition-colors">
                  {project.name}
                </h3>
                <p className="text-slate-400 text-sm mt-2 line-clamp-3 leading-relaxed">
                  {project.description || "No description provided."}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
                <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
                <button
                  onClick={() => handleToggleArchive(project.id, project.status)}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors p-1"
                >
                  <Archive size={14} />
                  {project.status === "ACTIVE" ? "Archive" : "Restore"}
                </button>
              </div>
            </div>
          ))}

          {filteredProjects.length === 0 && (
            <div className="col-span-full text-center py-16 bg-white/5 rounded-2xl border border-white/10 border-dashed">
              <FolderPlus size={40} className="mx-auto text-slate-500 mb-3" />
              <p className="text-slate-300 font-medium">No projects found</p>
              <p className="text-slate-500 text-sm mt-1">Create your first project to begin logging entries.</p>
            </div>
          )}
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-white/15 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Create New Project</h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ?
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. COMS3011A Digital Logbook"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief details about your project goals..."
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-semibold shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? "Creating..." : "Create Project"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DigitalLogBookProjects;
