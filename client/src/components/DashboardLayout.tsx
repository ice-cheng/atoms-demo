import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  FolderKanban,
  LayoutTemplate,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@client/src/contexts/AuthContext';

const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard, end: true },
    { path: '/dashboard/new', label: '新建项目', icon: PlusCircle },
    { path: '/dashboard/projects', label: '我的项目', icon: FolderKanban },
    { path: '/dashboard/templates', label: '模板库', icon: LayoutTemplate },
    { path: '/dashboard/settings', label: '设置', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-[hsl(224_71%_10%)] text-white flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-white/10">
          <NavLink to="/dashboard" className="flex items-center gap-2 hover:opacity-90">
            <Sparkles className="w-6 h-6 text-violet-400" />
            <span className="font-bold text-lg">Atoms Demo</span>
          </NavLink>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-violet-600/20 text-violet-300 border-l-2 border-violet-500'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

          <div className="p-3 border-t border-white/10">
            <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-white/5 mb-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-sm font-semibold">
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user?.username}</div>
                <div className="text-xs text-slate-400 truncate">{user?.email}</div>
              </div>
            </div>
            <div className="px-3 mb-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                {user?.credits ?? 0} Credits
              </div>
            </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
