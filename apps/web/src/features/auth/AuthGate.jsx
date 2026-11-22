import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { useAuthStatus, useLogin, useSetup, useSignOutOnExpiredSession } from "./auth.hooks.js";

// Field errors from the server, plus a general message when there are none.
export function formErrors(err) {
  const { _: general, ...fields } = err?.fields ?? {};
  const message = general || (Object.keys(fields).length === 0 ? err?.message : null);
  return { fields, message };
}

function AuthCard({ title, description, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-slate-900">
          <FlaskConical className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          AI QA Studio
        </div>
        <main className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          <div className="mt-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

function FormAlert({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function LoginPage() {
  const login = useLogin();
  const [values, setValues] = useState({ email: "", password: "" });
  const { fields, message } = formErrors(login.error);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  function handleSubmit(event) {
    event.preventDefault();
    login.mutate({ email: values.email.trim(), password: values.password });
  }

  return (
    <AuthCard title="Sign in" description="Use the account your admin gave you.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={message} />
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          value={values.email}
          onChange={set("email")}
          error={fields.email}
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={set("password")}
          error={fields.password}
          required
        />
        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
        <p className="text-center text-xs text-slate-500">
          Forgot your password? Ask an admin to reset it.
        </p>
      </form>
    </AuthCard>
  );
}

export function SetupPage() {
  const setup = useSetup();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const { fields, message } = formErrors(setup.error);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  function handleSubmit(event) {
    event.preventDefault();
    const different = values.password !== values.confirm;
    setMismatch(different);
    if (different) return;
    setup.mutate({ name: values.name.trim(), email: values.email.trim(), password: values.password });
  }

  return (
    <AuthCard
      title="Create the admin account"
      description="This is the first sign-in for this app. The admin can then add the rest of the team."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={message} />
        <TextField label="Your name" autoComplete="name" value={values.name} onChange={set("name")} error={fields.name} />
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
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
          hint="At least 8 characters."
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={set("confirm")}
          error={mismatch ? "Passwords don't match" : undefined}
        />
        <Button type="submit" className="w-full" loading={setup.isPending}>
          Create admin and sign in
        </Button>
      </form>
    </AuthCard>
  );
}

// Shows the app only to a signed-in user; otherwise the first-run setup or
// the sign-in screen. The page you were on opens again after signing in.
export function AuthGate({ children }) {
  useSignOutOnExpiredSession();
  const status = useAuthStatus();

  if (status.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingState label="Loading..." />
      </div>
    );
  }

  if (status.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <ErrorState error={status.error} onRetry={() => status.refetch()} title="Can't reach AI QA Studio" />
      </div>
    );
  }

  if (status.data.setupRequired) return <SetupPage />;
  if (!status.data.user) return <LoginPage />;
  return children;
}
