import React, { useState } from 'react';
import { Ship, Edit2, Plus, Save, X, Search } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  imo: string;
  type: string;
  status: 'Active' | 'Docked' | 'Maintenance';
  operator: string;
}

const initialProjects: Project[] = [
  { id: '1', name: 'Ocean Pioneer', imo: 'IMO 9876543', type: 'Cargo', status: 'Active', operator: 'Operator Two' },
  { id: '2', name: 'Sea Voyager', imo: 'IMO 9123456', type: 'Tanker', status: 'Docked', operator: 'Operator Two' },
];

export const ShipManagement: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Project>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', imo: '', type: 'Cargo', status: 'Active' });
  const [searchQuery, setSearchQuery] = useState('');

  const handleEditClick = (project: Project) => {
    setEditingId(project.id);
    setEditForm(project);
  };

  const handleSaveEdit = (id: string) => {
    setProjects(projects.map(p => (p.id === id ? { ...p, ...editForm } as Project : p)));
    setEditingId(null);
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name || !newProject.imo) return;

    const created: Project = {
      id: Date.now().toString(),
      ...newProject,
      status: newProject.status as Project['status'],
      operator: 'Operator Two',
    };

    setProjects([...projects, created]);
    setNewProject({ name: '', imo: '', type: 'Cargo', status: 'Active' });
    setShowAddForm(false);
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.imo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Ship & Project Management</h2>
          <p className="text-sm text-slate-500">View and update active vessels assigned to your operations.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAddForm ? 'Cancel' : 'Add Project'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddProject} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h3 className="text-lg font-semibold text-slate-800">Add New Ship Project</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Vessel Name"
              value={newProject.name}
              onChange={e => setNewProject({ ...newProject, name: e.target.value })}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              required
            />
            <input
              type="text"
              placeholder="IMO Number"
              value={newProject.imo}
              onChange={e => setNewProject({ ...newProject, imo: e.target.value })}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              required
            />
            <select
              value={newProject.type}
              onChange={e => setNewProject({ ...newProject, type: e.target.value })}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="Cargo">Cargo</option>
              <option value="Tanker">Tanker</option>
              <option value="Container">Container</option>
              <option value="Research">Research</option>
            </select>
            <select
              value={newProject.status}
              onChange={e => setNewProject({ ...newProject, status: e.target.value })}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="Active">Active</option>
              <option value="Docked">Docked</option>
              <option value="Maintenance">Maintenance</option>
            </select>
          </div>
          <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition">
            Save Project
          </button>
        </form>
      )}

      <div className="relative">
        <Search className="h-5 w-5 absolute left-3 top-2.5 text-slate-400" />
        <input
          type="text"
          placeholder="Filter vessels or IMO..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-4">Vessel Name</th>
              <th className="p-4">IMO</th>
              <th className="p-4">Type</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredProjects.map((project) => (
              <tr key={project.id} className="hover:bg-slate-50">
                {editingId === project.id ? (
                  <>
                    <td className="p-4">
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="border border-slate-300 rounded px-2 py-1 text-sm w-full"
                      />
                    </td>
                    <td className="p-4">
                      <input
                        type="text"
                        value={editForm.imo || ''}
                        onChange={e => setEditForm({ ...editForm, imo: e.target.value })}
                        className="border border-slate-300 rounded px-2 py-1 text-sm w-full"
                      />
                    </td>
                    <td className="p-4">
                      <input
                        type="text"
                        value={editForm.type || ''}
                        onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                        className="border border-slate-300 rounded px-2 py-1 text-sm w-full"
                      />
                    </td>
                    <td className="p-4">
                      <select
                        value={editForm.status}
                        onChange={e => setEditForm({ ...editForm, status: e.target.value as Project['status'] })}
                        className="border border-slate-300 rounded px-2 py-1 text-sm"
                      >
                        <option value="Active">Active</option>
                        <option value="Docked">Docked</option>
                        <option value="Maintenance">Maintenance</option>
                      </select>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button onClick={() => handleSaveEdit(project.id)} className="text-emerald-600 hover:text-emerald-800">
                        <Save className="h-5 w-5 inline" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                        <X className="h-5 w-5 inline" />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-4 font-medium text-slate-800 flex items-center gap-2">
                      <Ship className="h-4 w-4 text-slate-400" />
                      {project.name}
                    </td>
                    <td className="p-4 text-slate-500">{project.imo}</td>
                    <td className="p-4">{project.type}</td>
                    <td className="p-4">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                        project.status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                        project.status === 'Docked' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleEditClick(project)}
                        className="text-slate-400 hover:text-indigo-600 p-1 transition"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
