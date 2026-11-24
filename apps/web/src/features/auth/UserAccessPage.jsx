import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/Button.jsx";
import { ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { Badge, Switch } from "../../components/ui/Switch.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import NotFoundPage from "../../app/NotFoundPage.jsx";
import { useProjects } from "../projects/hooks.js";
import { useCurrentUser, useUpdateUser, useUser } from "./auth.hooks.js";
import { formErrors } from "./AuthGate.jsx";
import { RolePicker } from "./UsersPage.jsx";

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function Card({ title, aside, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>{typeof title === "string" ? <h2 className="text-base font-semibold text-slate-900">{title}</h2> : title}</div>
        {aside}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// Admin: one person's profile, role, account state and project access.
export default function UserAccessPage() {
  const { userId } = useParams();
  const me = useCurrentUser();
  const user = useUser(userId);
  const projects = useProjects("");
  const update = useUpdateUser();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (user.data && form === null) {
      const { name, email, role, active, projectIds } = user.data;
      setForm({ name, email, role, active, projectIds: new Set(projectIds) });
    }
  }, [user.data, form]);

  if (me?.role !== "ADMIN") return <NotFoundPage />;
  if (user.isPending || projects.isPending || (user.data && form === null)) return <LoadingState label="Loading user..." />;
  if (user.isError) {
    return user.error.status === 404 ? <NotFoundPage /> : <ErrorState error={user.error} onRetry={() => user.refetch()} />;
  }
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => projects.refetch()} />;

  const isSelf = user.data.id === me.id;
  const isAdminRole = form.role === "ADMIN";
  const allProjects = projects.data.items;
  const assignedCount = allProjects.filter((p) => form.projectIds.has(p.id)).length;
  const { fields, message } = formErrors(update.error);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setProjects = (ids) => set("projectIds", new Set(ids));
  const toggleProject = (id, on) => {
    const next = new Set(form.projectIds);
    if (on) next.add(id);
    else next.delete(id);
    set("projectIds", next);
  };

  async function handleSave() {
    try {
      await update.mutateAsync({
        id: user.data.id,
        name: form.name.trim(),
        email: form.email.trim(),
        ...(isSelf ? {} : { role: form.role, active: form.active }),
        ...(isAdminRole ? {} : { projectIds: [...form.projectIds] }),
      });
      toast.success(`Saved access for ${form.name.trim()}.`);
      navigate("/users");
    } catch {
      /* Shown on the page. */
    }
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-slate-500">
        <Link to="/users" className="hover:text-indigo-700">Users</Link>
        <span aria-hidden="true"> / </span>
        <span>{user.data.name}</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Assign projects to {user.data.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdminRole
              ? "Admins open every project, so there is nothing to assign."
              : "They can only open the projects switched on below. Other projects appear locked for them."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate("/users")} disabled={update.isPending}>Cancel</Button>
          <Button onClick={handleSave} loading={update.isPending}>Save access</Button>
        </div>
      </div>

      {message && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <Card title="Profile">
            <div className="space-y-4">
              <TextField label="Full name" value={form.name} onChange={(e) => set("name", e.target.value)} error={fields.name} />
              <TextField
                label="Email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                error={fields.email}
              />
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">Role</p>
                <RolePicker value={form.role} onChange={(role) => set("role", role)} disabled={isSelf} />
              </div>
              <div className="flex items-center justify-between">
                <span id="account-active" className="text-sm font-medium text-slate-700">Account active</span>
                <Switch
                  checked={form.active}
                  onChange={(value) => set("active", value)}
                  label="Account active"
                  disabled={isSelf}
                />
              </div>
              {isSelf && <p className="text-xs text-slate-500">You can't change your own role or disable your own account.</p>}
            </div>
          </Card>
          <p className="mt-3 px-1 text-sm text-slate-500">
            Admins can open every project. Testers only open the projects assigned here.
          </p>
        </div>

        <Card
          title={
            <>
              <h2 className="text-base font-semibold text-slate-900">Project access</h2>
              <p className="text-sm text-slate-500">
                {isAdminRole ? "All projects (admin)" : `${assignedCount} of ${allProjects.length} projects assigned`}
              </p>
            </>
          }
          aside={
            !isAdminRole && (
              <span className="flex items-center gap-1.5 text-sm">
                <button type="button" className="text-slate-500 hover:text-indigo-700" onClick={() => setProjects(allProjects.map((p) => p.id))}>
                  Select all
                </button>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <button type="button" className="text-slate-500 hover:text-indigo-700" onClick={() => setProjects([])}>
                  Clear
                </button>
              </span>
            )
          }
        >
          {allProjects.length === 0 ? (
            <p className="text-sm text-slate-500">There are no projects yet.</p>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {allProjects.map((project) => {
                const on = isAdminRole || form.projectIds.has(project.id);
                return (
                  <li key={project.id} className="flex items-center gap-4 py-3">
                    <Switch
                      checked={on}
                      onChange={(value) => toggleProject(project.id, value)}
                      label={`Access to ${project.name}`}
                      disabled={isAdminRole}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-semibold ${on ? "text-slate-900" : "text-slate-500"}`}>{project.name}</span>
                      <span className="block text-xs text-slate-500">
                        {plural(project.testCaseCount ?? 0, "test case", "test cases")} · {plural(project.urlCount ?? 0, "URL", "URLs")}
                      </span>
                    </span>
                    {on ? <Badge tone="success">Assigned</Badge> : <Badge>No access</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {!isAdminRole && (
        <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Removing access applies on their next request: the server checks assignment on every project request, not
          only on this list.
        </p>
      )}
    </>
  );
}
