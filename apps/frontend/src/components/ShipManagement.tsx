import React, { useState } from 'react';
import { Plus, Search, Edit2, Archive, Anchor, Folder } from 'lucide-react';

interface VesselProject {
  id: string;
  code: string;
  name: string;
  gt: number;
  owner: string;
  captain: string;
  homePort: string;
  status: 'ACTIVE' | 'ARCHIVED';
  entries: number;
}

const initialProjects: VesselProject[] = [
  {
    id: '1',
    code: 'proj-001',
    name: 'Bahari Jaya I',
    gt: 25,
    owner: 'CV. Bahari Seja...',
    captain: 'Budi Santoso',
    homePort: 'Muara Baru',
    status: 'ACTIVE',
    entries: 24,
  },
  {
    id: '2',
    code: 'proj-002',
    name: 'Nelayan Maju',
    gt: 18,
    owner: 'Koperasi Nelay...',
    captain: 'Slamet Riadi',
    homePort: 'Tanjung Priok',
    status: 'ACTIVE',
    entries: 31,
  },
];

export const ShipManagement: React.FC = () => {
  const [projects] = useState<VesselProject[]>(initialProjects);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length;
  const archivedProjects = projects.filter((p) => p.status === 'ARCHIVED').length;

  const filteredProjects = projects.filter((p) => {
    const matchesFilter = filter === 'ALL' || p.status === filter;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.captain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.owner.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-8 bg-slate-50 min-h-screen space-y-6 text-slate-800">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-700 tracking-tight">Project Management</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Manage registered fishing vessel projects — active and archived
          </p>
        </div>
        <button className="flex items-center gap-2 bg-[#0084D4] hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm">
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 border-l-4 border-l-cyan-500 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-cyan-50 rounded-xl text-cyan-600">
            <Folder className="h-6 w-6" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-slate-800">{totalProjects}</span>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Projects</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 border-l-4 border-l-emerald-500 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Anchor className="h-6 w-6" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-slate-800">{activeProjects}</span>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 border-l-4 border-l-slate-400 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-slate-100 rounded-xl text-slate-500">
            <Archive className="h-6 w-6" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-slate-800">{archivedProjects}</span>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Archived</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by project name, captain or owner..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 placeholder-slate-400"
          />
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          {(['ALL', 'ACTIVE', 'ARCHIVED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-lg transition ${
                filter === tab ? 'bg-[#0084D4] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2 font-bold text-slate-700">
          <Anchor className="h-5 w-5 text-slate-400" />
          Registered Vessel Projects
        </div>

        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
            <tr>
              <th className="p-4">Project</th>
              <th className="p-4">GT</th>
              <th className="p-4">Owner</th>
              <th className="p-4">Captain</th>
              <th className="p-4">Home Port</th>
              <th className="p-4">Status</th>
              <th className="p-4">Entries</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {filteredProjects.map((project) => (
              <tr key={project.id} className="hover:bg-slate-50/80 transition">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-50 rounded-lg text-cyan-600">
                      <Anchor className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{project.name}</p>
                      <p className="text-slate-400 text-[11px]">{project.code}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-semibold text-slate-700">{project.gt} GT</td>
                <td className="p-4 text-slate-600">{project.owner}</td>
                <td className="p-4 text-slate-700 font-semibold">{project.captain}</td>
                <td className="p-4 text-slate-500">?? {project.homePort}</td>
                <td className="p-4">
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">
                    {project.status}
                  </span>
                </td>
                <td className="p-4 font-bold text-slate-700">{project.entries} <span className="font-normal text-slate-400">entries</span></td>
                <td className="p-4 text-right space-x-2">
                  <button className="p-1.5 text-cyan-600 hover:bg-cyan-50 rounded-md transition">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md transition">
                    <Archive className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
