import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { ROLE_LABELS, useChangePassword, useCurrentUser, useLogout } from "./auth.hooks.js";
import { formErrors } from "./AuthGate.jsx";

export const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

export function Avatar({ name, muted = false, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        muted ? "bg-slate-100 text-slate-400" : "bg-indigo-100 text-indigo-700"
      } ${className}`}
    >
      {initials(name)}
    </span>
  );
}

// Your account: who you are, and a new password.
function AccountSettingsModal({ user, onClose }) {
  const change = useChangePassword();
  const toast = useToast();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const { fields, message } = formErrors(change.error);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const different = values.newPassword !== values.confirm;
    setMismatch(different);
    if (different) return;

    try {
      await change.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success("Password changed. Other browsers were signed out.");
      onClose();
    } catch {
      /* Shown in the form. */
    }
  }

  return (
    <Modal title="Account settings" onClose={change.isPending ? () => {} : onClose}>
      <div className="mb-5 flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3">
        <Avatar name={user.name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-500">
            {user.email} · {ROLE_LABELS[user.role] ?? user.role}
          </p>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        {user.role === "ADMIN"
          ? "Admins open every project and manage users."
          : "You can open the projects an admin assigned to you. Ask an admin to change your name, email or projects."}
      </p>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Change password</h3>
        {message && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
        )}
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={set("currentPassword")}
          error={fields.currentPassword}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={set("newPassword")}
          error={fields.newPassword}
          hint="At least 8 characters."
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={set("confirm")}
          error={mismatch ? "Passwords don't match" : undefined}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={change.isPending}>Close</Button>
          <Button type="submit" loading={change.isPending}>Change password</Button>
        </div>
      </form>
    </Modal>
  );
}

function SignOutDialog({ onClose }) {
  const logout = useLogout();
  return (
    <Modal title="Sign out of AI QA Studio?" onClose={logout.isPending ? () => {} : onClose}>
      <p className="text-sm text-slate-600">
        Your projects, evidence and test cases stay saved. Unsent chat drafts on this device are cleared.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={logout.isPending}>Cancel</Button>
        <Button loading={logout.isPending} onClick={() => logout.mutate("manual")}>Sign out</Button>
      </div>
    </Modal>
  );
}

// Who is signed in, with account settings and sign-out (sidebar footer).
export function AccountMenu() {
  const user = useCurrentUser();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;
  const role = ROLE_LABELS[user.role] ?? user.role;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label={`Account settings for ${user.name}`}
        className="live-account flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-indigo-600"
      >
        <Avatar name={user.name} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">{user.name}</span>
          <span className="block truncate text-xs text-slate-500">
            {role} · Account settings
          </span>
        </span>
      </button>
      <Button variant="ghost" size="sm" icon={LogOut} onClick={() => setSigningOut(true)}>
        Sign out
      </Button>
      {settingsOpen && <AccountSettingsModal user={user} onClose={() => setSettingsOpen(false)} />}
      {signingOut && <SignOutDialog onClose={() => setSigningOut(false)} />}
    </div>
  );
}
