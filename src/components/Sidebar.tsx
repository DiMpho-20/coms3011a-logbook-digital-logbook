import React from 'react';
import { 
  LayoutDashboard, 
  Ship, 
  PenTool, 
  Search, 
  CheckSquare, 
  BarChart3, 
  LogOut, 
  UserCheck 
} from 'lucide-react';
import { AuthUser } from './Auth';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: AuthUser;
  onLogout: () => void;
  onSwitchRole: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  onSwitchRole,
}) => {
  const isOperator = currentUser.role === 'operator';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects', label: 'Ship Management', icon: Ship },
    { id: 'logbook-input', label: 'Logbook Entry', icon: PenTool },
    { id: 'entries', label: 'Browse Entries', icon: Search },
    ...(!isOperator ? [{ id: 'validation', label: 'Validation', icon: CheckSquare }] : []),
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 fixed h-full flex flex-col justify-between">
      <div>
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Ship className="h-6 w-6 text-indigo-400" />
            Nautical Log
          </h1>
          <p className="text-xs text-slate-400 mt-1">Operator Portal</p>
        </div>

        <nav className="p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800 space-y-3">
        <div className="bg-slate-800/50 p-3 rounded-lg">
          <p className="text-xs font-semibold text-slate-200">{currentUser.name}</p>
          <p className="text-xs text-slate-400 capitalize">Role: {currentUser.role}</p>
        </div>

        <button
          onClick={onSwitchRole}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
        >
          <UserCheck className="h-4 w-4" />
          Switch Role (Dev Mode)
        </button>

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-slate-800 rounded transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </button>
      </div>
    </aside>
  );
};
