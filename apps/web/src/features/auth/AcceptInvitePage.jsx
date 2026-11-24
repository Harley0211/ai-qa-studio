import { MailX } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/Button.jsx";
import { LoadingState } from "../../components/ui/States.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { PROJECTS_PATH } from "../tools/paths.js";
import { ROLE_LABELS, useAcceptInvitation, useInvitation } from "./auth.hooks.js";
import { AuthLayout, FormTitle, formErrors } from "./AuthGate.jsx";

// /invite/<token>: from the invitation email. Choose a password, then you're in.
export default function AcceptInvitePage() {
  const { token } = useParams();
  const invitation = useInvitation(token);
  const accept = useAcceptInvitation(token);
  const navigate = useNavigate();
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [submitted, setSubmitted] = useState(false);
  const { fields, message } = formErrors(accept.error);

  if (invitation.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingState label="Opening your invitation..." />
      </div>
    );
  }

  if (invitation.isError) {
    return (
      <AuthLayout headline="This link has expired." text="Invitation links work once and only for 7 days.">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <MailX className="h-7 w-7 text-amber-700" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">This invitation can't be used</h1>
          <p className="mt-3 text-sm text-slate-500">
            {invitation.error.status === 404
              ? invitation.error.message
              : "We couldn't check this invitation. Try again in a moment."}
          </p>
          <Button className="mt-6 w-full py-2.5" onClick={() => navigate(PROJECTS_PATH)}>
            Go to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const { name, email, role } = invitation.data;
  const longEnough = values.password.length >= 8;
  const mismatch = values.confirm !== "" && values.confirm !== values.password;

  function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
    if (!longEnough || values.password !== values.confirm) return;
    accept.mutate(values.password, { onSuccess: () => navigate(PROJECTS_PATH, { replace: true }) });
  }

  return (
    <AuthLayout
      headline={`Welcome, ${name.split(" ")[0]}.`}
      text="Choose a password to finish setting up your account. You'll see the projects your admin assigned to you."
    >
      <FormTitle title="Accept your invitation" description={`You're joining AI QA Studio as a ${ROLE_LABELS[role] ?? role}.`} />
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {message && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
        )}
        <TextField label="Email" type="email" value={email} readOnly autoComplete="username" />
        <TextField
          label="Choose a password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={values.password}
          onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
          error={fields.password ?? (submitted && !longEnough ? "Password must be at least 8 characters" : undefined)}
          hint="At least 8 characters."
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => setValues((v) => ({ ...v, confirm: e.target.value }))}
          error={mismatch || (submitted && values.confirm !== values.password) ? "Passwords do not match" : undefined}
        />
        <Button type="submit" className="w-full py-2.5" loading={accept.isPending}>
          Set password and sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
