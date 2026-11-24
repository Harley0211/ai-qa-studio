import { MoreHorizontal, Search, UserPlus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { Badge, Switch } from "../../components/ui/Switch.jsx";
import { useEmailToast } from "../emails/emailOutcome.js";
import { useProjects } from "../projects/hooks.js";
import { TextField } from "../../components/ui/TextField.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import NotFoundPage from "../../app/NotFoundPage.jsx";
import { FilterChips } from "../projects/ProjectsPage.jsx";
import { Avatar } from "./AccountMenu.jsx";
import {
  ROLE_LABELS,
  useCreateUser,
  useCurrentUser,
  useDeleteUser,
  useResendInvitation,
  useUpdateUser,
  useUsers,
} from "./auth.hooks.js";
import { formErrors } from "./AuthGate.jsx";

export const userHref = (id) => `/users/${encodeURIComponent(id)}`;

const STATUS = {
  ACTIVE: { label: "Active", tone: "success" },
  INVITED: { label: "Invited", tone: "warning" },
  DISABLED: { label: "Disabled", tone: "neutral" },
};

export function RoleBadge({ role }) {
  return <Badge tone={role === "ADMIN" ? "accent" : "neutral"}>{ROLE_LABELS[role] ?? role}</Badge>;
}

// Admin or Tester, as two buttons side by side.
export function RolePicker({ value, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label="Role" className="flex gap-2">
      {["ADMIN", "MEMBER"].map((role) => (
        <button
          key={role}
          type="button"
          role="radio"
          aria-checked={value === role}
          disabled={disabled}
          onClick={() => onChange(role)}
          className={`rounded-lg border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
            value === role
              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
              : "border-slate-300 text-slate-600 hover:bg-slate-100"
          }`}
        >
          {ROLE_LABELS[role]}
        </button>
      ))}
    </div>
  );
}

function FormAlert({ message }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}

// Add someone: they get an invitation email with a link to choose their own
// password. A tester's projects can be chosen here, so the invitation lists them.
function AddUserModal({ onClose }) {
  const create = useCreateUser();
  const projects = useProjects("");
  const emailToast = useEmailToast();
  const [values, setValues] = useState({ name: "", email: "", role: "MEMBER", projectIds: new Set() });
  const { fields, message } = formErrors(create.error);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));
  const toggleProject = (id, on) =>
    setValues((v) => {
      const next = new Set(v.projectIds);
      if (on) next.add(id);
      else next.delete(id);
      return { ...v, projectIds: next };
    });

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      const { data: user, emails } = await create.mutateAsync({
        name: values.name.trim(),
        email: values.email.trim(),
        role: values.role,
        ...(values.role === "MEMBER" ? { projectIds: [...values.projectIds] } : {}),
      });
      onClose();
      emailToast(`Invited ${user.name}.`, emails);
    } catch {
      /* Shown in the form. */
    }
  }

  const projectItems = projects.data?.items ?? [];

  return (
    <Modal title="Add user" onClose={create.isPending ? () => {} : onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={message} />
        <TextField label="Name" value={values.name} onChange={set("name")} error={fields.name} />
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          value={values.email}
          onChange={set("email")}
          error={fields.email}
          hint="They get an invitation email with a link to choose their own password (valid 7 days)."
        />
        <div>
          <p className="mb-1 block text-sm font-medium text-slate-700">Role</p>
          <RolePicker value={values.role} onChange={(role) => setValues((v) => ({ ...v, role }))} disabled={create.isPending} />
          <p className="mt-1 text-xs text-slate-500">
            Admins open every project and manage users. Testers only open the projects you assign.
          </p>
        </div>
        {values.role === "MEMBER" && projectItems.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Projects they can open</legend>
            <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {projectItems.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate text-sm text-slate-800">{project.name}</span>
                  <Switch
                    checked={values.projectIds.has(project.id)}
                    onChange={(on) => toggleProject(project.id, on)}
                    label={`Access to ${project.name}`}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500">You can change this later. The invitation lists these projects.</p>
          </fieldset>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" loading={create.isPending}>Send invitation</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ResetPasswordModal({ user, onClose }) {
  const update = useUpdateUser();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const { fields, message } = formErrors(update.error);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await update.mutateAsync({ id: user.id, password });
      toast.success(`New password set for ${user.name}. They were signed out.`);
      onClose();
    } catch {
      /* Shown in the form. */
    }
  }

  return (
    <Modal title={`Reset password for ${user.name}`} onClose={update.isPending ? () => {} : onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={message} />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fields.password}
          hint="They will be signed out everywhere and must use this password next time."
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button type="submit" loading={update.isPending}>Set password</Button>
        </div>
      </form>
    </Modal>
  );
}

const MENU_WIDTH = 192;
const MENU_HEIGHT = 200;

// Where the floating menu goes: under the button, right-aligned with it, or
// above it when there is no room below.
function menuPosition(button) {
  const rect = button.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
  const below = rect.bottom + 4;
  const top = below + MENU_HEIGHT > window.innerHeight ? Math.max(8, rect.top - MENU_HEIGHT - 4) : below;
  return { top, left };
}

// "…" menu on a row: every action for one user. It floats above the page
// (rendered in <body>), so the table's scroll box never cuts it off.
function RowMenu({ user, onAction }) {
  const [position, setPosition] = useState(null);
  const open = position !== null;
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const close = () => setPosition(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    // The menu stays put while the page moves, so close it instead.
    const onMove = () => close();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const item = (action, label, danger = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        close();
        onAction(action, user);
      }}
      className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none ${
        danger ? "text-red-600" : "text-slate-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`More actions for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setPosition(menuPosition(buttonRef.current)))}
        className={`rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 ${open ? "bg-slate-100" : ""}`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions for ${user.name}`}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-50 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
          >
            {item("assign", "Assign projects")}
            {user.status === "INVITED" && user.active !== false && item("resend", "Resend invitation")}
            {item("reset", "Reset password")}
            {item("role", user.role === "ADMIN" ? "Change role to Tester" : "Change role to Admin")}
            {item(user.active !== false ? "disable" : "enable", user.active !== false ? "Disable" : "Enable")}
            {item("remove", "Remove user", true)}
          </div>,
          document.body,
        )}
    </>
  );
}

const linkAction = "text-sm font-semibold text-indigo-600 hover:underline";

export default function UsersPage() {
  const me = useCurrentUser();
  const { data, isPending, isError, error, refetch } = useUsers();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const resend = useResendInvitation();
  const toast = useToast();
  const emailToast = useEmailToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [disabling, setDisabling] = useState(null);

  if (me?.role !== "ADMIN") return <NotFoundPage />;

  const users = data?.items ?? [];
  const projectTotal = data?.projectTotal ?? 0;
  const counts = {
    all: users.length,
    admins: users.filter((u) => u.role === "ADMIN").length,
    testers: users.filter((u) => u.role === "MEMBER").length,
    disabled: users.filter((u) => u.active === false).length,
  };
  const term = search.trim().toLowerCase();
  const shown = users.filter(
    (u) =>
      (filter === "all" ||
        (filter === "admins" && u.role === "ADMIN") ||
        (filter === "testers" && u.role === "MEMBER") ||
        (filter === "disabled" && u.active === false)) &&
      (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)),
  );

  async function setActive(user, active) {
    try {
      const { emails } = await update.mutateAsync({ id: user.id, active });
      emailToast(active ? `${user.name} can sign in again.` : `${user.name} was disabled and signed out.`, emails);
      setDisabling(null);
    } catch (err) {
      if (!active) return; // shown in the dialog
      toast.error(err.message);
    }
  }

  async function resendInvitation(user) {
    try {
      const { emails } = await resend.mutateAsync(user.id);
      emailToast(`New invitation for ${user.name}. The old link no longer works.`, emails);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function changeRole(user) {
    const role = user.role === "ADMIN" ? "MEMBER" : "ADMIN";
    try {
      await update.mutateAsync({ id: user.id, role });
      toast.success(`${user.name} is now ${role === "ADMIN" ? "an Admin" : "a Tester"}.`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  function handleAction(action, user) {
    if (action === "assign") navigate(userHref(user.id));
    if (action === "resend") resendInvitation(user);
    if (action === "reset") setResetting(user);
    if (action === "role") changeRole(user);
    if (action === "enable") setActive(user, true);
    if (action === "disable") {
      update.reset();
      setDisabling(user);
    }
    if (action === "remove") {
      remove.reset();
      setRemoving(user);
    }
  }

  async function confirmRemove() {
    try {
      const result = await remove.mutateAsync(removing.id);
      emailToast(`Removed ${removing.name}.`, result?.emails);
      setRemoving(null);
    } catch {
      /* Shown in the dialog. */
    }
  }

  let content;
  if (isPending) content = <LoadingState label="Loading users..." />;
  else if (isError) content = <ErrorState error={error} onRetry={refetch} />;
  else if (shown.length === 0) content = <EmptyState icon={term ? Search : Users} title={term ? "No matching users" : "No users here"} />;
  else {
    content = (
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">User</th>
              <th scope="col" className="px-4 py-3 font-medium">Role</th>
              <th scope="col" className="px-4 py-3 font-medium">Projects</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((user) => {
              const isMe = user.id === me.id;
              const status =
                user.status === "INVITED" && user.invitation === "EXPIRED"
                  ? { label: "Invitation expired", tone: "neutral" }
                  : STATUS[user.status] ?? STATUS.ACTIVE;
              return (
                <tr key={user.id} className={user.active !== false ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.name} muted={user.active === false} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {user.name}
                          {isMe && <span className="ml-1 text-xs font-normal text-slate-500">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-4 py-3 text-slate-600">
                    {user.role === "ADMIN" ? "All projects" : `${(user.projectIds?.length ?? 0)} of ${projectTotal}`}
                  </td>
                  <td className="px-4 py-3"><Badge tone={status.tone}>{status.label}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {isMe ? (
                        <span className="text-sm text-slate-500">You</span>
                      ) : (
                        <>
                          {user.active !== false ? (
                            <Link to={userHref(user.id)} className={linkAction} aria-label={`Assign projects to ${user.name}`}>
                              Assign projects
                            </Link>
                          ) : (
                            <button type="button" className={linkAction} onClick={() => setActive(user, true)} aria-label={`Enable ${user.name}`}>
                              Enable
                            </button>
                          )}
                          <RowMenu user={user} onAction={handleAction} />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage who can sign in and which projects each person can open."
        actions={<Button icon={UserPlus} onClick={() => setAdding(true)}>Add user</Button>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search users"
            placeholder="Search by name or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-2 focus:outline-indigo-600"
          />
        </div>
        <FilterChips
          label="Show users"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${counts.all})` },
            { value: "admins", label: `Admins (${counts.admins})` },
            { value: "testers", label: `Testers (${counts.testers})` },
            { value: "disabled", label: `Disabled (${counts.disabled})` },
          ]}
        />
      </div>

      {content}

      <p className="mt-3 text-xs text-slate-500">
        Row menu: Assign projects · Resend invitation · Reset password · Change role · Disable. An admin cannot
        disable or demote themselves. People get an email when they're invited, given or removed from a project,
        disabled, enabled or removed.
      </p>

      {adding && <AddUserModal onClose={() => setAdding(false)} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
      {disabling && (
        <ConfirmDialog
          title={`Disable ${disabling.name}?`}
          message={`${disabling.email} will be signed out and can't sign in until you enable the account again. Their work stays saved.`}
          confirmLabel="Disable"
          isPending={update.isPending}
          error={update.error?.message}
          onConfirm={() => setActive(disabling, false)}
          onCancel={() => setDisabling(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          message={`${removing.email} will be signed out and can no longer sign in. Projects and test cases are not affected.`}
          confirmLabel="Remove user"
          isPending={remove.isPending}
          error={remove.error?.message}
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
