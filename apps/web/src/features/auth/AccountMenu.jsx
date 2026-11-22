import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useChangePassword, useCurrentUser, useLogout } from "./auth.hooks.js";
import { formErrors } from "./AuthGate.jsx";

function ChangePasswordModal({ onClose }) {
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
    <Modal title="Change password" onClose={change.isPending ? () => {} : onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
          <Button variant="secondary" onClick={onClose} disabled={change.isPending}>Cancel</Button>
          <Button type="submit" loading={change.isPending}>Change password</Button>
        </div>
      </form>
    </Modal>
  );
}

// Who is signed in, with password change and sign-out (sidebar footer).
export function AccountMenu() {
  const user = useCurrentUser();
  const logout = useLogout();
  const [changing, setChanging] = useState(false);

  if (!user) return null;

  return (
    <div className="space-y-2">
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-900">
          <span className="truncate">{user.name}</span>
          {user.role === "ADMIN" && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">Admin</span>
          )}
        </p>
        <p className="truncate text-xs text-slate-500">{user.email}</p>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setChanging(true)}>
          Password
        </Button>
        <Button variant="ghost" size="sm" icon={LogOut} loading={logout.isPending} onClick={() => logout.mutate()}>
          Sign out
        </Button>
      </div>
      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
    </div>
  );
}
