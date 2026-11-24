import { Mail, RotateCw } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { Badge } from "../../components/ui/Switch.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import NotFoundPage from "../../app/NotFoundPage.jsx";
import { useCurrentUser, useEmails, useRetryEmail } from "../auth/auth.hooks.js";

const KIND_LABELS = {
  INVITATION: "Invitation",
  WELCOME: "Welcome",
  PROJECTS_ADDED: "Project access added",
  PROJECTS_REMOVED: "Project access removed",
  ACCOUNT_DISABLED: "Account disabled",
  ACCOUNT_ENABLED: "Account enabled",
  ACCOUNT_REMOVED: "Account removed",
};

const STATUS = {
  SENT: { label: "Sent", tone: "success" },
  FAILED: { label: "Failed", tone: "warning" },
  SKIPPED: { label: "Not sent", tone: "neutral" },
  PENDING: { label: "Sending", tone: "accent" },
};

const when = (value) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

// Admin → Emails: every email the app sent or tried to send.
export default function EmailsPage() {
  const me = useCurrentUser();
  const { data, isPending, isError, error, refetch } = useEmails();
  const retry = useRetryEmail();
  const toast = useToast();

  if (me?.role !== "ADMIN") return <NotFoundPage />;

  async function handleRetry(email) {
    try {
      const { data: result } = await retry.mutateAsync(email.id);
      if (result.status === "SENT") toast.success(`Sent to ${email.to}.`);
      else toast.error(`Still not sent: ${result.error}`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  let content;
  if (isPending) content = <LoadingState label="Loading emails..." />;
  else if (isError) content = <ErrorState error={error} onRetry={refetch} />;
  else if (data.items.length === 0) {
    content = (
      <EmptyState
        icon={Mail}
        title="No emails yet"
        description="Invitations and messages about project access and accounts will appear here."
      />
    );
  } else {
    content = (
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">To</th>
              <th scope="col" className="px-4 py-3 font-medium">Email</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">When</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((email) => {
              const status = STATUS[email.status] ?? STATUS.PENDING;
              return (
                <tr key={email.id}>
                  <td className="px-4 py-3 text-slate-700">{email.to}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{KIND_LABELS[email.kind] ?? email.kind}</p>
                    <p className="text-xs text-slate-500">{email.subject}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {email.error && email.status !== "SENT" && (
                      <p className="mt-1 max-w-xs text-xs text-slate-500">{email.error}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {when(email.sentAt ?? email.createdAt)}
                    {email.attempts > 1 && <span className="block text-xs">{email.attempts} tries</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {email.status !== "SENT" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={RotateCw}
                        aria-label={`Retry email to ${email.to}`}
                        loading={retry.isPending && retry.variables === email.id}
                        onClick={() => handleRetry(email)}
                      >
                        Retry
                      </Button>
                    )}
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
        title="Emails"
        description="Invitations and the messages people get about project access and their account."
      />
      {data && !data.configured && (
        <p role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Email isn't set up yet, so these emails were recorded but not sent. Connect Gmail in n8n and fill in
          <code className="mx-1">EMAIL_FROM</code>in <code>apps/server/.env</code> (see the README, "Emails"), then use Retry.
        </p>
      )}
      {content}
    </>
  );
}
