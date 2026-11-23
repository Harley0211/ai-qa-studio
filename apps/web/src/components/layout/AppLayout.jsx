import { ChevronDown, FileText, FlaskConical, FolderKanban, Image, Menu, Sparkles, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { AccountMenu } from '../../features/auth/AccountMenu.jsx';
import { useCurrentUser } from '../../features/auth/auth.hooks.js';
import { IMAGE_TOOL_PATH, PRD_TOOL_PATH, imageToolHref, prdToolHref } from '../../features/tools/paths.js';
import { SEASONS, useSeason } from '../../lib/season.js';
import { useTheme } from '../../lib/theme.js';
import { IconButton } from '../ui/Button.jsx';
import { BackendStatus } from './BackendStatus.jsx';
import { Clock } from './Clock.jsx';
import { LiveBackground } from './LiveBackground.jsx';
import { SeasonControls } from './SeasonControls.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

function Brand({ season }) {
  return (
    <div className="flex items-center gap-2 font-semibold text-slate-900">
      <span className="live-brand-icon flex h-8 w-8 items-center justify-center rounded-lg">
        <FlaskConical className="h-5 w-5 text-white" aria-hidden="true" />
      </span>
      <span className="live-brand-text">AI QA Studio</span>
      {season && (
        <span className="live-season-badge" title={`${SEASONS[season].label} theme`} aria-hidden="true">
          {SEASONS[season].emoji}
        </span>
      )}
    </div>
  );
}

const navItems = [{ to: '/projects', label: 'Projects', icon: FolderKanban }];

const navLinkClass = ({ isActive }) =>
  `live-nav-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
    isActive ? 'live-nav-active text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
  }`;

function ToolsNav({ pathname }) {
  const [expanded, setExpanded] = useState(true);
  // Inside a project, open the tool for that project.
  const projectId = matchPath('/projects/:projectId/*', pathname)?.params.projectId;
  const imageToolTo = projectId ? imageToolHref(projectId) : IMAGE_TOOL_PATH;
  const prdToolTo = projectId ? prdToolHref(projectId) : PRD_TOOL_PATH;

  return (
    <div className="pt-3">
      <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Tools</p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="tools-nav"
        onClick={() => setExpanded((value) => !value)}
        className="live-nav-link flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span className="flex-1 text-left">Generate test cases</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div id="tools-nav" className="mt-1 space-y-1 pl-4">
          <NavLink to={imageToolTo} className={navLinkClass}>
            <Image className="h-4 w-4" aria-hidden="true" />
            From image evidence
          </NavLink>
          <NavLink to={prdToolTo} className={navLinkClass}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            From PRD / document
          </NavLink>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const seasonState = useSeason();
  const user = useCurrentUser();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="live-app min-h-screen text-slate-900">
      <LiveBackground season={seasonState.season} motion={seasonState.motion} />

      <header className="live-glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 px-4 lg:hidden">
        <IconButton icon={Menu} label="Open navigation" onClick={() => setOpen(true)} />
        <Brand />
        <div className="ml-auto flex items-center gap-2">
          <Clock compact />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      {open && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        aria-label="Primary"
        className={`live-sidebar fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative flex h-16 items-center justify-between px-4">
          <Brand season={seasonState.season} />
          <IconButton icon={X} label="Close navigation" className="lg:hidden" onClick={() => setOpen(false)} />
        </div>
        <div className="relative px-3 pb-2">
          <Clock />
        </div>
        <nav className="relative flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <ToolsNav pathname={pathname} />
          {user?.role === 'ADMIN' && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Admin</p>
              <NavLink to="/users" className={navLinkClass}>
                <Users className="h-4 w-4" aria-hidden="true" />
                Users
              </NavLink>
            </div>
          )}
        </nav>
        <div className="relative space-y-3 border-t border-slate-200 px-4 py-3">
          <SeasonControls {...seasonState} />
          <AccountMenu />
          <div className="flex items-center justify-between gap-2">
            <BackendStatus />
            {/* The mobile header has its own toggle. */}
            <div className="hidden lg:block">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
        </div>
      </aside>

      <main className="relative z-10 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
