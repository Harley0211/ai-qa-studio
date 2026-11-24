import {
  ArrowLeftRight,
  Bug,
  ChevronDown,
  FileJson,
  FileText,
  FlaskConical,
  FolderKanban,
  Image,
  Lock,
  Mail,
  Menu,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { AccountMenu } from '../../features/auth/AccountMenu.jsx';
import { useCurrentUser } from '../../features/auth/auth.hooks.js';
import { BackgroundActivity } from '../../features/bug-report/BackgroundActivity.jsx';
import { useProject } from '../../features/projects/hooks.js';
import {
  PROJECTS_PATH,
  bugReportsHref,
  harReaderHref,
  imageToolHref,
  prdToolHref,
  projectHref,
} from '../../features/tools/paths.js';
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

const navLinkClass = ({ isActive }) =>
  `live-nav-link flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
    isActive ? 'live-nav-active text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
  }`;

const TOOLS = [
  { key: 'image', label: 'From image evidence', icon: Image, href: imageToolHref, group: 'generate' },
  { key: 'prd', label: 'From PRD / document', icon: FileText, href: prdToolHref, group: 'generate' },
  { key: 'bug', label: 'Bug report', icon: Bug, href: bugReportsHref, group: 'qa' },
  { key: 'har', label: 'HAR reader', icon: FileJson, href: harReaderHref, group: 'qa' },
];

const SectionLabel = ({ children }) => (
  <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{children}</p>
);

// The project you're working in, with a way back to the project picker.
function CurrentProject({ projectId }) {
  const { data: project, isError } = useProject(projectId);
  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-white/60 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Project</p>
      <NavLink
        to={projectHref(projectId)}
        end
        className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-700"
        title={project?.name}
      >
        {project?.name ?? (isError ? 'Unavailable' : 'Loading…')}
      </NavLink>
      <NavLink to={PROJECTS_PATH} end className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
        <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
        Switch project
      </NavLink>
    </div>
  );
}

// Inside a project: its tools, each opening for this project only.
function ProjectTools({ projectId }) {
  const [expanded, setExpanded] = useState(true);
  const link = (tool) => (
    <NavLink key={tool.key} to={tool.href(projectId)} className={navLinkClass}>
      <tool.icon className="h-4 w-4" aria-hidden="true" />
      {tool.label}
    </NavLink>
  );

  return (
    <>
      <div className="pt-3">
        <SectionLabel>Tools</SectionLabel>
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
            {TOOLS.filter((tool) => tool.group === 'generate').map(link)}
          </div>
        )}
      </div>
      <div className="pt-3">
        <SectionLabel>QA tools</SectionLabel>
        {TOOLS.filter((tool) => tool.group === 'qa').map(link)}
      </div>
    </>
  );
}

// Outside a project the tools can't be used: shown greyed out with a hint.
function LockedTools() {
  return (
    <div className="pt-3" aria-label="Tools (choose a project first)" role="group">
      <SectionLabel>Tools</SectionLabel>
      <p className="mx-3 mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Choose a project to use the tools.
      </p>
      {TOOLS.map((tool) => (
        <span
          key={tool.key}
          aria-disabled="true"
          title="Choose a project first"
          className="flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-400"
        >
          <tool.icon className="h-4 w-4" aria-hidden="true" />
          {tool.label}
        </span>
      ))}
    </div>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const seasonState = useSeason();
  const user = useCurrentUser();
  // The project you're in (none on the project picker or the Users page).
  const projectId = matchPath(`${PROJECTS_PATH}/:projectId/*`, pathname)?.params.projectId;
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
          {projectId ? (
            <>
              <CurrentProject projectId={projectId} />
              <ProjectTools projectId={projectId} />
            </>
          ) : (
            <>
              <NavLink to={PROJECTS_PATH} className={navLinkClass}>
                <FolderKanban className="h-4 w-4" aria-hidden="true" />
                Projects
              </NavLink>
              <LockedTools />
            </>
          )}
          {user?.role === 'ADMIN' && (
            <div className="pt-3">
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Admin</p>
              <NavLink to="/users" className={navLinkClass}>
                <Users className="h-4 w-4" aria-hidden="true" />
                Users
              </NavLink>
              <NavLink to="/emails" className={navLinkClass}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Emails
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

      <BackgroundActivity />

      <main className="relative z-10 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
