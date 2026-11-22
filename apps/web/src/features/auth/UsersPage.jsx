import { KeyRound, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button, IconButton } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import NotFoundPage from "../../app/NotFoundPage.jsx";
import {
  useCreateUser,
  useCurrentUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from "./auth.hooks.js";
import { formErrors } from "./AuthGate.jsx";

const ROLE_LABELS = { ADMIN: "Admin", MEMBER: "Member" };

function RoleSelect({ value, onChange, disabled }) {
  return (
    <div>
      <label htmlFor="user-role" className="block text-sm font-medium text-slate-700">Role</label>
      <select
        id="user-role"
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-2 focus:outline-indigo-600"
      >
        <option value="MEMBER">Member: works on all projects</option>
        <option value="ADMIN">Admin: also manages users</option>
      </select>
    </div>
  );
}

function FormAlert({ message }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}

// Add a user (user === undefined) or edit a user's name and role.
function UserFormModal({ user, onClose }) {
  const isEdit = Boolean(user);
  const create = useCreateUser();
  const update = useUpdateUser();
  const mutation = isEdit ? update : create;
  const toast = useToast();
  const [values, setValues] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    password: "",
    role: user?.role ?? "MEMBER",
  });
  const { fields, message } = formErrors(mutation.error);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync({ id: user.id, name: values.name.trim(), role: values.role });
        toast.success(`Saved ${values.name.trim()}.`);
      } else {
        await create.mutateAsync({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          role: values.role,
        });
        toast.success(`Added ${values.name.trim()}. Give them their email and password to sign in.`);
      }
      onClose();
    } catch {
      /* Shown in the form. */
    }
  }

  return (
    <Modal title={isEdit ? "Edit user" : "Add user"} onClose={mutation.isPending ? () => {} : onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={message} />
        <TextField label="Name" value={values.name} onChange={set("name")} error={fields.name} />
        {!isEdit && (
          <>
            <TextField
              label="Email"
              type="email"
              autoComplete="off"
              value={values.email}
              onChange={set("email")}
              error={fields.email}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              value={values.password}
              onChange={set("password")}
              error={fields.password}
              hint="At least 8 characters. They can change it after signing in."
            />
          </>
        )}
        <RoleSelect value={values.role} onChange={set("role")} disabled={mutation.isPending} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>{isEdit ? "Save changes" : "Add user"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }) {
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

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export default function UsersPage() {
  const me = useCurrentUser();
  const { data, isPending, isError, error, refetch } = useUsers();
  const remove = useDeleteUser();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [removing, setRemoving] = useState(null);

  if (me?.role !== "ADMIN") return <NotFoundPage />;

  async function confirmRemove() {
    try {
      await remove.mutateAsync(removing.id);
      toast.success(`Removed ${removing.name}.`);
      setRemoving(null);
    } catch {
      /* Shown in the dialog. */
    }
  }

  const users = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone here can sign in and work on all projects. Admins can also manage users."
        actions={<Button icon={UserPlus} onClick={() => setAdding(true)}>Add user</Button>}
      />

      {isPending ? (
        <LoadingState label="Loading users..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Email</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Added</th>
                <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const isMe = user.id === me.id;
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {user.name}
                      {isMe && <span className="ml-1 text-xs font-normal text-slate-500">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.role === "ADMIN" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Pencil} label={`Edit ${user.name}`} onClick={() => setEditing(user)} />
                        <IconButton
                          icon={KeyRound}
                          label={`Reset password for ${user.name}`}
                          onClick={() => setResetting(user)}
                        />
                        {!isMe && (
                          <IconButton
                            icon={Trash2}
                            label={`Remove ${user.name}`}
                            onClick={() => {
                              remove.reset();
                              setRemoving(user);
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && <UserFormModal onClose={() => setAdding(false)} />}
      {editing && <UserFormModal user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
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
