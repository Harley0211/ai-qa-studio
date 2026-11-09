import { FlaskConical, FolderKanban, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { IconButton } from '../ui/Button.jsx';
import { BackendStatus } from './BackendStatus.jsx';

function Brand() {
  return (
    <div className="flex items-center gap-2 font-semibold text-slate-900">
      <FlaskConical className="h-5 w-5 text-indigo-600" aria-hidden="true" />
      <span>AI QA Studio</span>
    </div>
  );
}

const navItems = [{ to: '/projects', label: 'Projects', icon: FolderKanban }];

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
        <IconButton icon={Menu} label="Open navigation" onClick={() => setOpen(true)} />
        <Brand />
      </header>

      {open && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        aria-label="Primary"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Brand />
          <IconButton icon={X} label="Close navigation" className="lg:hidden" onClick={() => setOpen(false)} />
        </div>
        <nav className="flex-1 space-y-1 px-2 py-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-slate-200 px-4 py-3">
          <BackendStatus />
          <p className="text-xs text-slate-400">Local mode · single user</p>
        </div>
      </aside>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
