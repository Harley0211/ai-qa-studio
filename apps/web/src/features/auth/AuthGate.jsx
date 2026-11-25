import { Check, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PROJECTS_PATH } from "../tools/paths.js";
import { Button } from "../../components/ui/Button.jsx";
import { ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import {
  useAuthStatus,
  useClearSignedOut,
  useLogin,
  useRegister,
  useSetup,
  useSignOutOnExpiredSession,
} from "./auth.hooks.js";
import { useIdleSignOut } from "./useIdleSignOut.js";

// Field errors from the server, plus a general message when there are none.
export function formErrors(err) {
  const { _: general, ...fields } = err?.fields ?? {};
  const message = general || (Object.keys(fields).length === 0 ? err?.message : null);
  return { fields, message };
}

function Brand() {
  return (
    <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
      <img src="/logo.png" alt="" aria-hidden="true" className="h-9 w-9 rounded-xl" />
      AI QA Studio
    </div>
  );
}

// Two panels: what the app does on the left (wide screens), the form on the right.
export function AuthLayout({ headline, text, points, children }) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-[44%] flex-col justify-between border-r border-slate-200 bg-white px-12 py-12 lg:flex">
        <Brand />
        <div>
          <p className="text-4xl font-bold leading-tight tracking-tight text-slate-900">{headline}</p>
          <p className="mt-4 max-w-md text-base text-slate-500">{text}</p>
          {points && (
            <ul className="mt-8 space-y-3 text-sm text-slate-600">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-slate-400">Runs locally on your computer</p>
      </aside>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function FormTitle({ title, description }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
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

const linkButton = "font-medium text-indigo-600 underline-offset-2 hover:underline";

const SIGN_IN_POINTS = [
  "Image evidence to test cases",
  "PRD and documents to test cases",
  "Bug reports and HAR reading per project",
];

export function LoginPage({ signupAllowed, onCreateAccount, onForgotPassword }) {
  const login = useLogin();
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "", remember: true });
  const { fields, message } = formErrors(login.error);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  function handleSubmit(event) {
    event.preventDefault();
    // After signing in, everyone starts by choosing a project.
    login.mutate(
      { email: values.email.trim(), password: values.password, remember: values.remember },
      { onSuccess: () => navigate(PROJECTS_PATH, { replace: true }) },
    );
  }

  return (
    <AuthLayout
      headline="Turn screenshots and PRDs into test cases."
      text="Generate, review, run and export test cases for every project in one place."
      points={SIGN_IN_POINTS}
    >
      <FormTitle title="Sign in" description="Welcome back. Enter your details to continue." />
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={message} />
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          placeholder="you@company.com"
          value={values.email}
          onChange={set("email")}
          error={fields.email}
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={values.password}
          onChange={set("password")}
          error={fields.password}
          required
        />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={values.remember}
              onChange={(event) => setValues((v) => ({ ...v, remember: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
            />
            Remember me
          </label>
          <button type="button" className={linkButton} onClick={onForgotPassword}>
            Forgot password?
          </button>
        </div>
        <Button type="submit" className="w-full py-2.5" loading={login.isPending}>
          Sign in
        </Button>
        {signupAllowed && (
          <p className="text-center text-sm text-slate-500">
            No account yet?{" "}
            <button type="button" className={linkButton} onClick={onCreateAccount}>
              Create an account
            </button>
          </p>
        )}
      </form>
    </AuthLayout>
  );
}

export function RegisterPage({ onSignIn }) {
  const register = useRegister();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirm: "", storedLocally: false });
  const [submitted, setSubmitted] = useState(false);
  const { fields, message } = formErrors(register.error);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  const longEnough = values.password.length >= 8;
  const mismatch = values.confirm !== "" && values.confirm !== values.password;
  const needsConsent = submitted && !values.storedLocally;

  function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
    if (!longEnough || values.confirm !== values.password || !values.storedLocally) return;
    register.mutate(
      { name: values.name.trim(), email: values.email.trim(), password: values.password, storedLocally: true },
      { onSuccess: () => navigate(PROJECTS_PATH, { replace: true }) },
    );
  }

  return (
    <AuthLayout
      headline="Create your workspace."
      text="Projects, evidence, documents and test cases stay organised under your account. An admin gives you access to your team's projects."
    >
      <FormTitle title="Create account" description="Start organising your QA work in minutes." />
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={message} />
        <TextField
          label="Full name"
          autoComplete="name"
          placeholder="Your name"
          value={values.name}
          onChange={set("name")}
          error={fields.name}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          placeholder="you@company.com"
          value={values.email}
          onChange={set("email")}
          error={fields.email}
        />
        <div>
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={values.password}
            onChange={set("password")}
            error={fields.password ?? (submitted && !longEnough ? "Password must be at least 8 characters" : undefined)}
          />
          {!fields.password && !(submitted && !longEnough) && (
            <p className={`mt-1 text-xs ${longEnough ? "text-green-600" : "text-slate-500"}`}>At least 8 characters</p>
          )}
        </div>
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={values.confirm}
          onChange={set("confirm")}
          error={mismatch || (submitted && values.confirm !== values.password) ? "Passwords do not match" : undefined}
        />
        <div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.storedLocally}
              onChange={(event) => setValues((v) => ({ ...v, storedLocally: event.target.checked }))}
              aria-invalid={needsConsent ? "true" : undefined}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
            />
            I understand my data is stored locally
          </label>
          {(needsConsent || fields.storedLocally) && (
            <p className="mt-1 text-sm text-red-600">Please tick this box to continue.</p>
          )}
        </div>
        <Button type="submit" className="w-full py-2.5" loading={register.isPending}>
          Create account
        </Button>
        <p className="text-center text-sm text-slate-500">
          Already registered?{" "}
          <button type="button" className={linkButton} onClick={onSignIn}>
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}

// There is no email service: an admin sets a new password on the Users page.
export function ForgotPasswordPage({ onBack }) {
  return (
    <AuthLayout headline="Locked out?" text="It happens. An admin can set a new password for you in a minute.">
      <FormTitle title="Forgot password" />
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          Ask an admin of AI QA Studio to reset your password: they open <strong>Users</strong>, find your name and
          choose <strong>Reset password</strong>.
        </p>
        <p>Then sign in with the new password and change it under <strong>Account settings</strong>.</p>
        <Button className="w-full py-2.5" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    </AuthLayout>
  );
}

export function SignedOutPage({ reason, onSignIn }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
      <main className="w-full max-w-md text-center">
        <p className="flex items-center justify-center gap-2 text-lg font-semibold text-slate-900">
          <img src="/logo.png" alt="" aria-hidden="true" className="h-9 w-9 rounded-xl" />
          AI QA Studio
        </p>
        <span className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-7 w-7 text-green-600" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">You are signed out</h1>
        {reason === "idle" && (
          <p role="status" className="mx-auto mt-3 max-w-sm rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            You were signed out after 30 minutes without activity.
          </p>
        )}
        <p className="mt-3 text-slate-500">Thanks for testing. Sign in again any time to pick up where you left off.</p>
        <Button className="mt-6 w-full py-2.5" onClick={onSignIn}>
          Sign in again
        </Button>
      </main>
    </div>
  );
}

export function SetupPage() {
  const setup = useSetup();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirm: "" });
  const [mismatch, setMismatch] = useState(false);
  const { fields, message } = formErrors(setup.error);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  function handleSubmit(event) {
    event.preventDefault();
    const different = values.password !== values.confirm;
    setMismatch(different);
    if (different) return;
    setup.mutate(
      { name: values.name.trim(), email: values.email.trim(), password: values.password },
      { onSuccess: () => navigate(PROJECTS_PATH, { replace: true }) },
    );
  }

  return (
    <AuthLayout headline="Welcome to AI QA Studio." text="Create the admin account. The admin adds projects and decides who can open them.">
      <FormTitle
        title="Create the admin account"
        description="This is the first sign-in for this app. The admin can then add the rest of the team."
      />
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
        <Button type="submit" className="w-full py-2.5" loading={setup.isPending}>
          Create admin and sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

function SignedOutScreens({ status }) {
  const [view, setView] = useState("login");
  const clearSignedOut = useClearSignedOut();

  if (status.signedOut) {
    return (
      <SignedOutPage
        reason={status.signedOut}
        onSignIn={() => {
          setView("login");
          clearSignedOut();
        }}
      />
    );
  }
  if (view === "register" && status.signupAllowed) return <RegisterPage onSignIn={() => setView("login")} />;
  if (view === "forgot") return <ForgotPasswordPage onBack={() => setView("login")} />;
  return (
    <LoginPage
      signupAllowed={status.signupAllowed}
      onCreateAccount={() => setView("register")}
      onForgotPassword={() => setView("forgot")}
    />
  );
}

function SignedIn({ remember, children }) {
  // Without "Remember me", 30 minutes without activity signs you out.
  useIdleSignOut(remember === false);
  return children;
}

// Shows the app only to a signed-in user; otherwise the first-run setup or
// the sign-in screens. After signing in, the project picker opens.
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
  if (!status.data.user) return <SignedOutScreens status={status.data} />;
  return <SignedIn remember={status.data.remember}>{children}</SignedIn>;
}
