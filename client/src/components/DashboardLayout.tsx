import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  FolderKanban,
  LayoutTemplate,
  Settings,
  LogOut,
  Sparkles,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@client/src/contexts/AuthContext';
import ErrorBoundary from './ErrorBoundary';

const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const closeMobileNav = (): void => setMobileNavOpen(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[hsl(224_71%_10%)] text-white flex items-center justify-between px-4 border-b border-white/10">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
          aria-label="打开菜单"
        >
          <Menu className="w-5 h-5" />
        </button>
        <NavLink to="/dashboard" className="flex items-center gap-2 font-bold">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <span>Atoms Demo</span>
        </NavLink>
        <div className="w-10" />
      </div>

      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={closeMobileNav}
          aria-hidden
        />
      )}

      <aside className={`
        fixed md:relative z-50 md:z-auto
        w-64 bg-[hsl(224_71%_10%)] text-white flex flex-col flex-shrink-0
        h-full top-0 left-0
        transform transition-transform duration-300 ease-out
        ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Mobile close button */}
        <div className="md:hidden absolute top-0 right-0 p-3">
          <button
            onClick={closeMobileNav}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
            aria-label="关闭菜单"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 border-b border-white/10">
          <NavLink to="/dashboard" className="flex items-center gap-2 hover:opacity-90">
            <Sparkles className="w-6 h-6 text-violet-400" />
            <span className="font-bold text-lg">Atoms Demo</span>
          </NavLink>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
             className={({ isActive }) =>
                 `flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors ${
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

      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default DashboardLayout;
