import React, { useState } from "react";
import { FolderKanban, LayoutDashboard } from "lucide-react";
import Projects from "./pages/Projects";

export default function App() {
  const [activePage, setActivePage] = useState<"dashboard" | "projects">("projects");

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden text-slate-800">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#0084D4] text-white flex flex-col justify-between p-4 shrink-0 shadow-lg relative z-20">
        <div>
          <div className="flex items-center gap-3 px-2 py-3 mb-4 border-b border-white/20">
            <div className="p-2 bg-white/10 rounded-xl">
              <FolderKanban className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-base leading-tight">Digital Logbook</h1>
              <p className="text-[11px] text-cyan-100 font-medium">System Portal</p>
            </div>
          </div>
          <nav className="space-y-1">
            <button 
              onClick={() => setActivePage("dashboard")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                activePage === "dashboard" ? "bg-white/20 text-white shadow-sm" : "hover:bg-white/10 text-cyan-100"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </button>
            <button 
              onClick={() => setActivePage("projects")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                activePage === "projects" ? "bg-white/20 text-white shadow-sm" : "hover:bg-white/10 text-cyan-100"
              }`}
            >
              <FolderKanban className="h-4 w-4" /> Project Management
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Page Area */}
      <main className="flex-1 overflow-y-auto p-8 relative z-10">
        {activePage === "dashboard" && (
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-blue-900 tracking-tight">Dashboard</h1>
            <p className="text-xs font-medium text-slate-500">Welcome to the application dashboard.</p>
          </div>
        )}

        {activePage === "projects" && <Projects />}
      </main>
    </div>
  );
}
