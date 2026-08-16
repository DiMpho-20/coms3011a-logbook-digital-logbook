import React, { useState } from 'react';
import { 
  Plus, Search, Edit2, Archive, Anchor, Folder, 
  LayoutDashboard, FolderKanban, ListFilter, ShieldCheck, 
  BarChart3, LogOut, ArrowLeftRight, UserCheck 
} from 'lucide-react';

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
    owner: 'CV. Bahari Sejahtera',
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
    owner: 'Koperasi Nelayan',
    captain: 'Slamet Riadi',
    homePort: 'Tanjung Priok',
    status: 'ACTIVE',
    entries: 31,
  },
];

export default function App() {
  const [projects, setProjects] = useState<VesselProject[]>(initialProjects);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const handleNewProject = () => {
    const nextId = (projects.length + 1).toString();
    const newProj: VesselProject = {
      id: nextId,
      code: `proj-00${nextId}`,
      name: `Vessel Project ${nextId}`,
      gt: 20,
      owner: 'CV. Sample Fishing',
      captain: 'Captain New',
      homePort: 'Muara Baru',
      status: 'ACTIVE',
      entries: 0,
    };
    setProjects([...projects, newProj]);
  };

  const handleEdit = (name: string) => {
    alert(`Editing ${name}`);
  };

  const handleArchive = (id: string) => {
    setProjects(projects.map(p => p.id === id ? { ...p, status: p.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' } : p));
  };

  const filteredProjects = projects.filter((p) => {
    const matchesFilter = filter === 'ALL' || p.status === filter;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.captain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.owner.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0084D4] text-white flex flex-col justify-between p-4 shrink-0 shadow-lg relative z-20">
        <div>
          <div className="flex items-center gap-3 px-2 py-3 mb-4 border-b border-white/20">
            <div className="p-2 bg-white/10 rounded-xl">
              <Anchor className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-base leading-tight">Digital Logbook</h1>
              <p className="text-[11px] text-cyan-100 font-medium">Fish Catch Info System</p>
            </div>
          </div>

          <div className="flex items-center justify-between bg-black/15 p-2.5 rounded-xl mb-6 text-xs">
            <span className="bg-amber-400 text-slate-900 font-bold px-2 py-0.5 rounded-md text-[10px]">
              DKP Admin
            </span>
            <button 
              onClick={() => alert('Switching role...')} 
              className="flex items-center gap-1 text-[11px] text-cyan-100 hover:text-white transition cursor-pointer z-10"
            >
              <ArrowLeftRight className="h-3 w-3" /> switch
            </button>
          </div>

          <nav className="space-y-1">
            <p className="px-3 text-[10px] font-bold tracking-wider text-cyan-200 uppercase mb-2">Navigation</p>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-cyan-50 hover:bg-white/10 transition cursor-pointer text-left">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold bg-white/20 text-white shadow-sm cursor-pointer text-left">
              <FolderKanban className="h-4 w-4" /> Project Management
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-cyan-50 hover:bg-white/10 transition cursor-pointer text-left">
              <ListFilter className="h-4 w-4" /> Entry Browser
            </button>
            <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-cyan-50 hover:bg-white/10 transition cursor-pointer text-left">
              <span className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4" /> Logbook Validation
              </span>
              <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">3</span>
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-cyan-50 hover:bg-white/10 transition cursor-pointer text-left">
              <BarChart3 className="h-4 w-4" /> Reports & Export
            </button>
          </nav>
        </div>

        <div className="border-t border-white/20 pt-4 space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-white/20 rounded-full">
              <UserCheck className="h-4 w-4 text-white" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold truncate">DKP Admin</p>
              <p className="text-[10px] text-cyan-100 truncate">admin@dkp.gov</p>
            </div>
          </div>
          <button 
            onClick={() => alert('Signing out...')} 
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-cyan-100 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 overflow-y-auto p-8 space-y-6 relative z-10">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-blue-900 tracking-tight">Project Management</h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Manage registered fishing vessel projects — active and archived
            </p>
          </div>
          <button 
            onClick={handleNewProject}
            className="flex items-center gap-2 bg-[#0084D4] hover:bg-blue-600 active:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer z-10"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 border-l-4 border-l-cyan-500 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-cyan-50 rounded-xl text-cyan-600">
              <Folder className="h-5 w-5" />
            </div>
            <div>
              <span className="text-2xl font-black text-slate-800">{projects.length}</span>
              <p className="text-[11px] font-bold text-slate-400">Total Projects</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 border-l-4 border-l-emerald-500 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <Anchor className="h-5 w-5" />
            </div>
            <div>
              <span className="text-2xl font-black text-slate-800">{projects.filter(p => p.status === 'ACTIVE').length}</span>
              <p className="text-[11px] font-bold text-slate-400">Active</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 border-l-4 border-l-slate-400 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-slate-100 rounded-xl text-slate-500">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <span className="text-2xl font-black text-slate-800">{projects.filter(p => p.status === 'ARCHIVED').length}</span>
              <p className="text-[11px] font-bold text-slate-400">Archived</p>
            </div>
          </div>
        </div>

        {/* Search & Tabs */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by project name, captain or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-cyan-500 text-slate-700 placeholder-slate-400"
            />
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(['ALL', 'ACTIVE', 'ARCHIVED'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer z-10 ${
                  filter === tab ? 'bg-[#0084D4] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-700">
            <Anchor className="h-4 w-4 text-slate-400 pointer-events-none" />
            Registered Vessel Projects
          </div>

          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-3.5">PROJECT</th>
                <th className="p-3.5">GT</th>
                <th className="p-3.5">OWNER</th>
                <th className="p-3.5">CAPTAIN</th>
                <th className="p-3.5">HOME PORT</th>
                <th className="p-3.5">STATUS</th>
                <th className="p-3.5">ENTRIES</th>
                <th className="p-3.5 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredProjects.map((project) => (
                <tr key={project.id} className="hover:bg-slate-50 transition">
                  <td className="p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-cyan-50 rounded-lg text-cyan-600">
                        <Anchor className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-xs">{project.name}</p>
                        <p className="text-slate-400 text-[10px]">{project.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 font-semibold text-slate-700">{project.gt} GT</td>
                  <td className="p-3.5 text-slate-600">{project.owner}</td>
                  <td className="p-3.5 text-slate-700 font-semibold">{project.captain}</td>
                  <td className="p-3.5 text-slate-500">📍 {project.homePort}</td>
                  <td className="p-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      project.status === 'ACTIVE' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="p-3.5 font-bold text-slate-700">{project.entries} <span className="font-normal text-slate-400">entries</span></td>
                  <td className="p-3.5 text-right space-x-1">
                    <button 
                      onClick={() => handleEdit(project.name)}
                      className="p-1.5 text-cyan-600 hover:bg-cyan-50 rounded-lg transition cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button 
                      onClick={() => handleArchive(project.id)}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
